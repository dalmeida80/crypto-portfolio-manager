/**
 * Revolut X CSV Parser
 * 
 * Parses Revolut X account statement CSV files to extract:
 * - Trades (Buy/Sell)
 * - Deposits (EUR,Other entries with positive Value)
 * - Withdrawals (EUR,Other entries with negative Value)
 * 
 * CSV Format:
 * Symbol,Type,Quantity,Price,Value,Fees,Date
 * DOGE,Buy - Revolut X,202.4291,€0.12,€24.93,€0.02,"1 Dec 2025, 00:08:50"
 * EUR,Other,,,€25.00,€0.00,"1 Dec 2025, 00:08:49"
 */

export interface RevolutXCsvRow {
  symbol: string;
  type: string;
  quantity: string;
  price: string;
  value: string;
  fees: string;
  date: string;
}

export interface ParsedRevolutXDeposit {
  amount: number;
  currency: string;
  timestamp: Date;
  type: 'DEPOSIT' | 'WITHDRAWAL';
}

export interface ParsedRevolutXTrade {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  value: number;
  fee: number;
  timestamp: Date;
}

export class RevolutXCsvParser {
  /**
   * Parse amount string (removes € or $ symbol and converts to number)
   */
  private static parseAmount(value: string): number {
    if (!value || value.trim() === '') return 0;
    
    // Remove currency symbols and whitespace
    const cleaned = value.replace(/[€$,\s]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Parse Revolut X date format: "1 Dec 2025, 00:08:50"
   */
  private static parseDate(dateStr: string): Date {
    try {
      // Remove quotes if present
      const cleaned = dateStr.replace(/"/g, '').trim();
      
      // Parse format: "1 Dec 2025, 00:08:50"
      const date = new Date(cleaned);
      
      if (isNaN(date.getTime())) {
        console.warn(`[RevolutX CSV] Invalid date format: ${dateStr}, using current time`);
        return new Date();
      }
      
      return date;
    } catch (error) {
      console.error(`[RevolutX CSV] Error parsing date: ${dateStr}`, error);
      return new Date();
    }
  }

  /**
   * Check if row is a EUR deposit/withdrawal
   */
  private static isTransfer(row: RevolutXCsvRow): boolean {
    return row.symbol === 'EUR' && row.type === 'Other';
  }

  /**
   * Check if row is a trade (buy/sell)
   */
  private static isTrade(row: RevolutXCsvRow): boolean {
    return row.type.includes('Buy') || row.type.includes('Sell');
  }

  /**
   * Parse a single row into a deposit/withdrawal
   */
  static parseTransfer(row: RevolutXCsvRow): ParsedRevolutXDeposit | null {
    if (!this.isTransfer(row)) return null;

    const amount = this.parseAmount(row.value);
    if (amount === 0) return null;

    return {
      amount: Math.abs(amount),
      currency: 'EUR',
      timestamp: this.parseDate(row.date),
      type: amount > 0 ? 'DEPOSIT' : 'WITHDRAWAL'
    };
  }

  /**
   * Parse a single row into a trade
   */
  static parseTrade(row: RevolutXCsvRow): ParsedRevolutXTrade | null {
    if (!this.isTrade(row)) return null;

    const quantity = parseFloat(row.quantity) || 0;
    if (quantity === 0) return null;

    const side = row.type.includes('Buy') ? 'BUY' : 'SELL';
    const price = this.parseAmount(row.price);
    const value = this.parseAmount(row.value);
    const fee = this.parseAmount(row.fees);

    // Normalize symbol (remove /EUR suffix)
    let symbol = row.symbol.toUpperCase();
    if (symbol.includes('/')) {
      symbol = symbol.split('/')[0];
    }
    symbol = symbol + 'EUR'; // Standardize to XXXEUR format

    return {
      symbol,
      side,
      quantity,
      price,
      value,
      fee,
      timestamp: this.parseDate(row.date)
    };
  }

  /**
   * Parse CSV content into deposits and trades
   */
  static parseCSV(csvContent: string): {
    deposits: ParsedRevolutXDeposit[];
    trades: ParsedRevolutXTrade[];
  } {
    const deposits: ParsedRevolutXDeposit[] = [];
    const trades: ParsedRevolutXTrade[] = [];

    // Split into lines
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
      console.warn('[RevolutX CSV] File is empty or has no data rows');
      return { deposits, trades };
    }

    // Skip header (first line)
    const dataLines = lines.slice(1);

    for (const line of dataLines) {
      if (!line.trim()) continue;

      // Parse CSV line (handle quoted fields)
      const row = this.parseCSVLine(line);
      if (!row) continue;

      // Try parsing as transfer
      const transfer = this.parseTransfer(row);
      if (transfer) {
        deposits.push(transfer);
        continue;
      }

      // Try parsing as trade
      const trade = this.parseTrade(row);
      if (trade) {
        trades.push(trade);
      }
    }

    console.log(`[RevolutX CSV] Parsed ${deposits.length} deposits and ${trades.length} trades`);
    return { deposits, trades };
  }

  /**
   * Parse a single CSV line (handles quoted fields with commas)
   */
  private static parseCSVLine(line: string): RevolutXCsvRow | null {
    try {
      const fields: string[] = [];
      let currentField = '';
      let insideQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          fields.push(currentField.trim());
          currentField = '';
        } else {
          currentField += char;
        }
      }
      fields.push(currentField.trim());

      // Expected format: Symbol,Type,Quantity,Price,Value,Fees,Date
      if (fields.length < 7) {
        return null;
      }

      return {
        symbol: fields[0],
        type: fields[1],
        quantity: fields[2],
        price: fields[3],
        value: fields[4],
        fees: fields[5],
        date: fields[6]
      };
    } catch (error) {
      console.error('[RevolutX CSV] Error parsing line:', line, error);
      return null;
    }
  }
}
