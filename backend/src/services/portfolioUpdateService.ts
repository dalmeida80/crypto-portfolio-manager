import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { Transfer } from '../entities/Transfer';
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
      existing.realizedProfitLossPercentage = metrics.totalInvested > 0 
        ? (existing.realizedProfitLoss / metrics.totalInvested) * 100
        : 0;
      existing.averageBuyPrice = metrics.totalBought > 0 ? metrics.totalInvested / metrics.totalBought : 0;
      existing.averageSellPrice = metrics.totalSold > 0 ? metrics.totalReceived / metrics.totalSold : 0;
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
    closedPosition.averageBuyPrice = metrics.totalBought > 0 ? metrics.totalInvested / metrics.totalBought : 0;
    closedPosition.averageSellPrice = metrics.totalSold > 0 ? metrics.totalReceived / metrics.totalSold : 0;
    closedPosition.totalInvested = metrics.totalInvested;
    closedPosition.totalReceived = metrics.totalReceived;
    closedPosition.realizedProfitLoss = metrics.totalReceived - metrics.totalInvested;
    closedPosition.realizedProfitLossPercentage = metrics.totalInvested > 0
      ? (closedPosition.realizedProfitLoss / metrics.totalInvested) * 100
      : 0;
    closedPosition.openedAt = metrics.firstBuyDate;
    closedPosition.closedAt = metrics.lastSellDate;
    closedPosition.numberOfTrades = metrics.numberOfTrades;

    await closedPositionRepo.save(closedPosition);
    console.log(`✅ Created closed position for ${symbol}: P/L=${closedPosition.realizedProfitLoss.toFixed(2)}`);
  }

  /**
   * Calculate current holdings from trades AND transfers (deposits/withdrawals)
   */
  private async calculateHoldings(portfolioId: string, trades: Trade[]): Promise<Map<string, HoldingPosition>> {
    const holdings = new Map<string, HoldingPosition>();

    // Get transfers (deposits/withdrawals)
    const transferRepo = AppDataSource.getRepository(Transfer);
    const transfers = await transferRepo.find({
      where: { portfolioId },
      order: { executedAt: 'ASC' }
    });

    // Combine trades and transfers, sort by date
    const events: Array<{type: string, symbol: string, quantity: number, total: number, date: Date, fee?: number}> = [];

    // Add deposits as initial holdings (cost basis = 0)
    for (const transfer of transfers) {
      if (transfer.type === 'DEPOSIT') {
        events.push({
          type: 'DEPOSIT',
          symbol: transfer.coin + 'USDC', // Assume USDC pairs for now
          quantity: parseFloat(transfer.amount.toString()),
          total: 0, // Deposits have no cost basis
          date: new Date(transfer.executedAt),
          fee: 0
        });
      } else if (transfer.type === 'WITHDRAWAL') {
        events.push({
          type: 'WITHDRAWAL',
          symbol: transfer.coin + 'USDC',
          quantity: parseFloat(transfer.amount.toString()),
          total: 0,
          date: new Date(transfer.executedAt),
          fee: 0
        });
      }
    }

    // Add trades
    for (const trade of trades) {
      events.push({
        type: trade.type,
        symbol: trade.symbol,
        quantity: trade.quantity,
        total: trade.total,
        date: new Date(trade.executedAt),
        fee: trade.fee || 0
      });
    }

    // Sort all events by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());

    console.log(`Processing ${events.length} events (${transfers.length} transfers + ${trades.length} trades)`);

    // Process events chronologically
    for (const event of events) {
      const symbol = event.symbol.toUpperCase();
      const existing = holdings.get(symbol) || {
        symbol,
        quantity: 0,
        averagePrice: 0,
        totalInvested: 0
      };

      if (event.type === 'DEPOSIT') {
        // Deposit: add quantity with zero cost
        const newQuantity = existing.quantity + event.quantity;
        const newTotalInvested = existing.totalInvested; // No cost for deposits
        const newAveragePrice = newQuantity > 0 && newTotalInvested > 0
          ? newTotalInvested / newQuantity
          : 0;

        holdings.set(symbol, {
          symbol,
          quantity: newQuantity,
          averagePrice: newAveragePrice,
          totalInvested: newTotalInvested
        });
        console.log(`  📥 DEPOSIT ${event.quantity} ${symbol} (total: ${newQuantity})`);
      } else if (event.type === 'WITHDRAWAL') {
        // Withdrawal: remove quantity proportionally
        const newQuantity = existing.quantity - event.quantity;
        
        if (newQuantity <= 0.00000001) {
          holdings.delete(symbol);
          console.log(`  📤 WITHDRAWAL ${event.quantity} ${symbol} (position closed)`);
        } else {
          const withdrawnProportion = event.quantity / existing.quantity;
          const newTotalInvested = existing.totalInvested * (1 - withdrawnProportion);

          holdings.set(symbol, {
            symbol,
            quantity: newQuantity,
            averagePrice: existing.averagePrice,
            totalInvested: newTotalInvested
          });
          console.log(`  📤 WITHDRAWAL ${event.quantity} ${symbol} (remaining: ${newQuantity})`);
        }
      } else if (event.type === 'BUY') {
        // Buy: add to position
        const newQuantity = existing.quantity + event.quantity;
        const newTotalInvested = existing.totalInvested + event.total + event.fee;
        const newAveragePrice = newQuantity > 0 ? newTotalInvested / newQuantity : 0;

        holdings.set(symbol, {
          symbol,
          quantity: newQuantity,
          averagePrice: newAveragePrice,
          totalInvested: newTotalInvested
        });
        console.log(`  🟢 BUY ${event.quantity} ${symbol} @ $${(event.total/event.quantity).toFixed(4)} (total: ${newQuantity})`);
      } else if (event.type === 'SELL') {
        // Sell: reduce position
        const newQuantity = existing.quantity - event.quantity;
        
        if (newQuantity <= 0.00000001) {
          // Position fully closed - create closed position record
          const metrics = this.calculateTradeMetrics(trades, symbol);
          await this.createClosedPosition(portfolioId, symbol, metrics);
          holdings.delete(symbol);
          console.log(`  🔴 SELL ${event.quantity} ${symbol} @ $${(event.total/event.quantity).toFixed(4)} (position CLOSED)`);
        } else {
          // Partial sell - reduce proportionally
          const soldProportion = event.quantity / existing.quantity;
          const newTotalInvested = existing.totalInvested * (1 - soldProportion);

          holdings.set(symbol, {
            symbol,
            quantity: newQuantity,
            averagePrice: existing.averagePrice,
            totalInvested: newTotalInvested
          });
          console.log(`  🔴 SELL ${event.quantity} ${symbol} @ $${(event.total/event.quantity).toFixed(4)} (remaining: ${newQuantity})`);
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

    const total = closedPositions.reduce((sum, pos) => {
      // Force conversion to number to prevent string concatenation
      const plValue = typeof pos.realizedProfitLoss === 'string' 
        ? parseFloat(pos.realizedProfitLoss) 
        : pos.realizedProfitLoss;
      return sum + plValue;
    }, 0);

    return total;
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

    // Get realized P/L from closed positions (FORCE NUMBER CONVERSION)
    const realizedPL = await this.getTotalRealizedPL(portfolioId);
    const realizedPLNumber = typeof realizedPL === 'string' ? parseFloat(realizedPL) : realizedPL;

    if (holdings.size === 0) {
      // No active positions, but may have realized P/L
      portfolio.totalInvested = 0;
      portfolio.currentValue = 0;
      portfolio.profitLoss = realizedPLNumber; // Only realized P/L
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
    const totalPL = Number(unrealizedPL) + Number(realizedPLNumber); // FORCE NUMBER ADDITION

    // Update portfolio
    portfolio.totalInvested = totalInvested;
    portfolio.currentValue = currentValue;
    portfolio.profitLoss = totalPL; // Total P/L includes both unrealized and realized

    await portfolioRepo.save(portfolio);

    console.log(`Updated portfolio ${portfolio.name}:`);
    console.log(`  - Open invested: $${totalInvested.toFixed(2)}`);
    console.log(`  - Current value: $${currentValue.toFixed(2)}`);
    console.log(`  - Unrealized P/L: $${unrealizedPL.toFixed(2)}`);
    console.log(`  - Realized P/L: $${realizedPLNumber.toFixed(2)}`);
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
      const profitLossPercentage = holding.totalInvested > 0
        ? (profitLoss / holding.totalInvested) * 100
        : 0;

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
