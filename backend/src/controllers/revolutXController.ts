import { Request, Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { RevolutXService } from '../services/revolutXService';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

/**
 * Get Revolut X service instance for a portfolio
 */
async function getRevolutXService(portfolio: Portfolio): Promise<RevolutXService> {
  if (!portfolio.exchangeApiKey || portfolio.exchangeApiKey.exchange !== 'revolutx') {
    throw new Error('Revolut X API key not configured for this portfolio');
  }
  
  return await RevolutXService.createFromApiKey(portfolio.exchangeApiKey);
}

/**
 * Get current market price (ticker) for a trading pair
 * GET /api/portfolios/:portfolioId/ticker/:symbol
 */
export const getTicker = async (req: AuthRequest, res: Response) => {
  try {
    const { portfolioId, symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({ 
        error: 'Symbol is required' 
      });
    }

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

    const revolutXService = await getRevolutXService(portfolio);
    const ticker = await revolutXService.getTicker(symbol);

    res.json({
      success: true,
      symbol: symbol.toUpperCase(),
      ticker: ticker
    });

  } catch (error: any) {
    console.error('Get ticker error:', error);
    res.status(500).json({ 
      error: 'Failed to get ticker',
      message: error.message
    });
  }
};

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

    // Validate numeric values
    const numAmount = parseFloat(amount);
    const numPrice = parseFloat(price);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount. Must be a positive number' 
      });
    }
    
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ 
        error: 'Invalid price. Must be a positive number' 
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

    // Get Revolut X service and place order
    const revolutXService = await getRevolutXService(portfolio);
    
    const result = await revolutXService.placeLimitOrder({
      symbol: pair.toUpperCase(), // Ensure format BTC-EUR
      side: side.toUpperCase() as 'BUY' | 'SELL',
      baseSize: numAmount.toString(),
      price: numPrice.toString()
    });

    console.log('[Controller] Order placed successfully:', result);

    res.json({
      success: true,
      order: result,
      portfolio: {
        id: portfolio.id,
        name: portfolio.name
      }
    });

  } catch (error: any) {
    console.error('Revolut X order error:', error);
    
    // Return detailed error for debugging
    res.status(500).json({ 
      error: 'Failed to place order',
      message: error.message,
      details: error.response?.data || null
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

    const revolutXService = await getRevolutXService(portfolio);
    const orders = await revolutXService.listOpenOrders();

    console.log(`[Controller] Fetched ${orders.length} orders`);

    res.json({
      success: true,
      orders: orders
    });

  } catch (error: any) {
    console.error('List orders error:', error);
    res.status(500).json({ 
      error: 'Failed to list orders',
      message: error.message,
      details: error.response?.data || null
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

    if (!orderId) {
      return res.status(400).json({ 
        error: 'Order ID is required' 
      });
    }

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

    const revolutXService = await getRevolutXService(portfolio);
    await revolutXService.cancelOrder(orderId);

    console.log(`[Controller] Order ${orderId} cancelled successfully`);

    res.json({
      success: true,
      message: `Order ${orderId} cancelled successfully`
    });

  } catch (error: any) {
    console.error('Cancel order error:', error);
    res.status(500).json({ 
      error: 'Failed to cancel order',
      message: error.message,
      details: error.response?.data || null
    });
  }
};
