import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { PriceService } from './priceService';

interface HoldingPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  totalInvested: number;
}

export class PortfolioUpdateService {
  private priceService: PriceService;

  constructor() {
    this.priceService = PriceService.getInstance();
  }

  /**
   * Calculate current holdings from trades
   */
  private calculateHoldings(trades: Trade[]): Map<string, HoldingPosition> {
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
        
        if (newQuantity <= 0) {
          // Position closed
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
   * Update a single portfolio with current prices
   */
  async updatePortfolio(portfolioId: string): Promise<Portfolio> {
    const portfolioRepo = AppDataSource.getRepository(Portfolio);
    const tradeRepo = AppDataSource.getRepository(Trade);

    // Fetch portfolio with trades
    const portfolio = await portfolioRepo.findOne({
      where: { id: portfolioId },
      relations: ['trades']
    });

    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} not found`);
    }

    // Calculate holdings
    const holdings = this.calculateHoldings(portfolio.trades);

    if (holdings.size === 0) {
      // No active positions
      portfolio.totalInvested = 0;
      portfolio.currentValue = 0;
      portfolio.profitLoss = 0;
      await portfolioRepo.save(portfolio);
      return portfolio;
    }

    // Get current prices for all symbols
    const symbols = Array.from(holdings.keys());
    const prices = await this.priceService.getPrices(symbols);

    // Calculate totals
    let totalInvested = 0;
    let currentValue = 0;

    for (const [symbol, holding] of holdings) {
      totalInvested += holding.totalInvested;
      
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol];
      
      if (currentPrice) {
        currentValue += holding.quantity * currentPrice;
      } else {
        console.warn(`No price found for ${symbol}, using average price`);
        currentValue += holding.quantity * holding.averagePrice;
      }
    }

    const profitLoss = currentValue - totalInvested;

    // Update portfolio
    portfolio.totalInvested = totalInvested;
    portfolio.currentValue = currentValue;
    portfolio.profitLoss = profitLoss;

    await portfolioRepo.save(portfolio);

    console.log(`Updated portfolio ${portfolio.name}: invested=${totalInvested.toFixed(2)}, current=${currentValue.toFixed(2)}, P/L=${profitLoss.toFixed(2)}`);

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

    const holdings = this.calculateHoldings(portfolio.trades);
    const symbols = Array.from(holdings.keys());
    
    if (symbols.length === 0) {
      return [];
    }

    const prices = await this.priceService.getPrices(symbols);

    const result = [];

    for (const [symbol, holding] of holdings) {
      const normalizedSymbol = this.normalizeSymbol(symbol);
      const currentPrice = prices[normalizedSymbol] || holding.averagePrice;
      const currentValue = holding.quantity * currentPrice;
      const profitLoss = currentValue - holding.totalInvested;
      const profitLossPercentage = (profitLoss / holding.totalInvested) * 100;

      result.push({
        symbol,
        quantity: holding.quantity,
        averagePrice: holding.averagePrice,
        currentPrice,
        totalInvested: holding.totalInvested,
        currentValue,
        profitLoss,
        profitLossPercentage
      });
    }

    return result.sort((a, b) => b.currentValue - a.currentValue);
  }

  private normalizeSymbol(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (upper.endsWith('USDT') || upper.endsWith('BUSD') || upper.endsWith('EUR')) {
      return upper;
    }
    return `${upper}USDT`;
  }
}
