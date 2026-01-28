import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import {
  createPortfolio,
  listPortfolios,
  getPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolioClosedPositions,
  getPortfolioTransfers,
  getPortfolioStats,
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
import {
  getPortfolioBalances,
} from '../controllers/portfolioBalanceController';
import {
  getTicker,
  placeLimitOrder,
  listOrders,
  cancelOrder,
} from '../controllers/revolutXController';

const router = Router();

// Portfolio routes
router.post('/', authenticate, createPortfolio);
router.get('/', authenticate, listPortfolios);

// Global user stats endpoint - must be before /:portfolioId to avoid collision
router.get('/stats', authenticate, getUserStats);

router.get('/:portfolioId', authenticate, getPortfolio);
router.put('/:portfolioId', authenticate, updatePortfolio);
router.delete('/:portfolioId', authenticate, deletePortfolio);

// Portfolio-specific stats
router.get('/:portfolioId/stats', authenticate, getPortfolioStats);

// Simple balance view (no P/L tracking)
router.get('/:portfolioId/balances', authenticate, getPortfolioBalances);

// Closed positions and transfers
router.get('/:portfolioId/closed-positions', authenticate, getPortfolioClosedPositions);
router.get('/:portfolioId/transfers', authenticate, getPortfolioTransfers);

// Trade routes
router.post('/:portfolioId/trades', authenticate, addTrade);
router.get('/:portfolioId/trades', authenticate, listTrades);
router.delete('/:portfolioId/trades/:tradeId', authenticate, deleteTrade);

// Revolut X ticker (real-time prices)
router.get('/:portfolioId/ticker/:symbol', authenticate, getTicker);

// Revolut X orders
router.post('/:portfolioId/orders/limit', authenticate, placeLimitOrder);
router.get('/:portfolioId/orders', authenticate, listOrders);
router.delete('/:portfolioId/orders/:orderId', authenticate, cancelOrder);

// NOTE: Trading212 routes are now in trading212Routes.ts to avoid duplication
// They are mounted at /api/portfolios in index.ts

// Sync and analytics
router.post('/:portfolioId/sync', authenticate, syncBinanceTrades);
router.get('/:portfolioId/analytics', authenticate, getPortfolioAnalytics);

export default router;
