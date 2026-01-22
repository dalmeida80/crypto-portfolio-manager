import axios from 'axios';

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  currency: string;
  regularMarketTime: number;
}

export class ETFPriceService {
  private cache: Map<string, { price: number; timestamp: number; currency: string }> = new Map();
  private CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Common European exchange suffixes to try
  private readonly EXCHANGE_SUFFIXES = [
    '',      // Try without suffix first
    '.MI',   // Milan (Borsa Italiana)
    '.L',    // London Stock Exchange
    '.AS',   // Amsterdam (Euronext)
    '.PA',   // Paris (Euronext)
    '.DE',   // XETRA (Germany)
    '.SW',   // SIX Swiss Exchange
    '.MC',   // Madrid
  ];

  /**
   * Get current price for a ticker symbol
   * Uses Yahoo Finance API (free, no API key required)
   * Automatically tries European exchange suffixes if base ticker fails
   */
  async getPrice(ticker: string): Promise<{ price: number; currency: string } | null> {
    try {
      // Check cache first
      const cached = this.cache.get(ticker);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return { price: cached.price, currency: cached.currency };
      }

      // Try ticker as-is first, then with exchange suffixes
      const tickersToTry = ticker.includes('.')
        ? [ticker] // Already has suffix, don't modify
        : this.EXCHANGE_SUFFIXES.map(suffix => ticker + suffix);

      for (const tryTicker of tickersToTry) {
        const result = await this.fetchPrice(tryTicker);
        if (result) {
          // Cache using original ticker name
          this.cache.set(ticker, { ...result, timestamp: Date.now() });
          console.log(`[ETF Price] ${ticker} -> ${tryTicker}: ${result.price} ${result.currency}`);
          return result;
        }
      }

      console.warn(`[ETF Price] No data found for ${ticker} (tried ${tickersToTry.length} variations)`);
      return null;
    } catch (error) {
      console.error(`[ETF Price] Unexpected error for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Fetch price for a specific ticker from Yahoo Finance
   */
  private async fetchPrice(ticker: string): Promise<{ price: number; currency: string } | null> {
    try {
      const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`,
        {
          params: {
            interval: '1d',
            range: '1d'
          },
          headers: {
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 5000
        }
      );

      const result = response.data?.chart?.result?.[0];
      if (!result || !result.meta) {
        return null;
      }

      const price = result.meta.regularMarketPrice;
      const currency = result.meta.currency || 'USD';

      if (!price || isNaN(price)) {
        return null;
      }

      return { price, currency };
    } catch (error) {
      // Silently fail for individual ticker attempts
      return null;
    }
  }

  /**
   * Get prices for multiple tickers in parallel
   */
  async getPrices(tickers: string[]): Promise<Map<string, { price: number; currency: string }>> {
    const results = new Map<string, { price: number; currency: string }>();
    
    // Fetch in parallel with rate limiting
    const promises = tickers.map(ticker => 
      this.getPrice(ticker).then(result => {
        if (result) {
          results.set(ticker, result);
        }
      })
    );

    await Promise.all(promises);
    return results;
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
