import { Request, Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Place a limit order on Revolut X
 * POST /api/portfolios/:portfolioId/orders/limit
 */
export const placeLimitOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId } = req.params;
    const { pair, side, amount, price } = req.body;

    // Validate input
    if (!pair || !side || !amount || !price) {
      return res.status(400).json({ 
        error: 'Missing required fields: pair, side, amount, price' 
      });
    }

    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid side. Must be "buy" or "sell"' 
      });
    }

    // Get portfolio with Revolut X API key
    const portfolioRepository = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepository.findOne({
      where: { 
        id: portfolioId, 
        userId: req.user!.userId 
      },
      relations: ['exchangeApiKey']
    });

    if (!portfolio) {
      return res.status(404).json({ 
        error: 'Portfolio not found or unauthorized' 
      });
    }

    // Check if portfolio has Revolut X API key configured
    if (!portfolio.exchangeApiKey || portfolio.exchangeApiKey.exchange !== 'revolutx') {
      return res.status(400).json({ 
        error: 'Revolut X API key not configured for this portfolio' 
      });
    }

    // TODO: Decrypt API key/secret and use proper Ed25519 signing
    // For now, returning mock response
    const mockOrder = {
      id: `order_${Date.now()}`,
      pair,
      side: side.toLowerCase(),
      amount: parseFloat(amount),
      price: parseFloat(price),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    // Return success response
    res.json({
      success: true,
      order: mockOrder,
      portfolio: {
        id: portfolio.id,
        name: portfolio.name
      }
    });

  } catch (error: any) {
    console.error('Revolut X order error:', error);
    res.status(500).json({ 
      error: 'Failed to place order',
      message: error.message 
    });
  }
};

/**
 * List open orders for a portfolio
 * GET /api/portfolios/:portfolioId/orders
 */
export const listOrders = async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId } = req.params;

    // Get portfolio
    const portfolioRepository = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepository.findOne({
      where: { 
        id: portfolioId, 
        userId: req.user!.userId 
      },
      relations: ['exchangeApiKey']
    });

    if (!portfolio) {
      return res.status(404).json({ 
        error: 'Portfolio not found or unauthorized' 
      });
    }

    if (!portfolio.exchangeApiKey || portfolio.exchangeApiKey.exchange !== 'revolutx') {
      return res.status(400).json({ 
        error: 'Revolut X API key not configured for this portfolio' 
      });
    }

    // TODO: Call Revolut X API to get real orders
    // For now, returning mock data
    const mockOrders = [
      {
        id: 'order_001',
        pair: 'DOGE-EUR',
        side: 'buy',
        amount: 1000,
        price: 0.35,
        status: 'open',
        createdAt: new Date().toISOString()
      }
    ];

    res.json({
      success: true,
      orders: mockOrders
    });

  } catch (error: any) {
    console.error('List orders error:', error);
    res.status(500).json({ 
      error: 'Failed to list orders',
      message: error.message 
    });
  }
};

/**
 * Cancel an order
 * DELETE /api/portfolios/:portfolioId/orders/:orderId
 */
export const cancelOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId, orderId } = req.params;

    // Get portfolio
    const portfolioRepository = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepository.findOne({
      where: { 
        id: portfolioId, 
        userId: req.user!.userId 
      },
      relations: ['exchangeApiKey']
    });

    if (!portfolio) {
      return res.status(404).json({ 
        error: 'Portfolio not found or unauthorized' 
      });
    }

    if (!portfolio.exchangeApiKey || portfolio.exchangeApiKey.exchange !== 'revolutx') {
      return res.status(400).json({ 
        error: 'Revolut X API key not configured for this portfolio' 
      });
    }

    // TODO: Call Revolut X API to cancel order
    // For now, returning mock response
    res.json({
      success: true,
      message: `Order ${orderId} cancelled successfully`
    });

  } catch (error: any) {
    console.error('Cancel order error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel order',
      message: error.message 
    });
  }
};
