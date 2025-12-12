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

  async getTradeHistory(symbol?: string, limit: number = 500): Promise<any[]> {
    try {
      if (symbol) {
        const response = await this.client.myTrades(symbol, { limit });
        return response.data;
      } else {
        const accountInfo = await this.client.account();
        const symbols = accountInfo.data.balances
          .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
          .map((b: any) => `${b.asset}USDT`);
        
        let allTrades: any[] = [];
        for (const sym of symbols.slice(0, 10)) {
          try {
            const response = await this.client.myTrades(sym, { limit: 100 });
            allTrades = allTrades.concat(response.data);
          } catch (e) {
            // Symbol may not exist, continue
          }
        }
        return allTrades;
      }
    } catch (error) {
      throw new Error(`Failed to fetch trade history: ${error}`);
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
