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

  async getAccountBalances(): Promise<any[]> {
    try {
      const response = await this.client.account();
      return response.data.balances.filter((balance: any) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0);
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
   * Get ALL trades across ALL symbols (paginated)
   * This is the comprehensive method
   */
  async getAllMyTrades(startTime?: number): Promise<any[]> {
    try {
      console.log('Fetching all trading symbols from Binance...');
      
      // Get account to see which assets we have/had
      const accountInfo = await this.client.account();
      const assets = accountInfo.data.balances.map((b: any) => b.asset);
      
      console.log(`Found ${assets.length} assets in account`);
      
      // Generate possible trading pairs
      const quoteAssets = ['USDT', 'USDC', 'BUSD', 'BTC', 'ETH', 'BNB', 'FDUSD', 'TUSD'];
      const symbols = new Set<string>();
      
      for (const asset of assets) {
        for (const quote of quoteAssets) {
          if (asset !== quote) {
            symbols.add(`${asset}${quote}`);
          }
        }
      }

      console.log(`Checking ${symbols.size} potential trading pairs...`);
      
      let allTrades: any[] = [];
      let symbolsWithTrades = 0;
      
      // Fetch trades for each symbol
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
        } catch (error: any) {
          // Symbol doesn't exist or no trades - this is normal
          if (!error.message?.includes('Invalid symbol')) {
            console.log(`  ${symbol}: no trades`);
          }
        }
      }
      
      console.log(`Found trades in ${symbolsWithTrades} symbols, total ${allTrades.length} trades`);
      return allTrades;
      
    } catch (error) {
      console.error('Failed to fetch all trades:', error);
      throw new Error(`Failed to fetch all trades: ${error}`);
    }
  }

  /**
   * Get deposit history
   */
  async getDepositHistory(startTime?: number): Promise<any[]> {
    try {
      const params: any = {};
      if (startTime) {
        params.startTime = startTime;
      }
      const response = await this.client.depositHistory(params);
      console.log(`Found ${response.data.length} deposits`);
      return response.data.filter((d: any) => d.status === 1); // Only successful deposits
    } catch (error) {
      console.error('Failed to fetch deposits:', error);
      return [];
    }
  }

  /**
   * Get withdrawal history
   */
  async getWithdrawHistory(startTime?: number): Promise<any[]> {
    try {
      const params: any = {};
      if (startTime) {
        params.startTime = startTime;
      }
      const response = await this.client.withdrawHistory(params);
      console.log(`Found ${response.data.length} withdrawals`);
      return response.data.filter((w: any) => w.status === 6); // Only completed withdrawals
    } catch (error) {
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
