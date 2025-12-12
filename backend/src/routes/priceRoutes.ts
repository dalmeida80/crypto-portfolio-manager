import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getPrice,
  getPrices,
  refreshPortfolio,
  getPortfolioHoldings,
  refreshUserPortfolios,
  clearCache,
  getCacheStats
} from '../controllers/priceController';

const router = Router();

// Public routes (no auth needed for price checks)
router.get('/price/:symbol', getPrice);
router.post('/prices', getPrices);
router.get('/cache/stats', getCacheStats);

// Protected routes (require authentication)
router.post('/portfolio/:portfolioId/refresh', authenticateToken, refreshPortfolio);
router.get('/portfolio/:portfolioId/holdings', authenticateToken, getPortfolioHoldings);
router.post('/portfolios/refresh', authenticateToken, refreshUserPortfolios);
router.post('/cache/clear', authenticateToken, clearCache);

export default router;
