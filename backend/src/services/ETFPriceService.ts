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

  /**
   * Get current price for a ticker symbol
   * Uses Yahoo Finance API (free, no API key required)
   */
  async getPrice(ticker: string): Promise<{ price: number; currency: string } | null> {
    try {
      // Check cache first
      const cached = this.cache.get(ticker);
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return { price: cached.price, currency: cached.currency };
      }

      // Yahoo Finance doesn't need API key for basic quotes
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
        console.warn(`[ETF Price] No data found for ${ticker}`);
        return null;
      }

      const price = result.meta.regularMarketPrice;
      const currency = result.meta.currency || 'USD';

      if (!price || isNaN(price)) {
        console.warn(`[ETF Price] Invalid price for ${ticker}`);
        return null;
      }

      // Cache the result
      this.cache.set(ticker, { price, currency, timestamp: Date.now() });

      console.log(`[ETF Price] ${ticker}: ${price} ${currency}`);
      return { price, currency };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(`[ETF Price] Failed to fetch ${ticker}:`, error.message);
      } else {
        console.error(`[ETF Price] Unexpected error for ${ticker}:`, error);
      }
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
