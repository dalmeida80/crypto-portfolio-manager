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
   * Get symbols from recent order history
   * This helps discover assets you traded but no longer hold
   */
  private async getRecentOrderSymbols(startTime?: number): Promise<string[]> {
    try {
      // Top trading pairs commonly used (includes USDC and USDT variants)
      const topPairs = [
        // Major coins - USDT
        'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
        'ADAUSDT', 'DOGEUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT',
        'LTCUSDT', 'AVAXUSDT', 'ATOMUSDT', 'UNIUSDT', 'FILUSDT',
        'APTUSDT', 'ARBUSDT', 'OPUSDT', 'INJUSDT', 'PEPEUSDT',
        'SHIBUSDT', 'WLDUSDT', 'RNDRUSDT', 'SAGAUSDT', 'CHESSUSDT',
        // Major coins - USDC (important!)
        'BTCUSDC', 'ETHUSDC', 'BNBUSDC', 'SOLUSDC', 'XRPUSDC',
        'ADAUSDC', 'DOGEUSDC', 'DOTUSDC', 'MATICUSDC', 'LINKUSDC',
        'LTCUSDC', 'AVAXUSDC', 'ATOMUSDC', 'UNIUSDC', 'FILUSDC',
        'APTUSDC', 'ARBUSDC', 'OPUSDC', 'INJUSDC', 'PEPEUSDC',
        'SHIBUSDC', 'WLDUSDC', 'RNDRUSDC', 'SAGAUSDC', 'CHESSUSDC',
        // Other quote assets
        'BTCBUSD', 'ETHBUSD', 'BNBBUSD', 'BTCFDUSD', 'ETHFDUSD'
      ];
      
      const symbols = new Set<string>();
      
      console.log('Checking recent order history for additional symbols...');
      
      for (const symbol of topPairs) {
        try {
          const params: any = { limit: 100 };
          if (startTime) {
            params.startTime = startTime;
          }
          
          const response = await this.client.allOrders(symbol, params);
          
          // If we have filled orders for this symbol, add it
          if (response.data && response.data.length > 0) {
            const filledOrders = response.data.filter((o: any) => o.status === 'FILLED');
            if (filledOrders.length > 0) {
              symbols.add(symbol);
            }
          }
          
          await this.delay(50); // Short delay between checks
          
        } catch (error) {
          // Symbol doesn't exist or no permission - skip silently
        }
      }
      
      console.log(`Found ${symbols.size} symbols from order history:`, Array.from(symbols).join(', '));
      return Array.from(symbols);
      
    } catch (error) {
      console.error('Failed to get recent order symbols:', error);
      return [];
    }
  }

  /**
   * Get ALL trades across ALL symbols (ENHANCED VERSION)
   * Checks:
   * 1. Assets with current balance > 0
   * 2. Assets from recent order history (even if balance = 0 now)
   */
  async getAllMyTrades(startTime?: number): Promise<any[]> {
    try {
      console.log('=== ENHANCED IMPORT - Fetching account info ===');
      
      // 1. Get assets with current balance
      const accountInfo = await this.client.account();
      const assetsWithBalance = accountInfo.data.balances
        .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
        .map((b: any) => b.asset);
      
      console.log(`Found ${assetsWithBalance.length} assets with current balance > 0:`, assetsWithBalance.join(', '));
      
      // 2. Get symbols from recent orders (discovers assets you traded but sold)
      const recentOrdersSymbols = await this.getRecentOrderSymbols(startTime);
      
      // 3. Merge: symbols from orders + generated pairs for assets with balance
      const allSymbols = new Set<string>([...recentOrdersSymbols]);
      
      // Also add generated pairs for assets with balance
      const quoteAssets = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'FDUSD', 'TUSD'];
      for (const asset of assetsWithBalance) {
        if (quoteAssets.includes(asset)) continue;
        for (const quote of quoteAssets) {
          allSymbols.add(`${asset}${quote}`);
        }
      }

      console.log(`Total symbols to check: ${allSymbols.size}`);
      console.log('Starting trade fetch with rate limit protection...');
      
      let allTrades: any[] = [];
      let symbolsWithTrades = 0;
      let symbolsChecked = 0;
      
      for (const symbol of Array.from(allSymbols)) {
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
          await this.delay(100);
          
        } catch (error: any) {
          symbolsChecked++;
          
          if (error.response?.status === 418 || error.response?.status === 429) {
            console.error('⚠️  Rate limit hit! Stopping import.');
            console.error(`Checked ${symbolsChecked}/${allSymbols.size} symbols before rate limit`);
            throw new Error('Rate limit exceeded. Please wait and try again.');
          }
          
          // Only log every 10th symbol to reduce noise
          if (symbolsChecked % 10 === 0) {
            console.log(`  Checked ${symbolsChecked}/${allSymbols.size} symbols...`);
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
