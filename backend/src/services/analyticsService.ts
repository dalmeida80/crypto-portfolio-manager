import { AppDataSource } from '../index';
import { Portfolio } from '../entities/Portfolio';
import { Trade } from '../entities/Trade';
import { BinanceService } from './binanceService';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

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
  static async calculatePortfolioMetrics(
    portfolioId: string,
    userId: string,
    apiKeyId?: string
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
      
      // Get current prices if API key provided
      let enrichedHoldings: HoldingAnalytics[] = [];
      let totalInvested = 0;
      let totalCurrentValue = 0;

      if (apiKeyId) {
        const apiKeyRepo = AppDataSource.getRepository(ExchangeApiKey);
        const apiKey = await apiKeyRepo.findOne({
          where: { id: apiKeyId, userId },
        });

        if (apiKey) {
          const binance = await BinanceService.createFromApiKey(apiKey);

          for (const [symbol, data] of Object.entries(holdings)) {
            try {
              const currentPrice = await binance.getCurrentPrice(symbol);
              const currentValue = data.quantity * currentPrice;
              const profitLoss = currentValue - data.totalCost;
              const profitLossPercent = (profitLoss / data.totalCost) * 100;

              enrichedHoldings.push({
                symbol,
                totalQuantity: data.quantity,
                averageBuyPrice: data.averagePrice,
                totalInvested: data.totalCost,
                currentPrice,
                currentValue,
                profitLoss,
                profitLossPercent,
              });

              totalInvested += data.totalCost;
              totalCurrentValue += currentValue;
            } catch (error) {
              console.error(`Failed to get price for ${symbol}:`, error);
            }
          }
        }
      }

      const totalProfitLoss = totalCurrentValue - totalInvested;
      const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

      // Update portfolio totals - convert to string for PostgreSQL decimal type
      portfolio.totalInvested = parseFloat(totalInvested.toFixed(8)) as any;
      portfolio.currentValue = parseFloat(totalCurrentValue.toFixed(8)) as any;
      portfolio.profitLoss = parseFloat(totalProfitLoss.toFixed(8)) as any;
      await portfolioRepo.save(portfolio);

      return {
        portfolio: {
          id: portfolio.id,
          name: portfolio.name,
          totalInvested: parseFloat(totalInvested.toFixed(8)),
          currentValue: parseFloat(totalCurrentValue.toFixed(8)),
          profitLoss: parseFloat(totalProfitLoss.toFixed(8)),
          profitLossPercent: parseFloat(totalProfitLossPercent.toFixed(2)),
          totalFees: parseFloat(totalFees.toFixed(8)), // Add total fees
        },
        holdings: enrichedHoldings,
        totalTrades: portfolio.trades.length,
        totalFees: parseFloat(totalFees.toFixed(8)), // Also in root
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

    // Remove zero holdings
    for (const symbol in holdings) {
      if (holdings[symbol].quantity <= 0) {
        delete holdings[symbol];
      }
    }

    return holdings;
  }
}
