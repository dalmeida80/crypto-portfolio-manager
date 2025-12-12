import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPortfolio,
  listPortfolios,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
} from '../controllers/portfolioController';
import {
  addTrade,
  listTrades,
  deleteTrade,
} from '../controllers/tradeController';
import {
  syncBinanceTrades,
  getPortfolioAnalytics,
} from '../controllers/syncController';

const router = Router();

// Portfolio routes
router.post('/', authenticate, createPortfolio);
router.get('/', authenticate, listPortfolios);
router.get('/:portfolioId', authenticate, getPortfolio);
router.put('/:portfolioId', authenticate, updatePortfolio);
router.delete('/:portfolioId', authenticate, deletePortfolio);

// Trade routes
router.post('/:portfolioId/trades', authenticate, addTrade);
router.get('/:portfolioId/trades', authenticate, listTrades);
router.delete('/:portfolioId/trades/:tradeId', authenticate, deleteTrade);

// Sync and analytics
router.post('/:portfolioId/sync', authenticate, syncBinanceTrades);
router.get('/:portfolioId/analytics', authenticate, getPortfolioAnalytics);

export default router;
