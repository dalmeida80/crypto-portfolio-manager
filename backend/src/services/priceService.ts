import { Spot } from '@binance/connector';

interface PriceCache {
  [symbol: string]: {
    price: number;
    timestamp: number;
  };
}

export class PriceService {
  private static instance: PriceService;
  private client: Spot;
  private cache: PriceCache = {};
  private readonly CACHE_DURATION = 30000; // 30 seconds

  private constructor() {
    // Initialize Binance public client (no API key needed for prices)
    this.client = new Spot();
  }

  static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
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
      console.error(`Failed to fetch price for ${normalizedSymbol}:`, error);
      
      // Return cached price if available, even if expired
      if (cached) {
        console.log(`Using expired cache for ${normalizedSymbol}`);
        return cached.price;
      }
      
      throw new Error(`Unable to fetch price for ${symbol}`);
    }
  }

  /**
   * Get prices for multiple symbols at once (more efficient)
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
      
      return result;
    } catch (error) {
      console.error('Failed to fetch multiple prices:', error);
      
      // Fallback: fetch individually
      const result: { [symbol: string]: number } = {};
      for (const symbol of uniqueSymbols) {
        try {
          result[symbol] = await this.getPrice(symbol);
        } catch (e) {
          console.error(`Skipping ${symbol} due to error`);
        }
      }
      
      return result;
    }
  }

  /**
   * Normalize symbol format to USDT pairs (most liquid market)
   * Examples:
   * - SAGAUSDC -> SAGAUSDT
   * - BTCBUSD -> BTCUSDT
   * - BTC -> BTCUSDT
   * - SOLUSDC -> SOLUSDT
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
  getCacheStats(): { size: number; symbols: string[] } {
    return {
      size: Object.keys(this.cache).length,
      symbols: Object.keys(this.cache)
    };
  }
}
