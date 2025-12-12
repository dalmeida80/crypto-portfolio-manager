import { Request, Response } from 'express';
import { PriceService } from '../services/priceService';
import { PortfolioUpdateService } from '../services/portfolioUpdateService';

const priceService = PriceService.getInstance();
const portfolioUpdateService = new PortfolioUpdateService();

/**
 * Get current price for a single symbol
 */
export const getPrice = async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const price = await priceService.getPrice(symbol);
    
    res.json({
      symbol,
      price,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Get price error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch price' });
  }
};

/**
 * Get prices for multiple symbols
 */
export const getPrices = async (req: Request, res: Response) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'Symbols array is required' });
    }

    const prices = await priceService.getPrices(symbols);
    
    res.json({
      prices,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Get prices error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch prices' });
  }
};

/**
 * Refresh portfolio values with current prices
 */
export const refreshPortfolio = async (req: Request, res: Response) => {
  try {
    const { portfolioId } = req.params;
    const userId = (req as any).user.id;

    // Update portfolio
    const portfolio = await portfolioUpdateService.updatePortfolio(portfolioId);

    // Verify ownership
    if (portfolio.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(portfolio);
  } catch (error: any) {
    console.error('Refresh portfolio error:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh portfolio' });
  }
};

/**
 * Get detailed holdings for a portfolio
 */
export const getPortfolioHoldings = async (req: Request, res: Response) => {
  try {
    const { portfolioId } = req.params;
    const userId = (req as any).user.id;

    // Get holdings
    const holdings = await portfolioUpdateService.getPortfolioHoldings(portfolioId);

    res.json(holdings);
  } catch (error: any) {
    console.error('Get holdings error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch holdings' });
  }
};

/**
 * Refresh all portfolios for current user
 */
export const refreshUserPortfolios = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const portfolios = await portfolioUpdateService.updateUserPortfolios(userId);

    res.json({
      updated: portfolios.length,
      portfolios
    });
  } catch (error: any) {
    console.error('Refresh user portfolios error:', error);
    res.status(500).json({ error: error.message || 'Failed to refresh portfolios' });
  }
};

/**
 * Clear price cache (useful for testing)
 */
export const clearCache = async (req: Request, res: Response) => {
  try {
    priceService.clearCache();
    res.json({ message: 'Cache cleared successfully' });
  } catch (error: any) {
    console.error('Clear cache error:', error);
    res.status(500).json({ error: error.message || 'Failed to clear cache' });
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (req: Request, res: Response) => {
  try {
    const stats = priceService.getCacheStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Get cache stats error:', error);
    res.status(500).json({ error: error.message || 'Failed to get cache stats' });
  }
};
