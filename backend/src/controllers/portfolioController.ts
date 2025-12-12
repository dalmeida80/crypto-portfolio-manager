import { Response } from 'express';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
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

    res.status(201).json({
      message: 'Portfolio created successfully',
      portfolio,
    });
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

    res.json({ portfolios });
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

    res.json({ portfolio });
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

    res.json({
      message: 'Portfolio updated successfully',
      portfolio,
    });
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
