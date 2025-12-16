import { Spot } from '@binance/connector';

interface PriceCache {
  [symbol: string]: {
    price: number;
    timestamp: number;
  };
}

/**
 * PriceService - Fetches and caches cryptocurrency prices
 * 
 * Price Sources:
 * - Primary: Binance spot prices (most liquid market)
 * - Caching: 30 seconds to reduce API calls
 * 
 * Currency Support:
 * - Default: USDT pairs (most liquid)
 * - EUR support: Converts USDT prices to EUR using EURUSDT rate
 * - For Revolut X (XXX/EUR pairs), prices are shown in EUR
 * 
 * Symbol Normalization:
 * - Converts various formats to consistent USDT pairs
 * - Examples: SAGAUSDC -> SAGAUSDT, BTC -> BTCUSDT
 */
export class PriceService {
  private static instance: PriceService;
  private client: Spot;
  private cache: PriceCache = {};
  private readonly CACHE_DURATION = 30000; // 30 seconds
  private eurUsdtRate: number = 1.0; // Cached EUR/USDT conversion rate

  private constructor() {
    // Initialize Binance public client (no API key needed for prices)
    this.client = new Spot();
    // Initialize EUR rate
    this.updateEurRate();
  }

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /**
   * Update EUR/USDT conversion rate
   * Should be called periodically to keep conversion accurate
   */
  private async updateEurRate(): Promise<void> {
    try {
      const response = await this.client.tickerPrice('EURUSDT');
      this.eurUsdtRate = parseFloat(response.data.price);
      console.log(`[Price Service] Updated EUR/USDT rate: ${this.eurUsdtRate}`);
    } catch (error) {
      console.error('[Price Service] Failed to update EUR rate, using default 1.0:', error);
      this.eurUsdtRate = 1.0;
    }
  }

  /**
   * Get current price for a single symbol from Binance
   */
  async getPrice(symbol: string): Promise<number> {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    
    // Check cache first
    const cached = this.cache[normalizedSymbol];
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const response = await this.client.tickerPrice(normalizedSymbol);
      const price = parseFloat(response.data.price);
      
      // Update cache
      this.cache[normalizedSymbol] = {
        price,
        timestamp: Date.now()
      };
      
      return price;
    } catch (error) {
      console.error(`[Price Service] Failed to fetch price for ${normalizedSymbol}:`, error);
      
      // Return cached price if available, even if expired
      if (cached) {
        console.log(`[Price Service] Using expired cache for ${normalizedSymbol}`);
        return cached.price;
      }
      
      throw new Error(`Unable to fetch price for ${symbol}`);
    }
  }

  /**
   * Get prices for multiple symbols at once (more efficient)
   * Returns prices in USDT by default
   */
  async getPrices(symbols: string[]): Promise<{ [symbol: string]: number }> {
    const normalizedSymbols = symbols.map(s => this.normalizeSymbol(s));
    const uniqueSymbols = [...new Set(normalizedSymbols)];
    
    try {
      // Fetch all prices at once
      const response = await this.client.tickerPrice();
      const allPrices = response.data;
      
      const result: { [symbol: string]: number } = {};
      const timestamp = Date.now();
      
      for (const priceData of allPrices) {
        if (uniqueSymbols.includes(priceData.symbol)) {
          const price = parseFloat(priceData.price);
          result[priceData.symbol] = price;
          
          // Update cache
          this.cache[priceData.symbol] = { price, timestamp };
        }
      }
      
      // Update EUR rate if needed
      const eurRate = allPrices.find((p: any) => p.symbol === 'EURUSDT');
      if (eurRate) {
        this.eurUsdtRate = parseFloat(eurRate.price);
      }
      
      return result;
    } catch (error) {
      console.error('[Price Service] Failed to fetch multiple prices:', error);
      
      // Fallback: fetch individually
      const result: { [symbol: string]: number } = {};
      for (const symbol of uniqueSymbols) {
        try {
          result[symbol] = await this.getPrice(symbol);
        } catch (e) {
          console.error(`[Price Service] Skipping ${symbol} due to error`);
        }
      }
      
      return result;
    }
  }

  /**
   * Get prices in EUR (for Revolut X and other EUR-based portfolios)
   * Converts USDT prices to EUR using current EUR/USDT rate
   */
  async getPricesInEur(symbols: string[]): Promise<{ [symbol: string]: number }> {
    const usdtPrices = await this.getPrices(symbols);
    const eurPrices: { [symbol: string]: number } = {};
    
    // Ensure we have fresh EUR rate
    if (Date.now() - (this.cache['EURUSDT']?.timestamp || 0) > this.CACHE_DURATION) {
      await this.updateEurRate();
    }
    
    // Convert each price from USDT to EUR
    for (const [symbol, usdtPrice] of Object.entries(usdtPrices)) {
      eurPrices[symbol] = usdtPrice / this.eurUsdtRate;
    }
    
    return eurPrices;
  }

  /**
   * Convert USDT amount to EUR
   */
  async convertUsdtToEur(usdtAmount: number): Promise<number> {
    // Ensure we have fresh EUR rate
    if (Date.now() - (this.cache['EURUSDT']?.timestamp || 0) > this.CACHE_DURATION) {
      await this.updateEurRate();
    }
    
    return usdtAmount / this.eurUsdtRate;
  }

  /**
   * Get current EUR/USDT conversion rate
   */
  getEurRate(): number {
    return this.eurUsdtRate;
  }

  /**
   * Normalize symbol format to USDT pairs (most liquid market)
   * Examples:
   * - SAGAUSDC -> SAGAUSDT
   * - BTCBUSD -> BTCUSDT
   * - BTC -> BTCUSDT
   * - SOLUSDC -> SOLUSDT
   * - DOGEEUR -> DOGEUSDT (for price fetching, then convert to EUR)
   */
  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    
    // Extract base asset by removing common quote assets
    const quoteAssets = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'EUR', 'BTC', 'ETH', 'BNB'];
    
    let baseAsset = upper;
    for (const quote of quoteAssets) {
      if (upper.endsWith(quote)) {
        baseAsset = upper.slice(0, -quote.length);
        break;
      }
    }
    
    // Common symbol mappings
    const symbolMap: { [key: string]: string } = {
      'BITCOIN': 'BTC',
      'ETHEREUM': 'ETH',
      'BINANCE COIN': 'BNB',
      'CARDANO': 'ADA',
      'RIPPLE': 'XRP',
      'SOLANA': 'SOL',
      'POLKADOT': 'DOT',
      'DOGECOIN': 'DOGE',
      'AVALANCHE': 'AVAX',
      'POLYGON': 'MATIC'
    };
    
    const mapped = symbolMap[baseAsset] || baseAsset;
    
    // Always return USDT pair for consistency and liquidity
    return `${mapped}USDT`;
  }

  /**
   * Clear price cache (useful for testing or forcing refresh)
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; symbols: string[]; eurRate: number } {
    return {
      size: Object.keys(this.cache).length,
      symbols: Object.keys(this.cache),
      eurRate: this.eurUsdtRate
    };
  }
}
