import { Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { Transfer } from '../entities/Transfer';
import { ClosedPosition } from '../entities/ClosedPosition';
import { AuthRequest } from '../middleware/auth';

export const createPortfolio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, description } = req.body;
    const userId = req.user!.userId;

    if (!name) {
      res.status(400).json({ error: 'Portfolio name is required' });
      return;
    }

    const portfolioRepo = AppDataSource.getRepository(Portfolio);

    const portfolio = new Portfolio();
    portfolio.userId = userId;
    portfolio.name = name;
    portfolio.description = description;
    portfolio.totalInvested = 0;
    portfolio.currentValue = 0;
    portfolio.profitLoss = 0;

    await portfolioRepo.save(portfolio);

    res.status(201).json(portfolio);
  } catch (error) {
    console.error('Create portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listPortfolios = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const portfolioRepo = AppDataSource.getRepository(Portfolio);

    const portfolios = await portfolioRepo.find({
      where: { userId },
      relations: ['trades'],
      order: { createdAt: 'DESC' },
    });

    res.json(portfolios);
  } catch (error) {
    console.error('List portfolios error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPortfolio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
      relations: ['trades'],
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    res.json(portfolio);
  } catch (error) {
    console.error('Get portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePortfolio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { name, description } = req.body;

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    if (name) portfolio.name = name;
    if (description !== undefined) portfolio.description = description;

    await portfolioRepo.save(portfolio);

    res.json(portfolio);
  } catch (error) {
    console.error('Update portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePortfolio = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    await portfolioRepo.remove(portfolio);

    res.json({ message: 'Portfolio deleted successfully' });
  } catch (error) {
    console.error('Delete portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get closed positions for a specific portfolio
 * GET /portfolios/:portfolioId/closed-positions
 */
export const getPortfolioClosedPositions = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { symbol } = req.query;

    // Verify portfolio ownership
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    // Fetch closed positions
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);
    const where: any = { portfolioId };
    if (symbol) {
      where.symbol = (symbol as string).toUpperCase();
    }

    const closedPositions = await closedPositionRepo.find({
      where,
      order: { closedAt: 'DESC' },
    });

    res.json(closedPositions);
  } catch (error) {
    console.error('Get closed positions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get transfers for a specific portfolio
 * GET /portfolios/:portfolioId/transfers
 */
export const getPortfolioTransfers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { type, asset } = req.query;

    // Verify portfolio ownership
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId, userId },
    });

    if (!portfolio) {
      res.status(404).json({ error: 'Portfolio not found' });
      return;
    }

    // Fetch transfers
    const transferRepo = AppDataSource.getRepository(Transfer);
    const where: any = { portfolioId };
    if (type && (type === 'DEPOSIT' || type === 'WITHDRAWAL')) {
      where.type = type;
    }
    if (asset) {
      where.asset = (asset as string).toUpperCase();
    }

    const transfers = await transferRepo.find({
      where,
      order: { executedAt: 'DESC' },
    });

    res.json(transfers);
  } catch (error) {
    console.error('Get transfers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Get aggregate stats for all user portfolios
 * GET /portfolios/stats
 */
export const getUserStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // Get all user portfolios
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolios = await portfolioRepo.find({
      where: { userId },
      relations: ['trades'],
    });

    if (portfolios.length === 0) {
      res.json({
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalFees: 0,
        totalRealizedProfitLoss: 0,
        totalUnrealizedProfitLoss: 0,
        totalProfitLoss: 0,
      });
      return;
    }

    const portfolioIds = portfolios.map(p => p.id);

    // Calculate total fees from trades
    let totalFees = 0;
    for (const portfolio of portfolios) {
      totalFees += portfolio.trades.reduce((sum, trade) => sum + (trade.fee || 0), 0);
    }

    // Calculate deposits and withdrawals from transfers
    const transferRepo = AppDataSource.getRepository(Transfer);
    const transfers = await transferRepo
      .createQueryBuilder('transfer')
      .where('transfer.portfolioId IN (:...portfolioIds)', { portfolioIds })
      .getMany();

    let totalDeposits = 0;
    let totalWithdrawals = 0;

    // Note: For now, we sum the amounts. In the future, we could
    // multiply by prices at execution time to get USD value
    for (const transfer of transfers) {
      if (transfer.type === 'DEPOSIT') {
        totalDeposits += transfer.amount;
      } else if (transfer.type === 'WITHDRAWAL') {
        totalWithdrawals += transfer.amount;
      }
      totalFees += transfer.fee || 0;
    }

    // Calculate realized P/L from closed positions
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);
    const closedPositions = await closedPositionRepo
      .createQueryBuilder('cp')
      .where('cp.portfolioId IN (:...portfolioIds)', { portfolioIds })
      .getMany();

    const totalRealizedProfitLoss = closedPositions.reduce(
      (sum, cp) => sum + cp.realizedProfitLoss,
      0
    );

    // Calculate total P/L from portfolios (unrealized + realized)
    const totalProfitLoss = portfolios.reduce((sum, p) => sum + p.profitLoss, 0);
    const totalInvested = portfolios.reduce((sum, p) => sum + p.totalInvested, 0);
    const totalCurrentValue = portfolios.reduce((sum, p) => sum + p.currentValue, 0);
    const totalUnrealizedProfitLoss = totalCurrentValue - totalInvested;

    res.json({
      totalDeposits,
      totalWithdrawals,
      totalFees,
      totalRealizedProfitLoss,
      totalUnrealizedProfitLoss,
      totalProfitLoss,
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
