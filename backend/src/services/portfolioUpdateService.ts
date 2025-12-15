import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { Transfer } from '../entities/Transfer';
import { PriceService } from './priceService';
import { TradeTimelineService } from './tradeTimelineService';

interface HoldingPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
  realizedProfitLoss: number;
}

export class PortfolioUpdateService {
  private priceService: PriceService;
  private timelineService: TradeTimelineService;

  constructor() {
    this.priceService = PriceService.getInstance();
    this.timelineService = new TradeTimelineService();
  }

  /**
   * Format symbol with slash separator
   * Examples: BTCUSDT -> BTC/USDT, SAGAUSDC -> SAGA/USDC
   */
  private formatSymbolWithSlash(symbol: string): string {
    const upper = symbol.toUpperCase();
    const quoteAssets = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'EUR', 'BTC', 'ETH', 'BNB'];
    
    for (const quote of quoteAssets) {
      if (upper.endsWith(quote)) {
        const base = upper.slice(0, -quote.length);
        return `${base}/${quote}`;
      }
    }
    
    return upper;
  }

  /**
   * Calculate current holdings from trades and transfers using timeline service
   */
  private async calculateHoldings(
    trades: Trade[],
    transfers: Transfer[],
    currentPrices: Record<string, number>
  ): Promise<Map<string, HoldingPosition>> {
    const holdings = new Map<string, HoldingPosition>();

    // Group trades and transfers by symbol
    const assetMap = new Map<string, { trades: Trade[]; transfers: Transfer[] }>();

    for (const trade of trades) {
      const symbol = trade.symbol.toUpperCase();
      if (!assetMap.has(symbol)) {
        assetMap.set(symbol, { trades: [], transfers: [] });
      }
      assetMap.get(symbol)!.trades.push(trade);
    }

    for (const transfer of transfers) {
      // Extract base asset from transfer (e.g., "SOL" from transfer)
      const asset = transfer.asset.toUpperCase();
      
      // Find matching symbol (e.g., SOLUSDT, SOLUSDC)
      let matchingSymbol: string | null = null;
      for (const [symbol] of assetMap) {
        if (symbol.startsWith(asset)) {
          matchingSymbol = symbol;
          break;
        }
      }

      // If no matching trade symbol, create one (assume USDT pair)
      if (!matchingSymbol) {
        matchingSymbol = `${asset}USDT`;
        assetMap.set(matchingSymbol, { trades: [], transfers: [] });
      }

      assetMap.get(matchingSymbol)!.transfers.push(transfer);
    }

    // Process each asset's timeline
    for (const [symbol, { trades: assetTrades, transfers: assetTransfers }] of assetMap) {
      const events = this.timelineService.buildAssetEvents(assetTrades, assetTransfers);
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = currentPrices[normalizedSymbol];

      const state = this.timelineService.processAssetTimeline(events, currentPrice);

      // Only include if position is open (quantity > 0)
      if (state.totalQuantity > 0.00000001) {
        holdings.set(symbol, {
          symbol,
          quantity: state.totalQuantity,
          averagePrice: state.totalCost / state.totalQuantity,
          totalInvested: state.totalCost,
          realizedProfitLoss: state.realizedProfitLoss,
        });
      }
    }

    return holdings;
  }

  /**
   * Calculate total fees from all trades
   */
  async getTotalFees(portfolioId: string): Promise<number> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const totalFees = portfolio.trades.reduce((sum, trade) => sum + (trade.fee || 0), 0);
    return totalFees;
  }

  /**
   * Update a single portfolio with current prices and closed positions
   */
  async updatePortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const transferRepo = AppDataSource.getRepository(Transfer);

    // Fetch portfolio with trades and transfers
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Fetch transfers for this portfolio
    const transfers = await transferRepo.find({
      where: { portfolioId },
      order: { executedAt: 'ASC' },
    });

    // Get unique symbols from trades and transfers
    const tradeSymbols = [...new Set(portfolio.trades.map(t => t.symbol.toUpperCase()))];
    const transferAssets = [...new Set(transfers.map(t => t.asset.toUpperCase()))];
    
    // Combine and normalize to USDT pairs for price fetching
    const allSymbols = [...tradeSymbols];
    for (const asset of transferAssets) {
      const symbol = `${asset}USDT`;
      if (!allSymbols.includes(symbol)) {
        allSymbols.push(symbol);
      }
    }

    // Get current prices
    const prices = await this.priceService.getPrices(allSymbols);

    // Calculate holdings using timeline service
    const holdings = await this.calculateHoldings(portfolio.trades, transfers, prices);

    if (holdings.size === 0) {
      // No active positions
      portfolio.totalInvested = 0;
      portfolio.currentValue = 0;
      portfolio.profitLoss = 0;
      await portfolioRepo.save(portfolio);
      return portfolio;
    }

    // Calculate totals: unrealized P/L + realized P/L
    let totalInvested = 0;
    let currentValue = 0;
    let totalRealizedPL = 0;

    for (const [symbol, holding] of holdings) {
      totalInvested += holding.totalInvested;
      totalRealizedPL += holding.realizedProfitLoss;
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol];
      
      if (currentPrice) {
        currentValue += holding.quantity * currentPrice;
      } else {
        console.warn(`No price found for ${symbol}, using average price`);
        currentValue += holding.quantity * holding.averagePrice;
      }
    }

    const unrealizedPL = currentValue - totalInvested;
    const profitLoss = unrealizedPL + totalRealizedPL;

    // Update portfolio with realized + unrealized P/L
    portfolio.totalInvested = totalInvested;
    portfolio.currentValue = currentValue;
    portfolio.profitLoss = profitLoss;

    await portfolioRepo.save(portfolio);

    console.log(`Updated portfolio ${portfolio.name}:`);
    console.log(`  Invested: ${totalInvested.toFixed(2)}`);
    console.log(`  Current: ${currentValue.toFixed(2)}`);
    console.log(`  Unrealized P/L: ${unrealizedPL.toFixed(2)}`);
    console.log(`  Realized P/L: ${totalRealizedPL.toFixed(2)}`);
    console.log(`  Total P/L: ${profitLoss.toFixed(2)}`);

    // Detect and save closed positions for each asset
    const assetMap = new Map<string, { trades: Trade[]; transfers: Transfer[] }>();

    for (const trade of portfolio.trades) {
      const symbol = trade.symbol.toUpperCase();
      if (!assetMap.has(symbol)) {
        assetMap.set(symbol, { trades: [], transfers: [] });
      }
      assetMap.get(symbol)!.trades.push(trade);
    }

    for (const transfer of transfers) {
      const asset = transfer.asset.toUpperCase();
      let matchingSymbol: string | null = null;
      for (const [symbol] of assetMap) {
        if (symbol.startsWith(asset)) {
          matchingSymbol = symbol;
          break;
        }
      }
      if (!matchingSymbol) {
        matchingSymbol = `${asset}USDT`;
        assetMap.set(matchingSymbol, { trades: [], transfers: [] });
      }
      assetMap.get(matchingSymbol)!.transfers.push(transfer);
    }

    for (const [symbol, { trades: assetTrades, transfers: assetTransfers }] of assetMap) {
      const events = this.timelineService.buildAssetEvents(assetTrades, assetTransfers);
      const closedPositions = await this.timelineService.detectClosedPositions(
        portfolioId,
        symbol,
        events
      );

      if (closedPositions.length > 0) {
        await this.timelineService.saveClosedPositions(portfolioId, symbol, closedPositions);
      }
    }

    return portfolio;
  }

  /**
   * Update all portfolios for a specific user
   */
  async updateUserPortfolios(userId: string): Promise<Portfolio[]> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    
    const portfolios = await portfolioRepo.find({
      where: { userId },
      relations: ['trades']
    });

    const updatedPortfolios: Portfolio[] = [];

    for (const portfolio of portfolios) {
      try {
        const updated = await this.updatePortfolio(portfolio.id);
        updatedPortfolios.push(updated);
      } catch (error) {
        console.error(`Failed to update portfolio ${portfolio.id}:`, error);
      }
    }

    return updatedPortfolios;
  }

  /**
   * Update all portfolios in the system (admin/cron)
   */
  async updateAllPortfolios(): Promise<number> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const portfolios = await portfolioRepo.find();

    let updated = 0;

    for (const portfolio of portfolios) {
      try {
        await this.updatePortfolio(portfolio.id);
        updated++;
      } catch (error) {
        console.error(`Failed to update portfolio ${portfolio.id}:`, error);
      }
    }

    console.log(`Updated ${updated}/${portfolios.length} portfolios`);
    return updated;
  }

  /**
   * Get detailed holdings for a portfolio
   */
  async getPortfolioHoldings(portfolioId: string): Promise<Array<{
    symbol: string;
    quantity: number;
    averagePrice: number;
    currentPrice: number;
    totalInvested: number;
    currentValue: number;
    profitLoss: number;
    profitLossPercentage: number;
  }>> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const transferRepo = AppDataSource.getRepository(Transfer);
    
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const transfers = await transferRepo.find({
      where: { portfolioId },
      order: { executedAt: 'ASC' },
    });

    // Get unique symbols
    const tradeSymbols = [...new Set(portfolio.trades.map(t => t.symbol.toUpperCase()))];
    const transferAssets = [...new Set(transfers.map(t => t.asset.toUpperCase()))];
    const allSymbols = [...tradeSymbols];
    for (const asset of transferAssets) {
      const symbol = `${asset}USDT`;
      if (!allSymbols.includes(symbol)) {
        allSymbols.push(symbol);
      }
    }
    
    if (allSymbols.length === 0) {
      return [];
    }

    const prices = await this.priceService.getPrices(allSymbols);
    const holdings = await this.calculateHoldings(portfolio.trades, transfers, prices);

    const result = [];

    for (const [symbol, holding] of holdings) {
      // Skip dust holdings
      if (holding.quantity < 0.00000001) {
        continue;
      }

      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol];
      const priceToUse = currentPrice || holding.averagePrice;
      const currentValue = holding.quantity * priceToUse;
      const profitLoss = currentValue - holding.totalInvested;
      const profitLossPercentage = (profitLoss / holding.totalInvested) * 100;

      result.push({
        symbol: this.formatSymbolWithSlash(symbol),
        quantity: holding.quantity,
        averagePrice: holding.averagePrice,
        currentPrice: priceToUse,
        totalInvested: holding.totalInvested,
        currentValue,
        profitLoss,
        profitLossPercentage
      });
    }

    return result.sort((a, b) => b.currentValue - a.currentValue);
  }

  /**
   * Normalize symbol to USDT pair (matching priceService logic)
   */
  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    const quoteAssets = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'EUR', 'BTC', 'ETH', 'BNB'];
    
    let baseAsset = upper;
    for (const quote of quoteAssets) {
      if (upper.endsWith(quote)) {
        baseAsset = upper.slice(0, -quote.length);
        break;
      }
    }
    
    return `${baseAsset}USDT`;
  }
}
