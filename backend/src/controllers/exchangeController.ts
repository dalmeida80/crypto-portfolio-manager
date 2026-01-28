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
import { Trading212HoldingsService } from '../services/Trading212HoldingsService';

const tradeImportService = new TradeImportService();
const binanceHoldingsService = new BinanceHoldingsService();
const trading212HoldingsService = new Trading212HoldingsService();
const trading212HoldingsService = new Trading212HoldingsService();

// ... rest of file unchanged

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
