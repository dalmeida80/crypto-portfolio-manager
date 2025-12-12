import { Response } from 'express';
import { AppDataSource } from '../index';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { AuthRequest } from '../middleware/auth';
import { encrypt } from '../utils/encryption';
import { BinanceService } from '../services/binanceService';

export const addApiKey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { apiKey, apiSecret, label } = req.body;
    const userId = req.user!.userId;

    if (!apiKey || !apiSecret) {
      res.status(400).json({ error: 'API key and secret are required' });
      return;
    }

    // Test connection
    const binance = new BinanceService(apiKey, apiSecret);
    const isValid = await binance.testConnection();

    if (!isValid) {
      res.status(400).json({ error: 'Invalid API credentials' });
      return;
    }

    const exchangeApiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);

    const exchangeApiKey = new ExchangeApiKey();
    exchangeApiKey.userId = userId;
    exchangeApiKey.exchange = 'binance';
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

    const binance = await BinanceService.createFromApiKey(apiKey);
    const balances = await binance.getAccountBalances();

    res.json({ balances });
  } catch (error) {
    console.error('Get balances error:', error);
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
};
