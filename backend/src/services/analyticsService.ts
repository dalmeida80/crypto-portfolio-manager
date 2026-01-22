import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { PriceService } from './priceService';

interface HoldingAnalytics {
  symbol: string;
  totalQuantity: number;
  averageBuyPrice: number;
  totalInvested: number;
  currentPrice: number;
  currentValue: number;
  profitLoss: number;
  profitLossPercent: number;
}

export class AnalyticsService {
  /**
   * Calculate portfolio metrics with EUR conversion for Binance
   * Returns all values in EUR for consistency
   */
  static async calculatePortfolioMetrics(
    portfolioId: string,
    userId: string
  ): Promise<any> {
    try {
      const portfolioRepo = AppDataSource.getRepository(Portfolio);
      const portfolio = await portfolioRepo.findOne({
        where: { id: portfolioId, userId },
        relations: ['trades'],
      });

      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      const holdings = this.calculateHoldings(portfolio.trades);
      
      // Calculate total fees
      const totalFees = portfolio.trades.reduce((sum, trade) => {
        const fee = typeof trade.fee === 'string' ? parseFloat(trade.fee) : trade.fee;
        return sum + (fee || 0);
      }, 0);
      
      // Get current prices using PriceService (with EUR conversion)
      const priceService = PriceService.getInstance();
      const enrichedHoldings: HoldingAnalytics[] = [];
      let totalInvested = 0;
      let totalCurrentValue = 0;

      // Get all symbols that need prices
      const symbols = Object.keys(holdings);
      
      if (symbols.length > 0) {
        // Fetch all prices at once (in USD)
        const usdPrices = await priceService.getPrices(symbols);
        
        for (const [symbol, data] of Object.entries(holdings)) {
          try {
            // Get USD price
            const usdPrice = usdPrices[symbol];
            if (!usdPrice) {
              console.warn(`[Analytics] No price found for ${symbol}`);
              continue;
            }

            // Convert to EUR
            const eurPrice = await priceService.convertUsdtToEur(usdPrice);
            const currentValue = data.quantity * eurPrice;
            const profitLoss = currentValue - data.totalCost;
            const profitLossPercent = data.totalCost > 0 ? (profitLoss / data.totalCost) * 100 : 0;

            enrichedHoldings.push({
              symbol,
              totalQuantity: data.quantity,
              averageBuyPrice: data.averagePrice,
              totalInvested: data.totalCost,
              currentPrice: eurPrice,
              currentValue,
              profitLoss,
              profitLossPercent,
            });

            totalInvested += data.totalCost;
            totalCurrentValue += currentValue;
          } catch (error) {
            console.error(`[Analytics] Failed to get price for ${symbol}:`, error);
          }
        }
      }

      const totalProfitLoss = totalCurrentValue - totalInvested;
      const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

      // Update portfolio totals
      portfolio.totalInvested = parseFloat(totalInvested.toFixed(8)) as any;
      portfolio.currentValue = parseFloat(totalCurrentValue.toFixed(8)) as any;
      portfolio.profitLoss = parseFloat(totalProfitLoss.toFixed(8)) as any;
      await portfolioRepo.save(portfolio);

      console.log(`[Analytics] Updated portfolio ${portfolioId}:`, {
        totalInvested: totalInvested.toFixed(2),
        currentValue: totalCurrentValue.toFixed(2),
        profitLoss: totalProfitLoss.toFixed(2),
        eurRate: priceService.getEurRate()
      });

      return {
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          totalInvested: parseFloat(totalInvested.toFixed(8)),
          currentValue: parseFloat(totalCurrentValue.toFixed(8)),
          profitLoss: parseFloat(totalProfitLoss.toFixed(8)),
          profitLossPercent: parseFloat(totalProfitLossPercent.toFixed(2)),
          totalFees: parseFloat(totalFees.toFixed(8)),
        },
        holdings: enrichedHoldings,
        totalTrades: portfolio.trades.length,
        totalFees: parseFloat(totalFees.toFixed(8)),
      };
    } catch (error) {
      throw new Error(`Analytics calculation failed: ${error}`);
    }
  }

  private static calculateHoldings(trades: Trade[]): Record<string, any> {
    const holdings: Record<string, any> = {};

    for (const trade of trades) {
      // Convert string decimals to numbers for calculations
      const quantity = typeof trade.quantity === 'string' ? parseFloat(trade.quantity) : trade.quantity;
      const total = typeof trade.total === 'string' ? parseFloat(trade.total) : trade.total;
      const fee = typeof trade.fee === 'string' ? parseFloat(trade.fee) : trade.fee;

      if (!holdings[trade.symbol]) {
        holdings[trade.symbol] = {
          quantity: 0,
          totalCost: 0,
          averagePrice: 0,
        };
      }

      if (trade.type === 'BUY') {
        holdings[trade.symbol].quantity += quantity;
        holdings[trade.symbol].totalCost += total + fee;
      } else if (trade.type === 'SELL') {
        holdings[trade.symbol].quantity -= quantity;
        holdings[trade.symbol].totalCost -= total - fee;
      }

      if (holdings[trade.symbol].quantity > 0) {
        holdings[trade.symbol].averagePrice = 
          holdings[trade.symbol].totalCost / holdings[trade.symbol].quantity;
      }
    }

    // Remove zero or negative holdings
    for (const symbol in holdings) {
      if (holdings[symbol].quantity <= 0.00000001) {
        delete holdings[symbol];
      }
    }

    return holdings;
  }
}
