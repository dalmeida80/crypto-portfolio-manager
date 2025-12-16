import { Response } from 'express';
import { AppDataSource } from '../index';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { AuthRequest } from '../middleware/auth';
import { encrypt } from '../utils/encryption';
import { BinanceService } from '../services/binanceService';
import { RevolutXService } from '../services/revolutXService';
import { TradeImportService } from '../services/tradeImportService';

const tradeImportService = new TradeImportService();

export const addApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { apiKey, apiSecret, label, exchange = 'binance' } = req.body;
    const userId = req.user!.userId;

    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'API key and secret are required' });
      return;
    }

    if (!['binance', 'revolutx'].includes(exchange)) {
      res.status(400).json({ error: 'Invalid exchange. Supported: binance, revolutx' });
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
