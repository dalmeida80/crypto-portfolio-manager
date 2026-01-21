import { parse } from 'csv-parse/sync';
import { Trading212Transaction } from '../entities/Trading212Transaction';
import { AppDataSource } from '../index';

interface CSVRow {
  'ID'?: string;
  'Action': string;
  'Time': string;
  'ISIN'?: string;
  'Ticker'?: string;
  'Name'?: string;
  'Notes'?: string;
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

export class Trading212ImportService {
  private transactionRepo = AppDataSource.getRepository(Trading212Transaction);

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
}
