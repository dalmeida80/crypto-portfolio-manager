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

  async getPortfolio(id: number): Promise<Portfolio> {
    const { data } = await this.api.get<Portfolio>(`/portfolios/${id}`);
    return data;
  }

  async createPortfolio(portfolio: CreatePortfolioDto): Promise<Portfolio> {
    const { data } = await this.api.post<Portfolio>('/portfolios', portfolio);
    return data;
  }

  async updatePortfolio(id: number, portfolio: Partial<CreatePortfolioDto>): Promise<Portfolio> {
    const { data } = await this.api.put<Portfolio>(`/portfolios/${id}`, portfolio);
    return data;
  }

  async deletePortfolio(id: number): Promise<void> {
    await this.api.delete(`/portfolios/${id}`);
  }

  // Trade methods
  async getTrades(portfolioId: number): Promise<Trade[]> {
    const { data } = await this.api.get<Trade[]>(`/portfolios/${portfolioId}/trades`);
    return data;
  }

  async createTrade(trade: CreateTradeDto): Promise<Trade> {
    const { data } = await this.api.post<Trade>('/trades', trade);
    return data;
  }

  async updateTrade(id: number, trade: Partial<CreateTradeDto>): Promise<Trade> {
    const { data } = await this.api.put<Trade>(`/trades/${id}`, trade);
    return data;
  }

  async deleteTrade(id: number): Promise<void> {
    await this.api.delete(`/trades/${id}`);
  }
}

export default new ApiService();
