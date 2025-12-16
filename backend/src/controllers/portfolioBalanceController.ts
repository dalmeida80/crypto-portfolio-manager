import { Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { AuthRequest } from '../middleware/auth';
import { RevolutXService } from '../services/revolutXService';
import { BinanceService } from '../services/binanceService';
import { PriceService } from '../services/priceService';

const priceService = new PriceService();

/**
 * Get current balances and values for a portfolio (simple view without P/L tracking)
 * Uses exchange API to fetch current balances and calculates current value
 */
export const getPortfolioBalances = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    // Get portfolio
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId }
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    if (!portfolio.exchange) {
      res.status(400).json({ error: 'Portfolio must be linked to an exchange' });
      return;
    }

    // Get API key for this exchange
    const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
    const apiKey = await apiKeyRepo.findOne({
      where: { userId, exchange: portfolio.exchange, isActive: true }
    });

    if (!apiKey) {
      res.status(404).json({ 
        error: `No active API key found for ${portfolio.exchange}` 
      });
      return;
    }

    // Fetch balances from exchange
    let balances: any[];

    if (portfolio.exchange === 'binance') {
      const binance = await BinanceService.createFromApiKey(apiKey);
      balances = await binance.getAccountBalances();
    } else if (portfolio.exchange === 'revolutx') {
      const revolutX = await RevolutXService.createFromApiKey(apiKey);
      balances = await revolutX.getAccountBalances();
    } else {
      res.status(400).json({ error: 'Unsupported exchange' });
      return;
    }

    // Filter balances with quantity > 0
    const nonZeroBalances = balances.filter(b => parseFloat(b.total || b.free || 0) > 0);

    // Calculate current values
    const holdings = [];
    let totalValue = 0;

    for (const balance of nonZeroBalances) {
      const asset = balance.asset || balance.currency;
      const quantity = parseFloat(balance.total || balance.free || 0);

      // Skip if quantity is zero
      if (quantity === 0) continue;

      // Get current price
      let currentPrice = 0;
      let symbol = '';

      // Try to get price based on exchange
      if (portfolio.exchange === 'binance') {
        symbol = `${asset}USDT`;
        currentPrice = await priceService.getCurrentPrice(symbol);
      } else if (portfolio.exchange === 'revolutx') {
        symbol = `${asset}EUR`;
        currentPrice = await priceService.getCurrentPrice(symbol);
      }

      // Calculate value
      const value = quantity * currentPrice;
      totalValue += value;

      holdings.push({
        asset,
        symbol,
        quantity,
        currentPrice,
        currentValue: value
      });
    }

    // Sort by value (descending)
    holdings.sort((a, b) => b.currentValue - a.currentValue);

    res.json({
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        exchange: portfolio.exchange
      },
      totalValue,
      holdings,
      updatedAt: new Date()
    });
  } catch (error: any) {
    console.error('Get portfolio balances error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch portfolio balances',
      message: error.message 
    });
  }
};
