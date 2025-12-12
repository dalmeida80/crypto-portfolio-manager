import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { BinanceService } from './binanceService';

export class SyncService {
  static async syncBinanceTrades(
    portfolioId: string,
    apiKeyId: string,
    userId: string
  ): Promise<{ imported: number; skipped: number }> {
    try {
      const portfolioRepo = AppDataSource.getRepository(Portfolio);
      const portfolio = await portfolioRepo.findOne({
        where: { id: portfolioId, userId },
      });

      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
      const apiKey = await apiKeyRepo.findOne({
        where: { id: apiKeyId, userId },
      });

      if (!apiKey) {
        throw new Error('API key not found');
      }

      const binance = await BinanceService.createFromApiKey(apiKey);
      const binanceTrades = await binance.getTradeHistory();

      const tradeRepo = AppDataSource.getRepository(Trade);
      let imported = 0;
      let skipped = 0;

      for (const bTrade of binanceTrades) {
        const externalId = `binance-${bTrade.id}`;

        // Check if trade already exists
        const existingTrade = await tradeRepo.findOne({
          where: { externalId, portfolioId },
        });

        if (existingTrade) {
          skipped++;
          continue;
        }

        const trade = new Trade();
        trade.portfolioId = portfolioId;
        trade.symbol = bTrade.symbol;
        trade.type = bTrade.isBuyer ? 'BUY' : 'SELL';
        trade.quantity = parseFloat(bTrade.qty);
        trade.price = parseFloat(bTrade.price);
        trade.fee = parseFloat(bTrade.commission);
        trade.total = parseFloat(bTrade.quoteQty);
        trade.executedAt = new Date(bTrade.time);
        trade.externalId = externalId;
        trade.source = 'binance';

        await tradeRepo.save(trade);
        imported++;
      }

      return { imported, skipped };
    } catch (error) {
      throw new Error(`Sync failed: ${error}`);
    }
  }
}
