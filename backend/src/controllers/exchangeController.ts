import { Response } from 'express';
import { AppDataSource } from '../index';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { Transfer } from '../entities/Transfer';
import { AuthRequest } from '../middleware/auth';
import { encrypt } from '../utils/encryption';
import { BinanceService } from '../services/binanceService';
import { RevolutXService } from '../services/revolutXService';
import { Trading212ApiService } from '../services/trading212ApiService';
import { TradeImportService } from '../services/tradeImportService';
import { RevolutXCsvParser } from '../services/revolutXCsvParser';
import { BinanceHoldingsService } from '../services/BinanceHoldingsService';
import { Trading212HoldingsService } from '../services/Trading212HoldingsService';

const tradeImportService = new TradeImportService();
const binanceHoldingsService = new BinanceHoldingsService();
const trading212HoldingsService = new Trading212HoldingsService();

export const addApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { apiKey, apiSecret, label, exchange = 'binance' } = req.body;
    const userId = req.user!.userId;

    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'API key and secret are required' });
      return;
    }

    if (!['binance', 'revolutx', 'trading212'].includes(exchange)) {
      res.status(400).json({ error: 'Invalid exchange. Supported: binance, revolutx, trading212' });
      return;
    }

    // Test connection based on exchange type
    let isValid = false;

    if (exchange === 'binance') {
      const binance = new BinanceService(apiKey, apiSecret);
      isValid = await binance.testConnection();
    } else if (exchange === 'revolutx') {
      const revolutX = new RevolutXService(apiKey, apiSecret);
      isValid = await revolutX.testConnection();
    } else if (exchange === 'trading212') {
      const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';
      const trading212 = new Trading212ApiService({ apiKey, apiSecret, environment });
      isValid = await trading212.testConnection();
    }

    if (!isValid) {
      res.status(400).json({ error: 'Invalid API credentials' });
      return;
    }

    const exchangeApiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);

    const exchangeApiKey = new ExchangeApiKey();
    exchangeApiKey.userId = userId;
    exchangeApiKey.exchange = exchange;
    exchangeApiKey.apiKey = encrypt(apiKey);
    exchangeApiKey.apiSecret = encrypt(apiSecret);
    exchangeApiKey.label = label;
    exchangeApiKey.isActive = true;

    await exchangeApiKeyRepo.save(exchangeApiKey);

    res.status(201).json({
      message: 'API key added successfully',
      apiKey: {
        id: exchangeApiKey.id,
        exchange: exchangeApiKey.exchange,
        label: exchangeApiKey.label,
        isActive: exchangeApiKey.isActive,
        createdAt: exchangeApiKey.createdAt,
      },
    });
  } catch (error) {
    console.error('Add API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const listApiKeys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const exchangeApiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);

    const apiKeys = await exchangeApiKeyRepo.find({ where: { userId } });

    res.json({
      apiKeys: apiKeys.map(key => ({
        id: key.id,
        exchange: key.exchange,
        label: key.label,
        isActive: key.isActive,
        createdAt: key.createdAt,
      })),
    });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const exchangeApiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
    const apiKey = await exchangeApiKeyRepo.findOne({ where: { id, userId } });

    if (!apiKey) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    await exchangeApiKeyRepo.remove(apiKey);
    res.json({ message: 'API key deleted successfully' });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBalances = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { apiKeyId } = req.params;

    const exchangeApiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
    const apiKey = await exchangeApiKeyRepo.findOne({ where: { id: apiKeyId, userId } });

    if (!apiKey) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    let balances: any[];

    if (apiKey.exchange === 'binance') {
      const binance = await BinanceService.createFromApiKey(apiKey);
      balances = await binance.getAccountBalances();
    } else if (apiKey.exchange === 'revolutx') {
      const revolutX = await RevolutXService.createFromApiKey(apiKey);
      balances = await revolutX.getAccountBalances();
    } else if (apiKey.exchange === 'trading212') {
      const environment = (process.env.TRADING212_ENV as 'demo' | 'live') || 'live';
      const trading212 = await Trading212ApiService.createFromApiKey(apiKey, environment);
      const portfolio = await trading212.getPortfolio();
      const cash = await trading212.getAccountCash();
      
      // Convert Trading212 format to standard balance format
      balances = portfolio.map(holding => ({
        asset: holding.ticker.replace(/_US_EQ$|_UK_EQ$|_DE_EQ$/i, ''),
        free: holding.quantity,
        locked: 0,
        total: holding.quantity
      }));
      
      // Add cash balance
      if (cash.free > 0) {
        balances.push({
          asset: 'EUR',
          free: cash.free,
          locked: cash.blocked,
          total: cash.total
        });
      }
    } else {
      res.status(400).json({ error: 'Unsupported exchange' });
      return;
    }

    res.json({ balances });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};

/**
 * Import trades from all matching API keys for a portfolio
 * Filtered by portfolio.exchange if set
 */
export const importAllTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { startDate } = req.body;

    let parsedStartDate: Date | undefined;
    if (startDate) {
      parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        res.status(400).json({ error: 'Invalid start date format' });
        return;
      }
    }

    const result = await tradeImportService.importFromAllSources(
      portfolioId,
      userId,
      parsedStartDate
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.json(result);
  } catch (error: any) {
    console.error('Import all trades error:', error);
    res.status(500).json({ 
      error: 'Failed to import trades',
      message: error.message 
    });
  }
};

/**
 * Sync current Binance holdings to portfolio
 * Creates synthetic trades to reflect current balances (Spot, Earn, Savings)
 */
export const syncBinanceHoldings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    const result = await binanceHoldingsService.syncHoldings(portfolioId, userId);

    res.json(result);
  } catch (error: any) {
    console.error('Sync Binance holdings error:', error);
    res.status(500).json({ 
      error: 'Failed to sync holdings',
      message: error.message 
    });
  }
};

/**
 * Import deposits from Revolut X CSV file
 * Expects CSV content in request body
 */
export const importRevolutXCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { csvContent } = req.body;

    if (!csvContent) {
      res.status(400).json({ error: 'CSV content is required' });
      return;
    }

    // Parse CSV
    const { deposits, trades } = RevolutXCsvParser.parseCSV(csvContent);

    // Import deposits as transfers
    const transferRepo = AppDataSource.getRepository(Transfer);
    
    let depositsImported = 0;
    let depositsSkipped = 0;

    for (const deposit of deposits) {
      // Create unique external ID based on timestamp and amount
      const externalId = `revolutx-csv-${deposit.timestamp.getTime()}-${deposit.amount}`;

      // Check if already exists
      const existing = await transferRepo.findOne({
        where: { portfolioId, externalId }
      });

      if (existing) {
        depositsSkipped++;
        continue;
      }

      const transfer = new Transfer();
      transfer.portfolioId = portfolioId;
      transfer.type = deposit.type;
      transfer.asset = deposit.currency;
      transfer.amount = deposit.amount;
      transfer.fee = 0;
      transfer.executedAt = deposit.timestamp;
      transfer.source = 'revolutx-csv';
      transfer.externalId = externalId;
      transfer.notes = `${deposit.type} from CSV import`;

      await transferRepo.save(transfer);
      depositsImported++;
    }

    console.log(`[RevolutX CSV] Imported ${depositsImported} deposits (${depositsSkipped} skipped)`);
    console.log(`[RevolutX CSV] Found ${trades.length} trades (use API import for trades)`);

    res.json({
      success: true,
      depositsImported,
      depositsSkipped,
      tradesFound: trades.length,
      message: `Imported ${depositsImported} deposits from CSV. Use regular API import for trades.`
    });
  } catch (error: any) {
    console.error('Import Revolut X CSV error:', error);
    res.status(500).json({ 
      error: 'Failed to import CSV',
      message: error.message 
    });
  }
};

/**
 * Get import status for a portfolio
 */
export const getImportStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { portfolioId } = req.params;

    const status = await tradeImportService.getImportStatus(portfolioId);
    res.json(status);
  } catch (error: any) {
    console.error('Get import status error:', error);
    res.status(500).json({ 
      error: 'Failed to get import status',
      message: error.message 
    });
  }
};

/**
 * Sync current Trading212 holdings to portfolio
 * Creates synthetic trades to reflect current balances
 */
export const syncTrading212Holdings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    const result = await trading212HoldingsService.syncHoldings(portfolioId, userId);

    res.json(result);
  } catch (error: any) {
    console.error('Sync Trading212 holdings error:', error);
    res.status(500).json({ 
      error: 'Failed to sync holdings',
      message: error.message 
    });
  }
};
