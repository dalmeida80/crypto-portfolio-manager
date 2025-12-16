import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  AuthResponse,
  LoginCredentials,
  RegisterCredentials,
  User,
  Portfolio,
  CreatePortfolioDto,
  Trade,
  CreateTradeDto,
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export interface Holding {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercentage: number;
}

export interface SimpleHolding {
  asset: string;
  symbol: string;
  quantity: number;
  currentPrice: number;
  currentValue: number;
}

export interface BalanceResponse {
  portfolio: {
    id: string;
    name: string;
    exchange: string;
  };
  totalValue: number;
  holdings: SimpleHolding[];
  updatedAt: string;
}

export interface PriceResponse {
  symbol: string;
  price: number;
  timestamp: string;
}

export interface PricesResponse {
  prices: { [symbol: string]: number };
  timestamp: string;
}

export interface ApiKey {
  id: string;
  exchange: string;
  label?: string;
  isActive: boolean;
  createdAt: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  message: string;
}

export interface ImportStatus {
  totalTrades: number;
  binanceTrades: number;
  revolutxTrades: number;
  manualTrades: number;
  lastImportDate: string | null;
  oldestTrade: string | null;
  newestTrade: string | null;
}

export interface PortfolioStats {
  // Money flow
  totalDeposits: number;
  totalWithdrawals: number;
  netInvested: number;

  // Fees
  totalFees: number;
  totalTradesFees: number;
  totalTransferFees: number;

  // P/L
  totalInvested: number;
  currentValue: number;
  totalProfitLoss: number;
  totalRealizedProfitLoss: number;
  totalUnrealizedProfitLoss: number;

  // Trade stats
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;

  // Closed positions
  closedPositionsCount: number;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedTradesResponse {
  data: Trade[];
  pagination: PaginationMetadata;
}

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add token to requests
    this.api.interceptors.request.use((config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle token refresh on 401
    this.api.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
              throw new Error('No refresh token');
            }

            // Implement refresh token logic here if backend supports it
            // For now, just logout
            this.logout();
            window.location.href = '/login';
          } catch (refreshError) {
            this.logout();
            window.location.href = '/login';
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth methods
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const { data } = await this.api.post<AuthResponse>('/auth/register', credentials);
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const { data } = await this.api.post<AuthResponse>('/auth/login', credentials);
    this.setTokens(data.accessToken, data.refreshToken);
    return data;
  }

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  // Portfolio methods
  async getPortfolios(): Promise<Portfolio[]> {
    const { data } = await this.api.get<Portfolio[]>('/portfolios');
    return data;
  }

  async getPortfolio(id: string): Promise<Portfolio> {
    const { data } = await this.api.get<Portfolio>(`/portfolios/${id}`);
    return data;
  }

  async createPortfolio(portfolio: CreatePortfolioDto): Promise<Portfolio> {
    const { data } = await this.api.post<Portfolio>('/portfolios', portfolio);
    return data;
  }

  async updatePortfolio(id: string, portfolio: Partial<CreatePortfolioDto>): Promise<Portfolio> {
    const { data } = await this.api.put<Portfolio>(`/portfolios/${id}`, portfolio);
    return data;
  }

  async deletePortfolio(id: string): Promise<void> {
    await this.api.delete(`/portfolios/${id}`);
  }

  async getPortfolioStats(id: string): Promise<PortfolioStats> {
    const { data } = await this.api.get<PortfolioStats>(`/portfolios/${id}/stats`);
    return data;
  }

  // Simple balance view (no P/L tracking)
  async getPortfolioBalances(id: string): Promise<BalanceResponse> {
    const { data } = await this.api.get<BalanceResponse>(`/portfolios/${id}/balances`);
    return data;
  }

  // Trade methods
  async getTrades(
    portfolioId: string,
    page: number = 1,
    pageSize: number = 50,
    source?: string,
    symbol?: string
  ): Promise<PaginatedTradesResponse> {
    const params: any = { page, pageSize };
    if (source) params.source = source;
    if (symbol) params.symbol = symbol;

    const { data } = await this.api.get<PaginatedTradesResponse>(
      `/portfolios/${portfolioId}/trades`,
      { params }
    );
    return data;
  }

  // Backward compatibility: get all trades without pagination
  async getAllTrades(portfolioId: string): Promise<Trade[]> {
    const response = await this.getTrades(portfolioId, 1, 1000);
    return response.data;
  }

  async createTrade(trade: CreateTradeDto): Promise<Trade> {
    const { data } = await this.api.post<Trade>('/trades', trade);
    return data;
  }

  async updateTrade(id: string, trade: Partial<CreateTradeDto>): Promise<Trade> {
    const { data } = await this.api.put<Trade>(`/trades/${id}`, trade);
    return data;
  }

  async deleteTrade(id: string): Promise<void> {
    await this.api.delete(`/trades/${id}`);
  }

  // Price methods
  async getPrice(symbol: string): Promise<PriceResponse> {
    const { data } = await this.api.get<PriceResponse>(`/prices/price/${symbol}`);
    return data;
  }

  async getPrices(symbols: string[]): Promise<PricesResponse> {
    const { data } = await this.api.post<PricesResponse>('/prices/prices', { symbols });
    return data;
  }

  // Portfolio update methods
  async refreshPortfolio(portfolioId: string): Promise<Portfolio> {
    const { data } = await this.api.post<Portfolio>(`/prices/portfolio/${portfolioId}/refresh`);
    return data;
  }

  async refreshAllPortfolios(): Promise<{ updated: number; portfolios: Portfolio[] }> {
    const { data } = await this.api.post('/prices/portfolios/refresh');
    return data;
  }

  async getPortfolioHoldings(portfolioId: string): Promise<Holding[]> {
    const { data } = await this.api.get<Holding[]>(`/prices/portfolio/${portfolioId}/holdings`);
    return data;
  }

  // Exchange API Key methods (updated to support multiple exchanges)
  async addApiKey(
    apiKey: string,
    apiSecret: string,
    exchange: 'binance' | 'revolutx' = 'binance',
    label?: string
  ): Promise<{ message: string; apiKey: ApiKey }> {
    const { data } = await this.api.post('/exchange/api-keys', {
      apiKey,
      apiSecret,
      exchange,
      label
    });
    return data;
  }

  async listApiKeys(): Promise<{ apiKeys: ApiKey[] }> {
    const { data } = await this.api.get('/exchange/api-keys');
    return data;
  }

  async deleteApiKey(id: string): Promise<{ message: string }> {
    const { data } = await this.api.delete(`/exchange/api-keys/${id}`);
    return data;
  }

  // Trade Import methods
  async importTrades(
    portfolioId: string,
    apiKeyId: string,
    startDate?: string
  ): Promise<ImportResult> {
    const { data } = await this.api.post(`/exchange/portfolios/${portfolioId}/import`, {
      apiKeyId,
      startDate
    });
    return data;
  }

  async importAllTrades(
    portfolioId: string,
    startDate?: string
  ): Promise<ImportResult> {
    const { data } = await this.api.post(`/exchange/portfolios/${portfolioId}/import-all`, {
      startDate
    });
    return data;
  }

  async getImportStatus(portfolioId: string): Promise<ImportStatus> {
    const { data } = await this.api.get(`/exchange/portfolios/${portfolioId}/import-status`);
    return data;
  }
}

export default new ApiService();
