import { AppDataSource } from '../index';
import { Trade } from '../entities/Trade';
import { Transfer } from '../entities/Transfer';
import { Portfolio } from '../entities/Portfolio';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';
import { BinanceService } from './binanceService';
import { RevolutXService } from './revolutXService';
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
  depositsImported?: number;
  withdrawalsImported?: number;
  message: string;
}

export class TradeImportService {
  private portfolioUpdateService: PortfolioUpdateService;

  constructor() {
    this.portfolioUpdateService = new PortfolioUpdateService();
  }

  /**
   * Import trades from Binance for a specific portfolio
   * Uses getAllMyTrades() to fetch everything
   * Deposits and withdrawals are saved to transfers table (not trades)
   */
  private async importBinanceTrades(
    portfolioId: string,
    binance: BinanceService,
    startDate?: Date
  ): Promise<Omit<ImportResult, 'success' | 'message'>> {
    const tradeRepo = AppDataSource.getRepository(Trade);
    const transferRepo = AppDataSource.getRepository(Transfer);

    const startTime = startDate ? startDate.getTime() : undefined;

    console.log('=== IMPORTING FROM BINANCE ===');
    if (startDate) {
      console.log(`Import start date: ${startDate.toISOString()}`);
    }

    // Fetch ALL trades using the comprehensive method
    console.log('Fetching ALL trades from Binance...');
    const allBinanceTrades = await binance.getAllMyTrades(startTime);
    console.log(`Total trades fetched from Binance: ${allBinanceTrades.length}`);

    // Fetch deposits and withdrawals
    console.log('Fetching deposit history...');
    const deposits = await binance.getDepositHistory(startTime);
    console.log(`Total deposits: ${deposits.length}`);

    console.log('Fetching withdrawal history...');
    const withdrawals = await binance.getWithdrawHistory(startTime);
    console.log(`Total withdrawals: ${withdrawals.length}`);

    // Remove duplicates by trade ID
    const uniqueTrades = Array.from(
      new Map(allBinanceTrades.map(t => [t.id, t])).values()
    );

    console.log(`Unique trades after deduplication: ${uniqueTrades.length}`);

    // Filter by start date if provided
    let filteredTrades = uniqueTrades;
    if (startDate) {
      filteredTrades = uniqueTrades.filter(
        t => new Date(t.time) >= startDate
      );
      console.log(`Trades after date filter: ${filteredTrades.length}`);
    }

    // Sort by date (oldest first)
    filteredTrades.sort((a, b) => a.time - b.time);

    // Get existing external IDs
    const existingTrades = await tradeRepo.find({
      where: { portfolioId },
      select: ['externalId']
    });
    
    const existingTradeIds = new Set(
      existingTrades
        .filter(t => t.externalId)
        .map(t => t.externalId)
    );

    const existingTransfers = await transferRepo.find({
      where: { portfolioId },
      select: ['externalId']
    });

    const existingTransferIds = new Set(
      existingTransfers
        .filter(t => t.externalId)
        .map(t => t.externalId)
    );

    console.log(`Existing trades in database: ${existingTradeIds.size}`);
    console.log(`Existing transfers in database: ${existingTransferIds.size}`);

    // Import trades
    let imported = 0;
    let skipped = 0;
    const importedTrades: Trade[] = [];

    for (const binanceTrade of filteredTrades) {
      const externalId = `binance-${binanceTrade.id}`;

      if (existingTradeIds.has(externalId)) {
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

    // Import deposits
    let depositsImported = 0;
    for (const deposit of deposits) {
      const externalId = `binance-deposit-${deposit.txId || deposit.id}`;
      
      if (existingTransferIds.has(externalId)) {
        skipped++;
        continue;
      }

      const transfer = new Transfer();
      transfer.portfolioId = portfolioId;
      transfer.type = 'DEPOSIT';
      transfer.asset = deposit.coin;
      transfer.amount = parseFloat(deposit.amount);
      transfer.fee = 0;
      transfer.executedAt = new Date(deposit.insertTime || deposit.time);
      transfer.txId = deposit.txId;
      transfer.network = deposit.network;
      transfer.source = 'binance';
      transfer.externalId = externalId;
      transfer.notes = `Binance deposit: ${deposit.coin}`;

      await transferRepo.save(transfer);
      depositsImported++;
    }

    // Import withdrawals
    let withdrawalsImported = 0;
    for (const withdrawal of withdrawals) {
      const externalId = `binance-withdrawal-${withdrawal.id}`;
      
      if (existingTransferIds.has(externalId)) {
        skipped++;
        continue;
      }

      const transfer = new Transfer();
      transfer.portfolioId = portfolioId;
      transfer.type = 'WITHDRAWAL';
      transfer.asset = withdrawal.coin;
      transfer.amount = parseFloat(withdrawal.amount);
      transfer.fee = parseFloat(withdrawal.transactionFee || 0);
      transfer.executedAt = new Date(withdrawal.completeTime || withdrawal.applyTime);
      transfer.txId = withdrawal.txId;
      transfer.network = withdrawal.network;
      transfer.source = 'binance';
      transfer.externalId = externalId;
      transfer.notes = `Binance withdrawal: ${withdrawal.coin}`;

      await transferRepo.save(transfer);
      withdrawalsImported++;
    }

    console.log(`Binance import complete: ${imported} trades, ${depositsImported} deposits, ${withdrawalsImported} withdrawals`);

    return {
      imported,
      skipped,
      errors: 0,
      trades: importedTrades,
      depositsImported,
      withdrawalsImported
    };
  }

  /**
   * Import trades from Revolut X for a specific portfolio
   */
  private async importRevolutXTrades(
    portfolioId: string,
    revolutX: RevolutXService,
    startDate?: Date
  ): Promise<Omit<ImportResult, 'success' | 'message'>> {
    const tradeRepo = AppDataSource.getRepository(Trade);

    const fromTimestamp = startDate ? startDate.getTime() : undefined;

    console.log('=== IMPORTING FROM REVOLUT X ===');
    if (startDate) {
      console.log(`Import start date: ${startDate.toISOString()}`);
    }

    // Fetch trades from Revolut X
    console.log('Fetching trades from Revolut X...');
    const revolutXTrades = await revolutX.getTradeHistory(1000, fromTimestamp);
    console.log(`Total trades fetched from Revolut X: ${revolutXTrades.length}`);

    // Get existing external IDs
    const existingTrades = await tradeRepo.find({
      where: { portfolioId },
      select: ['externalId']
    });
    
    const existingTradeIds = new Set(
      existingTrades
        .filter(t => t.externalId)
        .map(t => t.externalId)
    );

    console.log(`Existing trades in database: ${existingTradeIds.size}`);

    // Import trades
    let imported = 0;
    let skipped = 0;
    const importedTrades: Trade[] = [];

    for (const revolutXTrade of revolutXTrades) {
      const converted = revolutX.convertToInternalFormat(revolutXTrade);
      const externalId = `revolutx-${converted.externalId}`;

      if (existingTradeIds.has(externalId)) {
        skipped++;
        continue;
      }

      const trade = new Trade();
      trade.portfolioId = portfolioId;
      trade.symbol = converted.symbol;
      trade.type = converted.side.toUpperCase(); // 'BUY' or 'SELL'
      trade.quantity = converted.quantity;
      trade.price = converted.price;
      trade.fee = converted.fee;
      trade.total = converted.quantity * converted.price;
      trade.executedAt = converted.timestamp;
      trade.externalId = externalId;
      trade.source = 'revolutx';

      await tradeRepo.save(trade);
      importedTrades.push(trade);
      imported++;
    }

    console.log(`Revolut X import complete: ${imported} trades`);

    return {
      imported,
      skipped,
      errors: 0,
      trades: importedTrades,
      depositsImported: 0,
      withdrawalsImported: 0
    };
  }

  /**
   * Import trades from any exchange for a specific portfolio
   */
  async importTrades(
    portfolioId: string,
    apiKeyId: string,
    userId: string,
    startDate?: Date
  ): Promise<ImportResult> {
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

      let result: Omit<ImportResult, 'success' | 'message'>;

      // Import based on exchange type
      if (apiKey.exchange === 'binance') {
        const binance = await BinanceService.createFromApiKey(apiKey);
        result = await this.importBinanceTrades(portfolioId, binance, startDate);
      } else if (apiKey.exchange === 'revolutx') {
        const revolutX = await RevolutXService.createFromApiKey(apiKey);
        result = await this.importRevolutXTrades(portfolioId, revolutX, startDate);
      } else {
        return {
          success: false,
          imported: 0,
          skipped: 0,
          errors: 1,
          trades: [],
          message: `Unsupported exchange: ${apiKey.exchange}`
        };
      }

      // Update portfolio values if trades were imported
      if (result.imported > 0) {
        console.log(`Updating portfolio ${portfolioId} values...`);
        await this.portfolioUpdateService.updatePortfolio(portfolioId);
      }

      const message = apiKey.exchange === 'binance'
        ? `Successfully imported ${result.imported} trades, ${result.depositsImported} deposits, ${result.withdrawalsImported} withdrawals. ${result.skipped} already existed.`
        : `Successfully imported ${result.imported} trades from Revolut X. ${result.skipped} already existed.`;

      return {
        ...result,
        success: true,
        message
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
        message: 'No active API keys found. Please add an exchange API key first.'
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
      totalDeposits += result.depositsImported || 0;
      totalWithdrawals += result.withdrawalsImported || 0;
      allTrades.push(...result.trades);
    }

    return {
      success: totalErrors === 0,
      imported: totalImported,
      skipped: totalSkipped,
      errors: totalErrors,
      trades: allTrades,
      depositsImported: totalDeposits,
      withdrawalsImported: totalWithdrawals,
      message: `Imported ${totalImported} trades, ${totalDeposits} deposits, ${totalWithdrawals} withdrawals from ${apiKeys.length} API key(s)`
    };
  }

  /**
   * Get import status/history for a portfolio
   */
  async getImportStatus(portfolioId: string): Promise<{
    totalTrades: number;
    binanceTrades: number;
    revolutxTrades: number;
    manualTrades: number;
    totalTransfers: number;
    deposits: number;
    withdrawals: number;
    lastImportDate: Date | null;
    oldestTrade: Date | null;
    newestTrade: Date | null;
  }> {
    const tradeRepo = AppDataSource.getRepository(Trade);
    const transferRepo = AppDataSource.getRepository(Transfer);

    const trades = await tradeRepo.find({
      where: { portfolioId },
      order: { executedAt: 'DESC' }
    });

    const transfers = await transferRepo.find({
      where: { portfolioId },
      order: { executedAt: 'DESC' }
    });

    const binanceTrades = trades.filter(t => t.source === 'binance');
    const revolutxTrades = trades.filter(t => t.source === 'revolutx');
    const manualTrades = trades.filter(t => !t.source || t.source === 'manual');
    const deposits = transfers.filter(t => t.type === 'DEPOSIT');
    const withdrawals = transfers.filter(t => t.type === 'WITHDRAWAL');

    const exchangeTrades = [...binanceTrades, ...revolutxTrades];

    return {
      totalTrades: trades.length,
      binanceTrades: binanceTrades.length,
      revolutxTrades: revolutxTrades.length,
      manualTrades: manualTrades.length,
      totalTransfers: transfers.length,
      deposits: deposits.length,
      withdrawals: withdrawals.length,
      lastImportDate: exchangeTrades.length > 0 ? exchangeTrades[0].createdAt : null,
      oldestTrade: trades.length > 0 ? trades[trades.length - 1].executedAt : null,
      newestTrade: trades.length > 0 ? trades[0].executedAt : null
    };
  }
}
