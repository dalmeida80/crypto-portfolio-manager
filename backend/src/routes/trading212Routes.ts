import { Router } from 'express';
import multer from 'multer';
import { Trading212Controller } from '../controllers/trading212Controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new Trading212Controller();

router.post('/:portfolioId/trading212/import', authenticate, upload.single('file'), controller.importCSV);
router.get('/:portfolioId/trading212/summary', authenticate, controller.getSummary);
router.get('/:portfolioId/trading212/transactions', authenticate, controller.getTransactions);

export default router;
