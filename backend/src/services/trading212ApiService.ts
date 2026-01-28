import axios, { AxiosInstance, AxiosError } from 'axios';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { decrypt } from '../utils/encryption';

interface Trading212Config {
  apiKey: string;
  apiSecret: string;
  environment: 'demo' | 'live';
}

interface AccountCash {
  free: number;
  total: number;
  ppl: number;
  result: number;
  invested: number;
  pieCash: number;
  blocked: number;
}

interface PortfolioItem {
  ticker: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  ppl: number;
  fxPpl: number;
  initialFillDate: string;
  frontend: string;
  maxBuy: number;
  maxSell: number;
  pieQuantity: number;
}

interface Order {
  id: number;
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  limitPrice?: number;
  stopPrice?: number;
  quantity: number;
  ticker: string;
  side: 'buy' | 'sell';
  status: 'FILLED' | 'CANCELLED' | 'PENDING';
  fillTime?: string;
  filledQuantity?: number;
  averagePrice?: number;
  filledValue?: number;
  createdOn: string;
  executor?: string;
  parentOrder?: number;
}

interface Transaction {
  amount: number;
  dateTime: string;
  reference: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
}

interface Dividend {
  amount: number;
  amountInEuro: number;
  grossAmountPerShare: number;
  paidOn: string;
  quantity: number;
  reference: string;
  ticker: string;
  type: 'ORDINARY' | 'SPECIAL';
}

interface PaginatedResponse<T> {
  items: T[];
  nextPagePath: string | null;
}

export class Trading212ApiService {
  private client: AxiosInstance;
  private baseUrl: string;
  private rateLimitDelay = 1200; // 1.2s between requests (safe for 50/min limit)

  constructor(config: Trading212Config) {
    this.baseUrl = config.environment === 'demo' 
      ? 'https://demo.trading212.com/api/v0'
      : 'https://live.trading212.com/api/v0';

    const credentials = Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64');

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add response interceptor for rate limit tracking
    this.client.interceptors.response.use(
      (response) => {
        const remaining = response.headers['x-ratelimit-remaining'];
        const reset = response.headers['x-ratelimit-reset'];
        
        if (remaining && parseInt(remaining) < 10) {
          console.warn(`⚠️  Trading212 Rate Limit Warning: ${remaining} requests remaining`);
        }
        
        return response;
      },
      (error: AxiosError) => {
        if (error.response?.status === 429) {
          const reset = error.response.headers['x-ratelimit-reset'];
          throw new Error(`Rate limit exceeded. Reset at: ${reset}`);
        }
        throw error;
      }
    );
  }

  /**
   * Create service instance from encrypted API key entity
   */
  static async createFromApiKey(exchangeApiKey: ExchangeApiKey, environment: 'demo' | 'live' = 'live'): Promise<Trading212ApiService> {
    const apiKey = decrypt(exchangeApiKey.apiKey);
    const apiSecret = decrypt(exchangeApiKey.apiSecret);
    return new Trading212ApiService({ apiKey, apiSecret, environment });
  }

  /**
   * Add delay to respect rate limits
   */
  private async delay(ms: number = this.rateLimitDelay): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccountCash();
      return true;
    } catch (error) {
      console.error('Trading212 connection test failed:', error);
      return false;
    }
  }

  /**
   * Get account cash information
   * GET /equity/account/cash
   */
  async getAccountCash(): Promise<AccountCash> {
    try {
      const response = await this.client.get<AccountCash>('/equity/account/cash');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch account cash: ${this.formatError(error)}`);
    }
  }

  /**
   * Get current portfolio holdings
   * GET /equity/portfolio
   */
  async getPortfolio(): Promise<PortfolioItem[]> {
    try {
      const response = await this.client.get<PortfolioItem[]>('/equity/portfolio');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch portfolio: ${this.formatError(error)}`);
    }
  }

  /**
   * Get all orders with automatic pagination
   * GET /equity/history/orders
   */
  async getAllOrders(limit: number = 50): Promise<Order[]> {
    try {
      console.log('Fetching all Trading212 orders...');
      const allOrders: Order[] = [];
      let nextPath: string | null = `/equity/history/orders?limit=${limit}`;
      let pageCount = 0;

      while (nextPath) {
        pageCount++;
        console.log(`  Page ${pageCount}: fetching...`);
        
        const response = await this.client.get<PaginatedResponse<Order>>(nextPath);
        const { items, nextPagePath } = response.data;
        
        allOrders.push(...items);
        console.log(`  Page ${pageCount}: ${items.length} orders (total: ${allOrders.length})`);
        
        nextPath = nextPagePath;
        
        if (nextPath) {
          await this.delay();
        }
      }

      console.log(`✓ Fetched ${allOrders.length} total orders from ${pageCount} pages`);
      return allOrders;
    } catch (error) {
      throw new Error(`Failed to fetch orders: ${this.formatError(error)}`);
    }
  }

  /**
   * Get all transactions (deposits/withdrawals) with automatic pagination
   * GET /equity/history/transactions
   */
  async getAllTransactions(limit: number = 50): Promise<Transaction[]> {
    try {
      console.log('Fetching all Trading212 transactions...');
      const allTransactions: Transaction[] = [];
      let nextPath: string | null = `/equity/history/transactions?limit=${limit}`;
      let pageCount = 0;

      while (nextPath) {
        pageCount++;
        console.log(`  Page ${pageCount}: fetching...`);
        
        const response = await this.client.get<PaginatedResponse<Transaction>>(nextPath);
        const { items, nextPagePath } = response.data;
        
        allTransactions.push(...items);
        console.log(`  Page ${pageCount}: ${items.length} transactions (total: ${allTransactions.length})`);
        
        nextPath = nextPagePath;
        
        if (nextPath) {
          await this.delay();
        }
      }

      console.log(`✓ Fetched ${allTransactions.length} total transactions from ${pageCount} pages`);
      return allTransactions;
    } catch (error) {
      throw new Error(`Failed to fetch transactions: ${this.formatError(error)}`);
    }
  }

  /**
   * Get all dividends with automatic pagination
   * GET /equity/history/dividends
   */
  async getAllDividends(limit: number = 50): Promise<Dividend[]> {
    try {
      console.log('Fetching all Trading212 dividends...');
      const allDividends: Dividend[] = [];
      let nextPath: string | null = `/equity/history/dividends?limit=${limit}`;
      let pageCount = 0;

      while (nextPath) {
        pageCount++;
        console.log(`  Page ${pageCount}: fetching...`);
        
        const response = await this.client.get<PaginatedResponse<Dividend>>(nextPath);
        const { items, nextPagePath } = response.data;
        
        allDividends.push(...items);
        console.log(`  Page ${pageCount}: ${items.length} dividends (total: ${allDividends.length})`);
        
        nextPath = nextPagePath;
        
        if (nextPath) {
          await this.delay();
        }
      }

      console.log(`✓ Fetched ${allDividends.length} total dividends from ${pageCount} pages`);
      return allDividends;
    } catch (error) {
      throw new Error(`Failed to fetch dividends: ${this.formatError(error)}`);
    }
  }

  /**
   * Get orders filtered by status
   */
  async getOrdersByStatus(status: 'FILLED' | 'CANCELLED' | 'PENDING'): Promise<Order[]> {
    const allOrders = await this.getAllOrders();
    return allOrders.filter(order => order.status === status);
  }

  /**
   * Format error messages
   */
  private formatError(error: any): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        return `${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`;
      }
      return axiosError.message;
    }
    return error instanceof Error ? error.message : 'Unknown error';
  }
}
