import { Router } from 'express';
import multer from 'multer';
import { Trading212Controller } from '../controllers/trading212Controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new Trading212Controller();

// Trading212 CSV import (existing fallback)
router.post('/:portfolioId/trading212/import', authenticate, upload.single('file'), controller.importCSV);

// Trading212 API sync routes (NEW)
router.post('/:portfolioId/trading212/sync-holdings', authenticate, controller.syncHoldings);
router.post('/:portfolioId/trading212/sync-orders', authenticate, controller.syncOrders);
router.post('/:portfolioId/trading212/sync-transactions', authenticate, controller.syncTransactions);

// Trading212 data retrieval
router.get('/:portfolioId/trading212/summary', authenticate, controller.getSummary);
router.get('/:portfolioId/trading212/transactions', authenticate, controller.getTransactions);
router.get('/:portfolioId/trading212/holdings', authenticate, controller.getHoldings);
router.get('/:portfolioId/trading212/totals', authenticate, controller.getTotals);

export default router;
