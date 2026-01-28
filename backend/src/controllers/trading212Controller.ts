import { Response } from 'express';
import { Trading212ImportService } from '../services/Trading212ImportService';
import { Trading212ApiService } from '../services/trading212ApiService';
import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { AuthRequest } from '../middleware/authenticate';
import { In } from 'typeorm';

export class Trading212Controller {
  private importService = new Trading212ImportService();
  
  private get portfolioRepo() {
    return AppDataSource.getRepository(Portfolio);
  }

  private get tradeRepo() {
    return AppDataSource.getRepository(Trade);
  }

  private get apiKeyRepo() {
    return AppDataSource.getRepository(ExchangeApiKey);
  }

  /**
   * Helper: Get active Trading212 API key for user
   */
  private async getApiKey(userId: string): Promise<ExchangeApiKey | null> {
    return await this.apiKeyRepo.findOne({
      where: {
        userId,
        exchange: 'trading212',
        isActive: true
      }
    });
  }

  /**
   * Helper: Map Trading212 ticker to symbol (remove _US_EQ suffix)
   */
  private normalizeSymbol(ticker: string): string {
    return ticker.replace(/_US_EQ$|_UK_EQ$|_DE_EQ$/i, '');
  }

  /**
   * NEW: Sync holdings from Trading212 API
   * POST /portfolios/:portfolioId/trading212/sync-holdings
   */
  syncHoldings = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212 API] Sync holdings request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate portfolio
      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      if (portfolio.exchange !== 'trading212') {
        return res.status(400).json({ error: 'Portfolio is not a Trading212 account' });
      }

      // Get API key
      const apiKey = await this.getApiKey(userId);
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'No active Trading212 API key found',
          hint: 'Please add your Trading212 API credentials in Settings'
        });
      }

      // Get environment from env vars (default: live)
      const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';

      // Create API service
      const apiService = await Trading212ApiService.createFromApiKey(apiKey, environment);

      // Test connection
      const connected = await apiService.testConnection();
      if (!connected) {
        return res.status(401).json({ error: 'Failed to connect to Trading212 API. Check your credentials.' });
      }

      // Fetch holdings
      console.log('[Trading212 API] Fetching portfolio holdings...');
      const holdings = await apiService.getPortfolio();
      console.log(`[Trading212 API] Found ${holdings.length} holdings`);

      // Fetch account cash
      const accountCash = await apiService.getAccountCash();
      console.log(`[Trading212 API] Account cash: €${accountCash.free}`);

      res.json({
        success: true,
        holdings: holdings.map(h => ({
          ticker: h.ticker,
          symbol: this.normalizeSymbol(h.ticker),
          quantity: h.quantity,
          averagePrice: h.averagePrice,
          currentPrice: h.currentPrice,
          totalValue: h.quantity * h.currentPrice,
          ppl: h.ppl,
          initialFillDate: h.initialFillDate
        })),
        cash: {
          free: accountCash.free,
          total: accountCash.total,
          invested: accountCash.invested,
          result: accountCash.result
        },
        summary: {
          totalHoldings: holdings.length,
          totalValue: holdings.reduce((sum, h) => sum + (h.quantity * h.currentPrice), 0),
          freeCash: accountCash.free
        }
      });
    } catch (error) {
      console.error('[Trading212 API] Sync holdings error:', error);
      res.status(500).json({
        error: 'Failed to sync holdings',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * NEW: Import orders from Trading212 API
   * POST /portfolios/:portfolioId/trading212/sync-orders
   */
  syncOrders = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212 API] Sync orders request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate portfolio
      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      if (portfolio.exchange !== 'trading212') {
        return res.status(400).json({ error: 'Portfolio is not a Trading212 account' });
      }

      // Get API key
      const apiKey = await this.getApiKey(userId);
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'No active Trading212 API key found',
          hint: 'Please add your Trading212 API credentials in Settings'
        });
      }

      // Get environment from env vars
      const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';

      // Create API service
      const apiService = await Trading212ApiService.createFromApiKey(apiKey, environment);

      // Fetch all filled orders
      console.log('[Trading212 API] Fetching order history...');
      const allOrders = await apiService.getAllOrders(50);
      const filledOrders = allOrders.filter(order => order.status === 'FILLED');
      console.log(`[Trading212 API] Found ${filledOrders.length} filled orders`);

      if (filledOrders.length === 0) {
        return res.json({
          success: true,
          imported: 0,
          updated: 0,
          skipped: 0,
          message: 'No filled orders found'
        });
      }

      // Delete existing API-sourced trades to avoid duplicates
      await this.tradeRepo.delete({
        portfolioId,
        source: 'trading212-api'
      });
      console.log('[Trading212 API] Cleared existing API trades');

      // Convert orders to Trade entities
      const trades = filledOrders.map(order => {
        const trade = new Trade();
        trade.portfolioId = portfolioId;
        trade.symbol = this.normalizeSymbol(order.ticker);
        trade.type = order.side.toUpperCase() as 'BUY' | 'SELL';
        trade.quantity = order.filledQuantity || order.quantity;
        trade.price = order.averagePrice || 0;
        trade.total = order.filledValue || (trade.quantity * trade.price);
        trade.fee = 0; // Trading212 has no commission
        trade.executedAt = new Date(order.fillTime || order.createdOn);
        trade.externalId = order.id.toString();
        trade.source = 'trading212-api';
        trade.notes = `Order type: ${order.type}`;
        return trade;
      });

      // Save trades
      await this.tradeRepo.save(trades);
      console.log(`[Trading212 API] Imported ${trades.length} trades`);

      res.json({
        success: true,
        imported: trades.length,
        updated: 0,
        skipped: 0,
        summary: {
          totalOrders: allOrders.length,
          filledOrders: filledOrders.length,
          buyOrders: filledOrders.filter(o => o.side === 'buy').length,
          sellOrders: filledOrders.filter(o => o.side === 'sell').length
        }
      });
    } catch (error) {
      console.error('[Trading212 API] Sync orders error:', error);
      res.status(500).json({
        error: 'Failed to sync orders',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  /**
   * NEW: Import transactions from Trading212 API
   * POST /portfolios/:portfolioId/trading212/sync-transactions
   */
  syncTransactions = async (req: AuthRequest, res: Response) => {
    try {
      console.log('[Trading212 API] Sync transactions request');
      const { portfolioId } = req.params;
      const userId = req.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Validate portfolio
      const portfolio = await this.portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return res.status(404).json({ error: 'Portfolio not found' });
      }

      if (portfolio.exchange !== 'trading212') {
        return res.status(400).json({ error: 'Portfolio is not a Trading212 account' });
      }

      // Get API key
      const apiKey = await this.getApiKey(userId);
      if (!apiKey) {
        return res.status(400).json({ 
          error: 'No active Trading212 API key found',
          hint: 'Please add your Trading212 API credentials in Settings'
        });
      }

      // Get environment from env vars
      const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';

      // Create API service
      const apiService = await Trading212ApiService.createFromApiKey(apiKey, environment);

      // Fetch transactions and dividends
      console.log('[Trading212 API] Fetching transactions and dividends...');
      const [transactions, dividends] = await Promise.all([
        apiService.getAllTransactions(50),
        apiService.getAllDividends(50)
      ]);

      console.log(`[Trading212 API] Found ${transactions.length} transactions, ${dividends.length} dividends`);

      res.json({
        success: true,
        transactions: transactions.map(t => ({
          type: t.type,
          amount: t.amount,
          dateTime: t.dateTime,
          reference: t.reference
        })),
        dividends: dividends.map(d => ({
          ticker: d.ticker,
          symbol: this.normalizeSymbol(d.ticker),
          amount: d.amount,
          amountInEuro: d.amountInEuro,
          quantity: d.quantity,
          grossAmountPerShare: d.grossAmountPerShare,
          paidOn: d.paidOn,
          type: d.type
        })),
        summary: {
          totalTransactions: transactions.length,
          deposits: transactions.filter(t => t.type === 'DEPOSIT').length,
          withdrawals: transactions.filter(t => t.type === 'WITHDRAWAL').length,
          totalDividends: dividends.length,
          totalDividendAmount: dividends.reduce((sum, d) => sum + d.amountInEuro, 0)
        }
      });
    } catch (error) {
      console.error('[Trading212 API] Sync transactions error:', error);
      res.status(500).json({
        error: 'Failed to sync transactions',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };

  // ===== EXISTING CSV METHODS (KEEP AS FALLBACK) =====

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
