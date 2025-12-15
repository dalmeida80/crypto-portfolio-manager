import { Spot } from '@binance/connector';
import { decrypt } from '../utils/encryption';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

export class BinanceService {
  private client: any;

  constructor(apiKey: string, apiSecret: string) {
    this.client = new Spot(apiKey, apiSecret);
  }

  static async createFromApiKey(exchangeApiKey: ExchangeApiKey): Promise<BinanceService> {
    const apiKey = decrypt(exchangeApiKey.apiKey);
    const apiSecret = decrypt(exchangeApiKey.apiSecret);
    return new BinanceService(apiKey, apiSecret);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.account();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Add delay to avoid rate limits
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getAccountBalances(): Promise<any[]> {
    try {
      const response = await this.client.account();
      return response.data.balances.filter((balance: any) => 
        parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
      );
    } catch (error) {
      throw new Error(`Failed to fetch balances: ${error}`);
    }
  }

  /**
   * Get all orders (filled) for a symbol - more complete than myTrades
   */
  async getAllOrders(symbol: string, startTime?: number): Promise<any[]> {
    try {
      const params: any = { limit: 1000 };
      if (startTime) {
        params.startTime = startTime;
      }
      const response = await this.client.allOrders(symbol, params);
      // Filter only filled orders
      return response.data.filter((order: any) => order.status === 'FILLED');
    } catch (error) {
      // Symbol might not exist or no orders
      return [];
    }
  }

  /**
   * Get trade history for a specific symbol
   */
  async getTradeHistory(symbol: string, limit: number = 1000): Promise<any[]> {
    try {
      const response = await this.client.myTrades(symbol, { limit });
      return response.data;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get ALL trading symbols from exchange info
   */
  async getAllTradingSymbols(): Promise<string[]> {
    try {
      const response = await this.client.exchangeInfo();
      return response.data.symbols
        .filter((s: any) => s.status === 'TRADING')
        .map((s: any) => s.symbol);
    } catch (error) {
      console.error('Failed to get exchange info:', error);
      return [];
    }
  }

  /**
   * Get ALL trades across ALL symbols (OPTIMIZED for rate limits)
   * Only checks pairs where you have/had balance > 0
   */
  async getAllMyTrades(startTime?: number): Promise<any[]> {
    try {
      console.log('=== OPTIMIZED IMPORT - Fetching account info ===');
      
      // Get account to see which assets we have/had with balance
      const accountInfo = await this.client.account();
      
      // Filter assets with balance > 0 (free or locked)
      const assetsWithBalance = accountInfo.data.balances
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => b.asset);
      
      console.log(`Found ${assetsWithBalance.length} assets with balance > 0:`, assetsWithBalance.join(', '));
      
      // Generate possible trading pairs ONLY for assets with balance
      const quoteAssets = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'FDUSD', 'TUSD'];
      const symbols = new Set<string>();
      
      for (const asset of assetsWithBalance) {
        // Skip if asset is already a quote asset
        if (quoteAssets.includes(asset)) {
          continue;
        }
        
        // Add pairs with all quote assets
        for (const quote of quoteAssets) {
          symbols.add(`${asset}${quote}`);
        }
      }

      console.log(`Generated ${symbols.size} potential trading pairs to check`);
      console.log('Starting trade fetch with rate limit protection...');
      
      let allTrades: any[] = [];
      let symbolsWithTrades = 0;
      let symbolsChecked = 0;
      let rateLimitDelay = 100; // Start with 100ms delay
      
      // Fetch trades for each symbol with rate limit protection
      for (const symbol of Array.from(symbols)) {
        try {
          const params: any = { limit: 1000 };
          if (startTime) {
            params.startTime = startTime;
          }
          
          const response = await this.client.myTrades(symbol, params);
          
          if (response.data && response.data.length > 0) {
            allTrades = allTrades.concat(response.data);
            symbolsWithTrades++;
            console.log(`✓ ${symbol}: ${response.data.length} trades`);
          }
          
          symbolsChecked++;
          
          // Add delay to avoid rate limits (100ms between requests)
          await this.delay(rateLimitDelay);
          
        } catch (error: any) {
          symbolsChecked++;
          
          // Check for rate limit error
          if (error.response?.status === 418 || error.response?.status === 429) {
            console.error('⚠️  Rate limit hit! Stopping import.');
            console.error(`Checked ${symbolsChecked}/${symbols.size} symbols before rate limit`);
            throw new Error('Rate limit exceeded. Please wait a few minutes and try again.');
          }
          
          // Symbol doesn't exist or no trades - this is normal
          if (!error.message?.includes('Invalid symbol')) {
            // Only log every 10th symbol to reduce noise
            if (symbolsChecked % 10 === 0) {
              console.log(`  Checked ${symbolsChecked}/${symbols.size} symbols...`);
            }
          }
        }
      }
      
      console.log(`\n=== FETCH COMPLETE ===`);
      console.log(`Checked ${symbolsChecked} symbols`);
      console.log(`Found trades in ${symbolsWithTrades} symbols`);
      console.log(`Total trades fetched: ${allTrades.length}`);
      
      return allTrades;
      
    } catch (error) {
      console.error('Failed to fetch all trades:', error);
      throw error;
    }
  }

  /**
   * Get deposit history
   */
  async getDepositHistory(startTime?: number): Promise<any[]> {
    try {
      console.log('Fetching deposit history...');
      const params: any = {};
      if (startTime) {
        params.startTime = startTime;
      }
      
      // Add delay before fetching deposits
      await this.delay(200);
      
      const response = await this.client.depositHistory(params);
      const deposits = response.data.filter((d: any) => d.status === 1); // Only successful
      console.log(`Found ${deposits.length} deposits`);
      return deposits;
    } catch (error: any) {
      if (error.response?.status === 418 || error.response?.status === 429) {
        console.error('⚠️  Rate limit hit while fetching deposits');
        throw new Error('Rate limit exceeded. Please wait and try again.');
      }
      console.error('Failed to fetch deposits:', error);
      return [];
    }
  }

  /**
   * Get withdrawal history
   */
  async getWithdrawHistory(startTime?: number): Promise<any[]> {
    try {
      console.log('Fetching withdrawal history...');
      const params: any = {};
      if (startTime) {
        params.startTime = startTime;
      }
      
      // Add delay before fetching withdrawals
      await this.delay(200);
      
      const response = await this.client.withdrawHistory(params);
      const withdrawals = response.data.filter((w: any) => w.status === 6); // Only completed
      console.log(`Found ${withdrawals.length} withdrawals`);
      return withdrawals;
    } catch (error: any) {
      if (error.response?.status === 418 || error.response?.status === 429) {
        console.error('⚠️  Rate limit hit while fetching withdrawals');
        throw new Error('Rate limit exceeded. Please wait and try again.');
      }
      console.error('Failed to fetch withdrawals:', error);
      return [];
    }
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await this.client.tickerPrice(symbol);
      return parseFloat(response.data.price);
    } catch (error) {
      throw new Error(`Failed to fetch price for ${symbol}: ${error}`);
    }
  }
}
