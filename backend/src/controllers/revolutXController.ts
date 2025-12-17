import { Request, Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';

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
      }
    });

    if (!portfolio) {
      return res.status(404).json({ 
        error: 'Portfolio not found or unauthorized' 
      });
    }

    // Check if portfolio has Revolut X API key configured
    if (!portfolio.revolutXApiKey) {
      return res.status(400).json({ 
        error: 'Revolut X API key not configured for this portfolio' 
      });
    }

    // Call Revolut X API
    const revolutXResponse = await fetch('https://api.revolut.com/x-api/place-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${portfolio.revolutXApiKey}`
      },
      body: JSON.stringify({
        pair,
        side: side.toLowerCase(),
        amount: parseFloat(amount),
        price: parseFloat(price),
        type: 'limit'
      })
    });

    if (!revolutXResponse.ok) {
      const errorData = await revolutXResponse.json().catch(() => ({}));
      return res.status(revolutXResponse.status).json({
        error: 'Revolut X API error',
        details: errorData
      });
    }

    const orderData = await revolutXResponse.json();

    // Return success response
    res.json({
      success: true,
      order: orderData,
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
