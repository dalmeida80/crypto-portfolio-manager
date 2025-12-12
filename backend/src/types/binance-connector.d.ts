declare module '@binance/connector' {
  export class Spot {
    constructor(apiKey?: string, apiSecret?: string, options?: any);
    account(options?: any): Promise<any>;
    myTrades(symbol: string, options?: any): Promise<any>;
    tickerPrice(symbol?: string): Promise<any>;
    exchangeInfo(options?: any): Promise<any>;
  }
}
