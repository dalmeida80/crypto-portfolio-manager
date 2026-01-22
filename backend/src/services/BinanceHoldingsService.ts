import axios from 'axios';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { Trade } from '../entities/Trade';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountResponse {
  balances: BinanceBalance[];
}

interface SimpleEarnPosition {
  asset: string;
  totalAmount: string;
}

interface SaveingsPosition {
  asset: string;
  amount: string;
}

export class BinanceHoldingsService {
  private baseUrl = 'https://api.binance.com';

  /**
   * Sync current Binance holdings to portfolio
   * Creates synthetic BUY trades to reflect current balances
   */
  async syncHoldings(portfolioId: string, userId: string): Promise<{
    success: boolean;
    synced: number;
    assets: string[];
    message: string;
  }> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
    const tradeRepo = AppDataSource.getRepository(Trade);

    // Verify portfolio ownership
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, user: { id: userId } },
      relations: ['user']
    });

    if (!portfolio) {
      throw new Error('Portfolio not found');
    }

    // Get Binance API keys for this user
    const apiKeys = await apiKeyRepo.find({
      where: { user: { id: userId }, exchange: 'binance', isActive: true }
    });

    if (apiKeys.length === 0) {
      throw new Error('No active Binance API keys found');
    }

    const syncedAssets: string[] = [];
    let totalSynced = 0;

    for (const apiKey of apiKeys) {
      try {
        // Fetch all holdings from different Binance products
        const [spotBalances, earnBalances, savingsBalances] = await Promise.all([
          this.getSpotBalances(apiKey.apiKey, apiKey.apiSecret),
          this.getSimpleEarnBalances(apiKey.apiKey, apiKey.apiSecret),
          this.getSavingsBalances(apiKey.apiKey, apiKey.apiSecret)
        ]);

        // Combine all balances
        const combinedBalances = this.combineBalances(spotBalances, earnBalances, savingsBalances);

        // Delete existing holdings sync trades
        await tradeRepo.delete({
          portfolio: { id: portfolioId },
          source: 'binance-sync',
        });

        // Create new synthetic trades for current holdings
        const now = new Date();
        for (const [asset, amount] of Object.entries(combinedBalances)) {
          if (amount > 0.00001) { // Ignore dust
            const symbol = asset + 'USDT'; // Assume USDT pairs
            
            // Create synthetic BUY trade
            const trade = tradeRepo.create({
              portfolio,
              symbol,
              type: 'BUY',
              quantity: amount,
              price: 0, // Will be updated by price service
              fee: 0,
              total: 0,
              executedAt: now,
              source: 'binance-sync',
              notes: `Holdings sync - ${asset}: ${amount}`,
            });

            await tradeRepo.save(trade);
            syncedAssets.push(asset);
            totalSynced++;
          }
        }
      } catch (error: any) {
        console.error(`Error syncing holdings for API key ${apiKey.id}:`, error.message);
      }
    }

    return {
      success: true,
      synced: totalSynced,
      assets: syncedAssets,
      message: `Synced ${totalSynced} holdings from Binance`
    };
  }

  /**
   * Get Spot wallet balances
   */
  private async getSpotBalances(apiKey: string, apiSecret: string): Promise<Record<string, number>> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

      const response = await axios.get<BinanceAccountResponse>(
        `${this.baseUrl}/api/v3/account?${queryString}&signature=${signature}`,
        {
          headers: { 'X-MBX-APIKEY': apiKey },
          timeout: 10000
        }
      );

      const balances: Record<string, number> = {};
      for (const balance of response.data.balances) {
        const total = parseFloat(balance.free) + parseFloat(balance.locked);
        if (total > 0) {
          balances[balance.asset] = total;
        }
      }

      return balances;
    } catch (error: any) {
      console.error('Error fetching Spot balances:', error.message);
      return {};
    }
  }

  /**
   * Get Simple Earn (Flexible) balances
   */
  private async getSimpleEarnBalances(apiKey: string, apiSecret: string): Promise<Record<string, number>> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

      const response = await axios.get(
        `${this.baseUrl}/sapi/v1/simple-earn/flexible/position?${queryString}&signature=${signature}`,
        {
          headers: { 'X-MBX-APIKEY': apiKey },
          timeout: 10000
        }
      );

      const balances: Record<string, number> = {};
      const positions = response.data.rows || [];
      
      for (const position of positions) {
        const amount = parseFloat(position.totalAmount || '0');
        if (amount > 0) {
          balances[position.asset] = amount;
        }
      }

      return balances;
    } catch (error: any) {
      console.warn('Simple Earn not available or error:', error.message);
      return {};
    }
  }

  /**
   * Get Savings balances (legacy)
   */
  private async getSavingsBalances(apiKey: string, apiSecret: string): Promise<Record<string, number>> {
    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex');

      const response = await axios.get(
        `${this.baseUrl}/sapi/v1/lending/union/account?${queryString}&signature=${signature}`,
        {
          headers: { 'X-MBX-APIKEY': apiKey },
          timeout: 10000
        }
      );

      const balances: Record<string, number> = {};
      const positions = response.data.positionAmountVos || [];
      
      for (const position of positions) {
        const amount = parseFloat(position.amount || '0');
        if (amount > 0) {
          balances[position.asset] = amount;
        }
      }

      return balances;
    } catch (error: any) {
      console.warn('Savings not available or error:', error.message);
      return {};
    }
  }

  /**
   * Combine balances from different products
   */
  private combineBalances(
    spot: Record<string, number>,
    earn: Record<string, number>,
    savings: Record<string, number>
  ): Record<string, number> {
    const combined: Record<string, number> = { ...spot };

    // Add Earn balances
    for (const [asset, amount] of Object.entries(earn)) {
      combined[asset] = (combined[asset] || 0) + amount;
    }

    // Add Savings balances
    for (const [asset, amount] of Object.entries(savings)) {
      combined[asset] = (combined[asset] || 0) + amount;
    }

    return combined;
  }
}
