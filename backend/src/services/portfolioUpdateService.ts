import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { ClosedPosition } from '../entities/ClosedPosition';
import { PriceService } from './priceService';

interface HoldingPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
}

interface TradeMetrics {
  totalBought: number;
  totalSold: number;
  totalInvested: number;
  totalReceived: number;
  firstBuyDate: Date;
  lastSellDate: Date;
  numberOfTrades: number;
}

export class PortfolioUpdateService {
  private priceService: PriceService;

  constructor() {
    this.priceService = PriceService.getInstance();
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
   * Calculate metrics for a symbol (to detect closed positions)
   */
  private calculateTradeMetrics(trades: Trade[], symbol: string): TradeMetrics {
    const symbolTrades = trades.filter(t => t.symbol.toUpperCase() === symbol);
    
    let totalBought = 0;
    let totalSold = 0;
    let totalInvested = 0;
    let totalReceived = 0;
    let firstBuyDate: Date | null = null;
    let lastSellDate: Date | null = null;

    for (const trade of symbolTrades) {
      if (trade.type === 'BUY') {
        totalBought += trade.quantity;
        totalInvested += trade.total + (trade.fee || 0);
        if (!firstBuyDate || new Date(trade.executedAt) < firstBuyDate) {
          firstBuyDate = new Date(trade.executedAt);
        }
      } else if (trade.type === 'SELL') {
        totalSold += trade.quantity;
        totalReceived += trade.total - (trade.fee || 0);
        if (!lastSellDate || new Date(trade.executedAt) > lastSellDate) {
          lastSellDate = new Date(trade.executedAt);
        }
      }
    }

    return {
      totalBought,
      totalSold,
      totalInvested,
      totalReceived,
      firstBuyDate: firstBuyDate || new Date(),
      lastSellDate: lastSellDate || new Date(),
      numberOfTrades: symbolTrades.length
    };
  }

  /**
   * Create closed position record when position is fully sold
   */
  private async createClosedPosition(
    portfolioId: string,
    symbol: string,
    metrics: TradeMetrics
  ): Promise<void> {
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);

    // Check if already exists
    const existing = await closedPositionRepo.findOne({
      where: { portfolioId, symbol: symbol.toUpperCase() }
    });

    if (existing) {
      // Update existing
      existing.totalBought = metrics.totalBought;
      existing.totalSold = metrics.totalSold;
      existing.totalInvested = metrics.totalInvested;
      existing.totalReceived = metrics.totalReceived;
      existing.realizedProfitLoss = metrics.totalReceived - metrics.totalInvested;
      existing.realizedProfitLossPercentage = (existing.realizedProfitLoss / metrics.totalInvested) * 100;
      existing.averageBuyPrice = metrics.totalInvested / metrics.totalBought;
      existing.averageSellPrice = metrics.totalReceived / metrics.totalSold;
      existing.closedAt = metrics.lastSellDate;
      existing.numberOfTrades = metrics.numberOfTrades;
      await closedPositionRepo.save(existing);
      return;
    }

    // Create new
    const closedPosition = new ClosedPosition();
    closedPosition.portfolioId = portfolioId;
    closedPosition.symbol = symbol.toUpperCase();
    closedPosition.totalBought = metrics.totalBought;
    closedPosition.totalSold = metrics.totalSold;
    closedPosition.averageBuyPrice = metrics.totalInvested / metrics.totalBought;
    closedPosition.averageSellPrice = metrics.totalReceived / metrics.totalSold;
    closedPosition.totalInvested = metrics.totalInvested;
    closedPosition.totalReceived = metrics.totalReceived;
    closedPosition.realizedProfitLoss = metrics.totalReceived - metrics.totalInvested;
    closedPosition.realizedProfitLossPercentage = (closedPosition.realizedProfitLoss / metrics.totalInvested) * 100;
    closedPosition.openedAt = metrics.firstBuyDate;
    closedPosition.closedAt = metrics.lastSellDate;
    closedPosition.numberOfTrades = metrics.numberOfTrades;

    await closedPositionRepo.save(closedPosition);
    console.log(`Created closed position for ${symbol}: P/L=${closedPosition.realizedProfitLoss.toFixed(2)}`);
  }

  /**
   * Calculate current holdings from trades
   */
  private async calculateHoldings(portfolioId: string, trades: Trade[]): Promise<Map<string, HoldingPosition>> {
    const holdings = new Map<string, HoldingPosition>();

    // Sort trades by execution date
    const sortedTrades = [...trades].sort(
      (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime()
    );

    for (const trade of sortedTrades) {
      const symbol = trade.symbol.toUpperCase();
      const existing = holdings.get(symbol) || {
        symbol,
        quantity: 0,
        averagePrice: 0,
        totalInvested: 0
      };

      if (trade.type === 'BUY') {
        // Add to position
        const newQuantity = existing.quantity + trade.quantity;
        const newTotalInvested = existing.totalInvested + trade.total;
        const newAveragePrice = newQuantity > 0 ? newTotalInvested / newQuantity : 0;

        holdings.set(symbol, {
          symbol,
          quantity: newQuantity,
          averagePrice: newAveragePrice,
          totalInvested: newTotalInvested
        });
      } else if (trade.type === 'SELL') {
        // Reduce position
        const newQuantity = existing.quantity - trade.quantity;
        
        // Consider position closed if quantity is very small (< 0.00000001)
        if (newQuantity <= 0.00000001) {
          // Calculate full metrics and create closed position
          const metrics = this.calculateTradeMetrics(trades, symbol);
          await this.createClosedPosition(portfolioId, symbol, metrics);
          holdings.delete(symbol);
        } else {
          // Reduce proportionally
          const soldProportion = trade.quantity / existing.quantity;
          const newTotalInvested = existing.totalInvested * (1 - soldProportion);

          holdings.set(symbol, {
            symbol,
            quantity: newQuantity,
            averagePrice: existing.averagePrice,
            totalInvested: newTotalInvested
          });
        }
      }
    }

    return holdings;
  }

  /**
   * Get total realized P/L from closed positions
   */
  async getTotalRealizedPL(portfolioId: string): Promise<number> {
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);
    
    const closedPositions = await closedPositionRepo.find({
      where: { portfolioId }
    });

    return closedPositions.reduce((sum, pos) => sum + pos.realizedProfitLoss, 0);
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
   * Update a single portfolio with current prices
   */
  async updatePortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);

    // Fetch portfolio with trades
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Calculate holdings (this will create closed positions if needed)
    const holdings = await this.calculateHoldings(portfolioId, portfolio.trades);

    // Get realized P/L from closed positions
    const realizedPL = await this.getTotalRealizedPL(portfolioId);

    if (holdings.size === 0) {
      // No active positions, but may have realized P/L
      portfolio.totalInvested = 0;
      portfolio.currentValue = 0;
      portfolio.profitLoss = realizedPL; // Only realized P/L
      await portfolioRepo.save(portfolio);
      return portfolio;
    }

    // Get current prices for all symbols
    const symbols = Array.from(holdings.keys());
    const prices = await this.priceService.getPrices(symbols);

    console.log('Fetched prices for symbols:', symbols);
    console.log('Prices received:', prices);

    // Calculate totals for open positions
    let totalInvested = 0;
    let currentValue = 0;

    for (const [symbol, holding] of holdings) {
      totalInvested += holding.totalInvested;
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol];
      
      console.log(`${symbol} -> normalized: ${normalizedSymbol}, price: ${currentPrice}`);
      
      if (currentPrice) {
        currentValue += holding.quantity * currentPrice;
      } else {
        console.warn(`No price found for ${symbol} (normalized: ${normalizedSymbol}), using average price`);
        currentValue += holding.quantity * holding.averagePrice;
      }
    }

    // Unrealized P/L (open positions) + Realized P/L (closed positions)
    const unrealizedPL = currentValue - totalInvested;
    const totalPL = unrealizedPL + realizedPL;

    // Update portfolio
    portfolio.totalInvested = totalInvested;
    portfolio.currentValue = currentValue;
    portfolio.profitLoss = totalPL; // Total P/L includes both unrealized and realized

    await portfolioRepo.save(portfolio);

    console.log(`Updated portfolio ${portfolio.name}:`);
    console.log(`  - Open invested: $${totalInvested.toFixed(2)}`);
    console.log(`  - Current value: $${currentValue.toFixed(2)}`);
    console.log(`  - Unrealized P/L: $${unrealizedPL.toFixed(2)}`);
    console.log(`  - Realized P/L: $${realizedPL.toFixed(2)}`);
    console.log(`  - Total P/L: $${totalPL.toFixed(2)}`);

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
    
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    const holdings = await this.calculateHoldings(portfolioId, portfolio.trades);
    const symbols = Array.from(holdings.keys());
    
    if (symbols.length === 0) {
      return [];
    }

    const prices = await this.priceService.getPrices(symbols);

    console.log('Holdings - symbols:', symbols);
    console.log('Holdings - prices:', prices);

    const result = [];

    for (const [symbol, holding] of holdings) {
      // Skip holdings with very small quantities (dust)
      if (holding.quantity < 0.00000001) {
        continue;
      }

      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol];
      
      console.log(`Holdings: ${symbol} -> ${normalizedSymbol}, price: ${currentPrice || 'NOT FOUND'}`);
      
      // Use current price from API, fallback to average price only if not found
      const priceToUse = currentPrice || holding.averagePrice;
      const currentValue = holding.quantity * priceToUse;
      const profitLoss = currentValue - holding.totalInvested;
      const profitLossPercentage = (profitLoss / holding.totalInvested) * 100;

      result.push({
        symbol: this.formatSymbolWithSlash(symbol), // Format with slash
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
   * Get closed positions for a portfolio
   */
  async getClosedPositions(portfolioId: string): Promise<ClosedPosition[]> {
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);
    
    const closedPositions = await closedPositionRepo.find({
      where: { portfolioId },
      order: { closedAt: 'DESC' }
    });

    return closedPositions;
  }

  /**
   * Normalize symbol to USDT pair (matching priceService logic)
   * Examples:
   * - SAGAUSDC -> SAGAUSDT
   * - BTCBUSD -> BTCUSDT
   * - BTC -> BTCUSDT
   */
  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    
    // Extract base asset by removing common quote assets
    const quoteAssets = ['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'EUR', 'BTC', 'ETH', 'BNB'];
    
    let baseAsset = upper;
    for (const quote of quoteAssets) {
      if (upper.endsWith(quote)) {
        baseAsset = upper.slice(0, -quote.length);
        break;
      }
    }
    
    // Always return USDT pair for consistency
    return `${baseAsset}USDT`;
  }
}
