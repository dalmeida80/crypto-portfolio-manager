import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SyncService } from '../services/syncService';
import { AnalyticsService } from '../services/analyticsService';

export const syncBinanceTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;
    const { apiKeyId } = req.body;

    if (!apiKeyId) {
      res.status(400).json({ error: 'API key ID is required' });
      return;
    }

    const result = await SyncService.syncBinanceTrades(portfolioId, apiKeyId, userId);

    res.json({
      message: 'Sync completed successfully',
      ...result,
    });
  } catch (error) {
    console.error('Sync trades error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
};

/**
 * Get portfolio analytics with EUR conversion
 * Calculates holdings, P/L, and converts all values to EUR
 */
export const getPortfolioAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { portfolioId } = req.params;

    const analytics = await AnalyticsService.calculatePortfolioMetrics(
      portfolioId,
      userId
    );

    res.json(analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to calculate analytics' });
  }
};
