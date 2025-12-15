// User types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// Portfolio types
export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  description?: string;
  totalInvested: number;
  currentValue: number;
  profitLoss: number;
  createdAt: string;
  updatedAt: string;
}

// Trade types
export type TradeType = 'BUY' | 'SELL';

export interface Trade {
  id: string;
  portfolioId: string;
  symbol: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee: number;
  total: number;
  executedAt: string;
  externalId?: string;
  source?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateTradeDto {
  portfolioId: string;
  symbol: string;
  type: TradeType;
  quantity: number;
  price: number;
  fee?: number;
  executedAt?: string;
  notes?: string;
}

export interface CreatePortfolioDto {
  name: string;
  description?: string;
}
