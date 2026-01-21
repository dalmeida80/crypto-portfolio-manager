import { Request, Response } from 'express';
import { Trading212ImportService } from '../services/Trading212ImportService';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';

interface AuthRequest extends Request {
  user?: { userId: string; email: string };
}

export class Trading212Controller {
  private importService = new Trading212ImportService();
  private portfolioRepo = AppDataSource.getRepository(Portfolio);

  importCSV = async (req: AuthRequest, res: Response) => {
    try {
      const { portfolioId } = req.params;
      const userId = req.user?.userId;

      if (!req.file) {
        return res.status(400).json({ error: 'CSV file is required' });
      }

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      if (portfolio.exchange !== 'trading212') {
        return res.status(400).json({ error: 'Portfolio is not a Trading212 account' });
      }

      const result = await this.importService.importCSV(portfolioId, req.file.buffer);

      res.json({
        message: 'Import completed',
        ...result
      });
    } catch (error) {
      console.error('Import error:', error);
      res.status(500).json({ error: 'Failed to import CSV' });
    }
  };

  getSummary = async (req: AuthRequest, res: Response) => {
    try {
      const { portfolioId } = req.params;
      const userId = req.user?.userId;

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      const summary = await this.importService.getSummary(portfolioId);
      res.json(summary);
    } catch (error) {
      console.error('Summary error:', error);
      res.status(500).json({ error: 'Failed to get summary' });
    }
  };

  getTransactions = async (req: AuthRequest, res: Response) => {
    try {
      const { portfolioId } = req.params;
      const userId = req.user?.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      const result = await this.importService.getTransactions(portfolioId, limit, offset);
      res.json(result);
    } catch (error) {
      console.error('Transactions error:', error);
      res.status(500).json({ error: 'Failed to get transactions' });
    }
  };
}
