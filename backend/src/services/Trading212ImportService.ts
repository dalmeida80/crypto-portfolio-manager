import { parse } from 'csv-parse/sync';
import { Trading212Transaction } from '../entities/Trading212Transaction';
import { AppDataSource } from '../config/database';

export class Trading212ImportService {
  private transactionRepo = AppDataSource.getRepository(Trading212Transaction);

  async importCSV(portfolioId: string, csvBuffer: Buffer): Promise<{
    imported: number;
    updated: number;
    duplicates: number;
    errors: string[];
  }> {
    const records = parse(csvBuffer, {
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

  private mapRowToEntity(row: any, portfolioId: string): Partial<Trading212Transaction> {
    return {
      portfolioId,
      action: row['Action'],
      time: new Date(row['Time']),
      isin: row['ISIN'] || null,
      ticker: row['Ticker'] || null,
      name: row['Name'] || null,
      notes: row['Notes'] || null,
      externalId: row['ID'] || null,
      shares: this.parseDecimal(row['No. of shares']),
      pricePerShare: this.parseDecimal(row['Price / share']),
      priceCurrency: row['Currency (Price / share)'] || null,
      exchangeRate: this.parseDecimal(row['Exchange rate']),
      resultAmount: this.parseDecimal(row['Result']),
      resultCurrency: row['Currency (Result)'] || null,
      totalAmount: this.parseDecimal(row['Total']),
      totalCurrency: row['Currency (Total)'] || null,
      merchantName: row['Merchant name'] || null,
      merchantCategory: row['Merchant category'] || null,
    };
  }

  private parseDecimal(value: string): number | null {
    if (!value) return null;
    const parsed = parseFloat(value.replace(/,/g, ''));
    return isNaN(parsed) ? null : parsed;
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
}
