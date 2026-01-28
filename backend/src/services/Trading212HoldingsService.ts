import { AppDataSource } from '../index';
import { Trade } from '../entities/Trade';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { Trading212ApiService } from './trading212ApiService';

export class Trading212HoldingsService {
  /**
   * Sync current Trading212 holdings to portfolio
   * Creates synthetic BUY trades to reflect current portfolio positions
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

    // Get Trading212 API keys for this user
    const apiKeys = await apiKeyRepo.find({
      where: { user: { id: userId }, exchange: 'trading212', isActive: true }
    });

    if (apiKeys.length === 0) {
      throw new Error('No active Trading212 API keys found');
    }

    const syncedAssets: string[] = [];
    let totalSynced = 0;

    for (const apiKey of apiKeys) {
      try {
        const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';
        const trading212 = await Trading212ApiService.createFromApiKey(apiKey, environment);

        // Fetch current portfolio holdings
        const holdings = await trading212.getPortfolio();

        console.log(`[Trading212 Sync] Found ${holdings.length} holdings`);

        // Delete existing holdings sync trades for this portfolio
        await tradeRepo.delete({
          portfolio: { id: portfolioId },
          source: 'trading212-sync',
        });

        // Create new synthetic trades for current holdings
        const now = new Date();
        
        for (const holding of holdings) {
          if (holding.quantity > 0) {
            // Extract symbol without suffix (e.g., TSLA_US_EQ -> TSLA)
            const cleanSymbol = holding.ticker.replace(/_US_EQ$|_UK_EQ$|_DE_EQ$|_NL_EQ$/i, '');
            
            // Create synthetic BUY trade
            const trade = tradeRepo.create({
              portfolio,
              symbol: cleanSymbol,
              type: 'BUY',
              quantity: holding.quantity,
              price: holding.averagePrice,
              fee: 0,
              total: holding.quantity * holding.averagePrice,
              executedAt: now,
              source: 'trading212-sync',
              notes: `Holdings sync - ${cleanSymbol}: ${holding.quantity} @ ${holding.averagePrice} (P/L: ${holding.ppl.toFixed(2)})`,
            });

            await tradeRepo.save(trade);
            syncedAssets.push(cleanSymbol);
            totalSynced++;
          }
        }

        console.log(`[Trading212 Sync] Synced ${totalSynced} holdings`);
      } catch (error: any) {
        console.error(`Error syncing holdings for API key ${apiKey.id}:`, error.message);
        throw error;
      }
    }

    return {
      success: true,
      synced: totalSynced,
      assets: syncedAssets,
      message: `Synced ${totalSynced} holdings from Trading212`
    };
  }
}
