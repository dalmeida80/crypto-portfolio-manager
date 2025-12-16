import { Response } from 'express';
import { AppDataSource } from '../index';
import { Trade } from '../entities/Trade';
import { Portfolio } from '../entities/Portfolio';
import { AuthRequest } from '../middleware/auth';

export const addTrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { symbol, type, quantity, price, fee, executedAt } = req.body;

    if (!symbol || !type || !quantity || !price) {
      res.status(400).json({ error: 'Symbol, type, quantity, and price are required' });
      return;
    }

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    const tradeRepo = AppDataSource.getRepository(Trade);
    const trade = new Trade();
    trade.portfolioId = portfolioId;
    trade.symbol = symbol.toUpperCase();
    trade.type = type.toUpperCase();
    trade.quantity = parseFloat(quantity);
    trade.price = parseFloat(price);
    trade.fee = fee ? parseFloat(fee) : 0;
    trade.total = trade.quantity * trade.price;
    trade.executedAt = executedAt ? new Date(executedAt) : new Date();
    trade.source = 'manual';

    await tradeRepo.save(trade);

    res.status(201).json(trade);
  } catch (error) {
    console.error('Add trade error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * List trades with pagination support
 * Query params:
 * - page: page number (default 1, min 1)
 * - pageSize: items per page (default 50, min 1, max 100)
 * - source: filter by source (optional: 'binance', 'revolutx', 'manual')
 * - symbol: filter by symbol (optional)
 */
export const listTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const source = req.query.source as string | undefined;
    const symbol = req.query.symbol as string | undefined;

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    const tradeRepo = AppDataSource.getRepository(Trade);
    
    // Build where clause with filters
    const where: any = { portfolioId };
    if (source) {
      where.source = source;
    }
    if (symbol) {
      where.symbol = symbol.toUpperCase();
    }

    // Get total count for pagination metadata
    const totalCount = await tradeRepo.count({ where });

    // Get paginated trades
    const trades = await tradeRepo.find({
      where,
      order: { executedAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / pageSize);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.json({
      data: trades,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    console.error('List trades error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteTrade = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId, tradeId } = req.params;

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    const tradeRepo = AppDataSource.getRepository(Trade);
    const trade = await tradeRepo.findOne({
      where: { id: tradeId, portfolioId },
    });

    if (!trade) {
      res.status(404).json({ error: 'Trade not found' });
      return;
    }

    await tradeRepo.remove(trade);

    res.json({ message: 'Trade deleted successfully' });
  } catch (error) {
    console.error('Delete trade error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
