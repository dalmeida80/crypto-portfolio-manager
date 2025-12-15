import { AppDataSource } from '../index';
import { Trade } from '../entities/Trade';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { BinanceService } from './binanceService';
import { PortfolioUpdateService } from './portfolioUpdateService';

interface BinanceTrade {
  id: number;
  symbol: string;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: number;
  trades: Trade[];
  deposits?: number;
  withdrawals?: number;
  message: string;
}

export class TradeImportService {
  private portfolioUpdateService: PortfolioUpdateService;

  constructor() {
    this.portfolioUpdateService = new PortfolioUpdateService();
  }

  /**
   * Import ALL trades from Binance for a specific portfolio
   * Now uses getAllMyTrades() to fetch everything
   */
  async importTrades(
    portfolioId: string,
    apiKeyId: string,
    userId: string,
    startDate?: Date
  ): Promise<ImportResult> {
    const tradeRepo = AppDataSource.getRepository(Trade);
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);

    try {
      // Verify portfolio ownership
      const portfolio = await portfolioRepo.findOne({
        where: { id: portfolioId, userId }
      });

      if (!portfolio) {
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: 1,
          trades: [],
          message: 'Portfolio not found or access denied'
        };
      }

      // Get API key
      const apiKey = await apiKeyRepo.findOne({
        where: { id: apiKeyId, userId }
      });

      if (!apiKey) {
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: 1,
          trades: [],
          message: 'API key not found or access denied'
        };
      }

      // Create Binance service
      const binance = await BinanceService.createFromApiKey(apiKey);

      const startTime = startDate ? startDate.getTime() : undefined;

      console.log('=== STARTING COMPREHENSIVE IMPORT ===');
      if (startDate) {
        console.log(`Import start date: ${startDate.toISOString()}`);
      }

      // Fetch ALL trades using the new comprehensive method
      console.log('Fetching ALL trades from Binance...');
      const allBinanceTrades = await binance.getAllMyTrades(startTime);

      console.log(`Total trades fetched from Binance: ${allBinanceTrades.length}`);

      // Fetch deposits
      console.log('Fetching deposit history...');
      const deposits = await binance.getDepositHistory(startTime);
      console.log(`Total deposits: ${deposits.length}`);

      // Fetch withdrawals
      console.log('Fetching withdrawal history...');
      const withdrawals = await binance.getWithdrawHistory(startTime);
      console.log(`Total withdrawals: ${withdrawals.length}`);

      // Remove duplicates by trade ID
      const uniqueTrades = Array.from(
        new Map(allBinanceTrades.map(t => [t.id, t])).values()
      );

      console.log(`Unique trades after deduplication: ${uniqueTrades.length}`);

      // Filter by start date if provided (double check)
      let filteredTrades = uniqueTrades;
      if (startDate) {
        filteredTrades = uniqueTrades.filter(
          t => new Date(t.time) >= startDate
        );
        console.log(`Trades after date filter: ${filteredTrades.length}`);
      }

      // Sort by date (oldest first)
      filteredTrades.sort((a, b) => a.time - b.time);

      // Get existing external IDs to avoid duplicates
      const existingTrades = await tradeRepo.find({
        where: { portfolioId },
        select: ['externalId']
      });
      
      const existingExternalIds = new Set(
        existingTrades
          .filter(t => t.externalId)
          .map(t => t.externalId)
      );

      console.log(`Existing trades in database: ${existingExternalIds.size}`);

      // Import trades
      let imported = 0;
      let skipped = 0;
      const importedTrades: Trade[] = [];

      // Import regular trades
      for (const binanceTrade of filteredTrades) {
        const externalId = `binance-${binanceTrade.id}`;

        // Skip if already imported
        if (existingExternalIds.has(externalId)) {
          skipped++;
          continue;
        }

        const trade = new Trade();
        trade.portfolioId = portfolioId;
        trade.symbol = binanceTrade.symbol;
        trade.type = binanceTrade.isBuyer ? 'BUY' : 'SELL';
        trade.quantity = parseFloat(binanceTrade.qty);
        trade.price = parseFloat(binanceTrade.price);
        trade.fee = parseFloat(binanceTrade.commission);
        trade.total = parseFloat(binanceTrade.quoteQty);
        trade.executedAt = new Date(binanceTrade.time);
        trade.externalId = externalId;
        trade.source = 'binance';

        await tradeRepo.save(trade);
        importedTrades.push(trade);
        imported++;
      }

      // Import deposits as BUY trades
      let depositsImported = 0;
      for (const deposit of deposits) {
        const externalId = `binance-deposit-${deposit.txId || deposit.id}`;
        
        if (existingExternalIds.has(externalId)) {
          skipped++;
          continue;
        }

        // Create synthetic symbol (e.g., BTCUSDT for BTC deposit)
        const symbol = `${deposit.coin}USDT`;
        
        const trade = new Trade();
        trade.portfolioId = portfolioId;
        trade.symbol = symbol;
        trade.type = 'BUY';
        trade.quantity = parseFloat(deposit.amount);
        trade.price = 0; // Deposits don't have a purchase price
        trade.fee = 0;
        trade.total = 0;
        trade.executedAt = new Date(deposit.insertTime || deposit.time);
        trade.externalId = externalId;
        trade.source = 'binance-deposit';
        trade.notes = `Deposit: ${deposit.coin}`;

        await tradeRepo.save(trade);
        importedTrades.push(trade);
        depositsImported++;
        imported++;
      }

      // Import withdrawals as SELL trades
      let withdrawalsImported = 0;
      for (const withdrawal of withdrawals) {
        const externalId = `binance-withdrawal-${withdrawal.id}`;
        
        if (existingExternalIds.has(externalId)) {
          skipped++;
          continue;
        }

        // Create synthetic symbol
        const symbol = `${withdrawal.coin}USDT`;
        
        const trade = new Trade();
        trade.portfolioId = portfolioId;
        trade.symbol = symbol;
        trade.type = 'SELL';
        trade.quantity = parseFloat(withdrawal.amount);
        trade.price = 0;
        trade.fee = parseFloat(withdrawal.transactionFee || 0);
        trade.total = 0;
        trade.executedAt = new Date(withdrawal.completeTime || withdrawal.applyTime);
        trade.externalId = externalId;
        trade.source = 'binance-withdrawal';
        trade.notes = `Withdrawal: ${withdrawal.coin}`;

        await tradeRepo.save(trade);
        importedTrades.push(trade);
        withdrawalsImported++;
        imported++;
      }

      console.log(`Import complete:`);
      console.log(`  - Trades: ${imported - depositsImported - withdrawalsImported}`);
      console.log(`  - Deposits: ${depositsImported}`);
      console.log(`  - Withdrawals: ${withdrawalsImported}`);
      console.log(`  - Total imported: ${imported}`);
      console.log(`  - Skipped (duplicates): ${skipped}`);

      // Update portfolio values
      if (imported > 0) {
        console.log(`Updating portfolio ${portfolioId} values...`);
        await this.portfolioUpdateService.updatePortfolio(portfolioId);
      }

      return {
        success: true,
        imported,
        skipped,
        errors: 0,
        trades: importedTrades,
        deposits: depositsImported,
        withdrawals: withdrawalsImported,
        message: `Successfully imported ${imported} items (${imported - depositsImported - withdrawalsImported} trades, ${depositsImported} deposits, ${withdrawalsImported} withdrawals). ${skipped} already existed.`
      };

    } catch (error: any) {
      console.error('Import trades error:', error);
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: 1,
        trades: [],
        message: error.message || 'Failed to import trades'
      };
    }
  }

  /**
   * Import trades from all active API keys for a portfolio
   */
  async importFromAllSources(
    portfolioId: string,
    userId: string,
    startDate?: Date
  ): Promise<ImportResult> {
    const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);

    // Get all active API keys for user
    const apiKeys = await apiKeyRepo.find({
      where: { userId, isActive: true }
    });

    if (apiKeys.length === 0) {
      return {
        success: false,
        imported: 0,
        skipped: 0,
        errors: 1,
        trades: [],
        message: 'No active API keys found. Please add a Binance API key first.'
      };
    }

    // Import from each API key
    let totalImported = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    const allTrades: Trade[] = [];

    for (const apiKey of apiKeys) {
      const result = await this.importTrades(
        portfolioId,
        apiKey.id,
        userId,
        startDate
      );

      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      totalDeposits += result.deposits || 0;
      totalWithdrawals += result.withdrawals || 0;
      allTrades.push(...result.trades);
    }

    return {
      success: totalErrors === 0,
      imported: totalImported,
      skipped: totalSkipped,
      errors: totalErrors,
      trades: allTrades,
      deposits: totalDeposits,
      withdrawals: totalWithdrawals,
      message: `Imported ${totalImported} items from ${apiKeys.length} API key(s) (${totalImported - totalDeposits - totalWithdrawals} trades, ${totalDeposits} deposits, ${totalWithdrawals} withdrawals)`
    };
  }

  /**
   * Get import status/history for a portfolio
   */
  async getImportStatus(portfolioId: string): Promise<{
    totalTrades: number;
    binanceTrades: number;
    deposits: number;
    withdrawals: number;
    manualTrades: number;
    lastImportDate: Date | null;
    oldestTrade: Date | null;
    newestTrade: Date | null;
  }> {
    const tradeRepo = AppDataSource.getRepository(Trade);

    const trades = await tradeRepo.find({
      where: { portfolioId },
      order: { executedAt: 'DESC' }
    });

    const binanceTrades = trades.filter(t => t.source === 'binance');
    const deposits = trades.filter(t => t.source === 'binance-deposit');
    const withdrawals = trades.filter(t => t.source === 'binance-withdrawal');
    const manualTrades = trades.filter(t => !t.source || t.source === 'manual');

    return {
      totalTrades: trades.length,
      binanceTrades: binanceTrades.length,
      deposits: deposits.length,
      withdrawals: withdrawals.length,
      manualTrades: manualTrades.length,
      lastImportDate: binanceTrades.length > 0 ? binanceTrades[0].createdAt : null,
      oldestTrade: trades.length > 0 ? trades[trades.length - 1].executedAt : null,
      newestTrade: trades.length > 0 ? trades[0].executedAt : null
    };
  }
}
