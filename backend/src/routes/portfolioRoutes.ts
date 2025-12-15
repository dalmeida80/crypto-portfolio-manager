import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createPortfolio,
  listPortfolios,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolioClosedPositions,
  getPortfolioTransfers,
  getUserStats,
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

// Stats endpoint - must be before /:portfolioId to avoid collision
router.get('/stats', authenticate, getUserStats);

router.get('/:portfolioId', authenticate, getPortfolio);
router.put('/:portfolioId', authenticate, updatePortfolio);
router.delete('/:portfolioId', authenticate, deletePortfolio);

// Closed positions and transfers
router.get('/:portfolioId/closed-positions', authenticate, getPortfolioClosedPositions);
router.get('/:portfolioId/transfers', authenticate, getPortfolioTransfers);

// Trade routes
router.post('/:portfolioId/trades', authenticate, addTrade);
router.get('/:portfolioId/trades', authenticate, listTrades);
router.delete('/:portfolioId/trades/:tradeId', authenticate, deleteTrade);

// Sync and analytics
router.post('/:portfolioId/sync', authenticate, syncBinanceTrades);
router.get('/:portfolioId/analytics', authenticate, getPortfolioAnalytics);

export default router;
