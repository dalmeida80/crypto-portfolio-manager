import { Router } from 'express';
import { addApiKey, listApiKeys, getBalances } from '../controllers/exchangeController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/api-keys', authenticate, addApiKey);
router.get('/api-keys', authenticate, listApiKeys);
router.get('/api-keys/:apiKeyId/balances', authenticate, getBalances);

export default router;
