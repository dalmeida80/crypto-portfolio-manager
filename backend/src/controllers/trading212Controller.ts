import { Response } from 'express';
import { Trading212ImportService } from '../services/Trading212ImportService';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { AuthRequest } from '../middleware/authenticate';

export class Trading212Controller {
  private importService = new Trading212ImportService();
  
  private get portfolioRepo() {
    return AppDataSource.getRepository(Portfolio);
  }

  importCSV = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212] Import CSV request received');
      const { portfolioId } = req.params;
      const userId = req.userId;

      console.log(`[Trading212] Portfolio ID: ${portfolioId}, User ID: ${userId}`);

      if (!req.file) {
        console.error('[Trading212] No file uploaded');
        return res.status(400).json({ error: 'CSV file is required' });
      }

      console.log(`[Trading212] File received: ${req.file.originalname}, size: ${req.file.size}`);

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        console.error(`[Trading212] Portfolio not found: ${portfolioId}`);
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      console.log(`[Trading212] Portfolio found: ${portfolio.name}, exchange: ${portfolio.exchange}`);

      if (portfolio.exchange !== 'trading212') {
        console.error(`[Trading212] Invalid exchange: ${portfolio.exchange}`);
        return res.status(400).json({ error: 'Portfolio is not a Trading212 account' });
      }

      console.log('[Trading212] Starting CSV import...');
      const result = await this.importService.importCSV(portfolioId, req.file.buffer);
      console.log(`[Trading212] Import complete: ${JSON.stringify(result)}`);

      res.json({
        message: 'Import completed',
        ...result
      });
    } catch (error) {
      console.error('[Trading212] Import error:', error);
      res.status(500).json({ 
        error: 'Failed to import CSV',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getSummary = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212] Get summary request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      console.log(`[Trading212] Summary - Portfolio ID: ${portfolioId}, User ID: ${userId}`);

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        console.error(`[Trading212] Portfolio not found for summary: ${portfolioId}`);
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      console.log('[Trading212] Fetching summary...');
      const summary = await this.importService.getSummary(portfolioId);
      console.log(`[Trading212] Summary: ${JSON.stringify(summary)}`);
      res.json(summary);
    } catch (error) {
      console.error('[Trading212] Summary error:', error);
      res.status(500).json({ 
        error: 'Failed to get summary',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getTransactions = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212] Get transactions request');
      const { portfolioId } = req.params;
      const userId = req.userId;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      console.log(`[Trading212] Transactions - Portfolio: ${portfolioId}, User: ${userId}`);

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        console.error(`[Trading212] Portfolio not found for transactions: ${portfolioId}`);
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      console.log(`[Trading212] Fetching transactions (limit: ${limit}, offset: ${offset})...`);
      const result = await this.importService.getTransactions(portfolioId, limit, offset);
      console.log(`[Trading212] Found ${result.total} transactions`);
      res.json(result);
    } catch (error) {
      console.error('[Trading212] Transactions error:', error);
      res.status(500).json({ 
        error: 'Failed to get transactions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getHoldings = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212] Get holdings request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        console.error(`[Trading212] Portfolio not found for holdings: ${portfolioId}`);
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      console.log('[Trading212] Fetching holdings...');
      const holdings = await this.importService.getHoldings(portfolioId);
      console.log(`[Trading212] Found ${holdings.length} holdings`);
      res.json(holdings);
    } catch (error) {
      console.error('[Trading212] Holdings error:', error);
      res.status(500).json({ 
        error: 'Failed to get holdings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  getTotals = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212] Get totals request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        console.error(`[Trading212] Portfolio not found for totals: ${portfolioId}`);
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      console.log('[Trading212] Calculating totals...');
      const totals = await this.importService.getPortfolioTotals(portfolioId);
      console.log(`[Trading212] Totals: ${JSON.stringify(totals)}`);
      res.json(totals);
    } catch (error) {
      console.error('[Trading212] Totals error:', error);
      res.status(500).json({ 
        error: 'Failed to get totals',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}
