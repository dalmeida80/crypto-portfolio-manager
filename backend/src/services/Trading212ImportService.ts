import { parse } from 'csv-parse/sync';
import { Trading212Transaction } from '../entities/Trading212Transaction';
import { AppDataSource } from '../index';
import { ETFPriceService } from './ETFPriceService';

interface CSVRow {
  'Action': string;
  'Time': string;
  'ISIN'?: string;
  'Ticker'?: string;
  'Name'?: string;
  'Notes'?: string;
  'ID'?: string;
  'No. of shares'?: string;
  'Price / share'?: string;
  'Currency (Price / share)'?: string;
  'Exchange rate'?: string;
  'Result'?: string;
  'Currency (Result)'?: string;
  'Total'?: string;
  'Currency (Total)'?: string;
  'Merchant name'?: string;
  'Merchant category'?: string;
}

export interface Trading212Holding {
  ticker: string;
  name: string;
  isin?: string;
  shares: number;
  averageBuyPrice: number;
  totalInvested: number;
  currentPrice?: number;
  currentValue?: number;
  profitLoss?: number;
  profitLossPercentage?: number;
  currency: string;
}

export class Trading212ImportService {
  private etfPriceService = new ETFPriceService();

  private get transactionRepo() {
    return AppDataSource.getRepository(Trading212Transaction);
  }

  async importCSV(portfolioId: string, csvBuffer: Buffer): Promise<{
    imported: number;
    updated: number;
    duplicates: number;
    errors: string[];
  }> {
    const records: CSVRow[] = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    let imported = 0;
    let updated = 0;
    let duplicates = 0;
    const errors: string[] = [];

    for (const row of records) {
      try {
        const externalId = row['ID'];
        const transaction = this.mapRowToEntity(row, portfolioId);

        if (externalId) {
          const existing = await this.transactionRepo.findOne({
            where: { portfolioId, externalId }
          });

          if (existing) {
            await this.transactionRepo.update(existing.id, transaction);
            updated++;
          } else {
            await this.transactionRepo.save(transaction);
            imported++;
          }
        } else {
          await this.transactionRepo.save(transaction);
          imported++;
        }
      } catch (error) {
        errors.push(`Row error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { imported, updated, duplicates, errors };
  }

  private mapRowToEntity(row: CSVRow, portfolioId: string): Partial<Trading212Transaction> {
    return {
      portfolioId,
      action: row['Action'],
      time: new Date(row['Time'] || ''),
      isin: row['ISIN'] || undefined,
      ticker: row['Ticker'] || undefined,
      name: row['Name'] || undefined,
      notes: row['Notes'] || undefined,
      externalId: row['ID'] || undefined,
      shares: this.parseDecimal(row['No. of shares']),
      pricePerShare: this.parseDecimal(row['Price / share']),
      priceCurrency: row['Currency (Price / share)'] || undefined,
      exchangeRate: this.parseDecimal(row['Exchange rate']),
      resultAmount: this.parseDecimal(row['Result']),
      resultCurrency: row['Currency (Result)'] || undefined,
      totalAmount: this.parseDecimal(row['Total']),
      totalCurrency: row['Currency (Total)'] || undefined,
      merchantName: row['Merchant name'] || undefined,
      merchantCategory: row['Merchant category'] || undefined,
    };
  }

  private parseDecimal(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = parseFloat(value.replace(/,/g, ''));
    return isNaN(parsed) ? undefined : parsed;
  }

  async getSummary(portfolioId: string) {
    const transactions = await this.transactionRepo.find({ where: { portfolioId } });

    const totalDeposits = this.sumByAction(transactions, 'Deposit');
    const totalWithdrawals = Math.abs(this.sumByAction(transactions, 'Withdrawal'));
    const interestOnCash = this.sumByAction(transactions, 'Interest on cash');
    const cashback = this.sumByAction(transactions, 'Spending cashback');
    const cardDebits = Math.abs(this.sumByAction(transactions, 'Card debit'));

    const netDeposits = totalDeposits - totalWithdrawals;
    const currentBalance = netDeposits + interestOnCash + cashback - cardDebits;

    return {
      totalDeposits,
      totalWithdrawals,
      netDeposits,
      interestOnCash,
      cashback,
      cardDebits,
      currentBalance,
      transactionsCount: transactions.length
    };
  }

  private sumByAction(transactions: Trading212Transaction[], action: string): number {
    return transactions
      .filter(t => t.action === action)
      .reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  }

  async getTransactions(portfolioId: string, limit = 50, offset = 0) {
    const [transactions, total] = await this.transactionRepo.findAndCount({
      where: { portfolioId },
      order: { time: 'DESC' },
      take: limit,
      skip: offset
    });

    return { transactions, total };
  }

  /**
   * Calculate current holdings from buy/sell transactions
   */
  async getHoldings(portfolioId: string): Promise<Trading212Holding[]> {
    // Fetch trades from API sync (holdings snapshot)
    const tradesFromAPI = await this.tradeRepo.find({
      where: { 
        portfolioId,
        source: 'trading212-holdings-snapshot'
      }
    });

    // If we have fresh API data, use it directly
    if (tradesFromAPI.length > 0) {
      console.log(`[Trading212] Using ${tradesFromAPI.length} holdings from API snapshot`);
      
      const tickers = tradesFromAPI.map(t => t.symbol);
      const prices = await this.etfPriceService.getPrices(tickers);
      
      return tradesFromAPI.map(trade => {
        const priceData = prices.get(trade.symbol);
        const currentPrice = priceData?.price || trade.price;
        const currentValue = trade.quantity * currentPrice;
        const totalInvested = trade.quantity * trade.price;
        
        return {
          ticker: trade.symbol,
          name: trade.symbol,
          shares: trade.quantity,
          averageBuyPrice: trade.price,
          totalInvested,
          currentPrice,
          currentValue,
          profitLoss: currentValue - totalInvested,
          profitLossPercentage: totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested) * 100 : 0,
          currency: 'EUR'
        };
      });
    }

    // Fallback: calculate from transactions (CSV)
    console.log(`[Trading212] No API snapshot found, calculating from transactions`);
    
    const transactions = await this.transactionRepo.find({
      where: { portfolioId },
      order: { time: 'ASC' }
    });

    // Group by ticker
    const holdingsMap = new Map<string, {
      ticker: string;
      name: string;
      isin?: string;
      shares: number;
      totalCost: number;
      currency: string;
    }>();

    for (const tx of transactions) {
      if (!tx.ticker || !tx.shares || !tx.pricePerShare) continue;

      const action = tx.action.toLowerCase();
      if (!action.includes('buy') && !action.includes('sell')) continue;

      const holding = holdingsMap.get(tx.ticker) || {
        ticker: tx.ticker,
        name: tx.name || tx.ticker,
        isin: tx.isin,
        shares: 0,
        totalCost: 0,
        currency: tx.priceCurrency || 'EUR'
      };

      if (action.includes('buy')) {
        holding.shares += tx.shares;
        holding.totalCost += tx.shares * tx.pricePerShare;
      } else if (action.includes('sell')) {
        const avgPrice = holding.shares > 0 ? holding.totalCost / holding.shares : 0;
        holding.shares -= tx.shares;
        holding.totalCost -= tx.shares * avgPrice;
      }

      if (holding.shares > 0.0001) {
        holdingsMap.set(tx.ticker, holding);
      } else {
        holdingsMap.delete(tx.ticker);
      }
    }

    // Get current prices
    const tickers = Array.from(holdingsMap.keys());
    const prices = await this.etfPriceService.getPrices(tickers);

    // Build final holdings with P&L
    const holdings: Trading212Holding[] = [];
    for (const [ticker, data] of holdingsMap.entries()) {
      const averageBuyPrice = data.shares > 0 ? data.totalCost / data.shares : 0;
      const priceData = prices.get(ticker);
      
      const holding: Trading212Holding = {
        ticker: data.ticker,
        name: data.name,
        isin: data.isin,
        shares: data.shares,
        averageBuyPrice,
        totalInvested: data.totalCost,
        currency: data.currency
      };

      if (priceData) {
        holding.currentPrice = priceData.price;
        holding.currentValue = data.shares * priceData.price;
        holding.profitLoss = holding.currentValue - data.totalCost;
        holding.profitLossPercentage = data.totalCost > 0 
          ? (holding.profitLoss / data.totalCost) * 100 
          : 0;
      }

      holdings.push(holding);
    }

    return holdings;
  }
   */
  async getPortfolioTotals(portfolioId: string) {
    const holdings = await this.getHoldings(portfolioId);
    
    let totalInvested = 0;
    let totalCurrentValue = 0;
    let holdingsWithPrices = 0;

    for (const holding of holdings) {
      totalInvested += holding.totalInvested;
      if (holding.currentValue !== undefined) {
        totalCurrentValue += holding.currentValue;
        holdingsWithPrices++;
      }
    }

    const profitLoss = totalCurrentValue - totalInvested;
    const profitLossPercentage = totalInvested > 0 
      ? (profitLoss / totalInvested) * 100 
      : 0;

    return {
      totalInvested,
      totalCurrentValue,
      profitLoss,
      profitLossPercentage,
      holdingsCount: holdings.length,
      holdingsWithPrices
    };
  }
}
