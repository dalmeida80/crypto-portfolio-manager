import { Router } from 'express';
import { authenticate } from '../middleware/auth';
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
router.post('/portfolio/:portfolioId/refresh', authenticate, refreshPortfolio);
router.get('/portfolio/:portfolioId/holdings', authenticate, getPortfolioHoldings);
router.post('/portfolios/refresh', authenticate, refreshUserPortfolios);
router.post('/cache/clear', authenticate, clearCache);

export default router;
