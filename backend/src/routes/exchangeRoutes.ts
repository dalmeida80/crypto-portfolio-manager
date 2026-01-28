import { Router } from 'express';
import { 
  addApiKey, 
  listApiKeys, 
  deleteApiKey,
  getBalances,
  importAllTrades,
  importRevolutXCsv,
  getImportStatus,
  syncBinanceHoldings,
  syncTrading212Holdings
} from '../controllers/exchangeController';
import { authenticate } from '../middleware/auth';

const router = Router();

// API Key management
router.post('/api-keys', authenticate, addApiKey);
router.get('/api-keys', authenticate, listApiKeys);
router.delete('/api-keys/:id', authenticate, deleteApiKey);
router.get('/api-keys/:apiKeyId/balances', authenticate, getBalances);

// Trade import (uses portfolio.exchange to filter which APIs to use)
router.post('/portfolios/:portfolioId/import-all', authenticate, importAllTrades);
router.post('/portfolios/:portfolioId/import-csv', authenticate, importRevolutXCsv);
router.get('/portfolios/:portfolioId/import-status', authenticate, getImportStatus);

// Binance holdings sync
router.post('/portfolios/:portfolioId/sync-holdings', authenticate, syncBinanceHoldings);
// Trading212 holdings sync
router.post('/portfolios/:portfolioId/sync-trading212-holdings', authenticate, syncTrading212Holdings);

export default router;
