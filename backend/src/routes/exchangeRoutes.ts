import { Router } from 'express';
import { 
  addApiKey, 
  listApiKeys, 
  deleteApiKey,
  getBalances,
  importTrades,
  importAllTrades,
  getImportStatus
} from '../controllers/exchangeController';
import { authenticate } from '../middleware/auth';

const router = Router();

// API Key management
router.post('/api-keys', authenticate, addApiKey);
router.get('/api-keys', authenticate, listApiKeys);
router.delete('/api-keys/:id', authenticate, deleteApiKey);
router.get('/api-keys/:apiKeyId/balances', authenticate, getBalances);

// Trade import
router.post('/portfolios/:portfolioId/import', authenticate, importTrades);
router.post('/portfolios/:portfolioId/import-all', authenticate, importAllTrades);
router.get('/portfolios/:portfolioId/import-status', authenticate, getImportStatus);

export default router;
