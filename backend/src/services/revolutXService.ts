import axios, { AxiosInstance } from 'axios';
import * as nacl from 'tweetnacl';
import { decrypt } from '../utils/encryption';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

/**
 * RevolutXService - Handles Revolut X API authentication and data fetching
 * 
 * Authentication:
 * - Headers: X-Revx-API-Key, X-Revx-Timestamp, X-Revx-Signature
 * - Signature format: timestamp + METHOD + path + queryString + body
 * - Ed25519 signature, base64 encoded
 * 
 * Fee Model:
 * - Revolut X charges 0% maker fees and 0.09% taker fees
 * - The historical orders API does not expose per-trade fee information
 * - We calculate an estimated fee of 0.09% (taker) for all trades
 * - Fee is always in the quote currency (EUR for XXX/EUR pairs)
 * 
 * Documentation: https://developer.revolut.com/docs/x-api/revolut-x-crypto-exchange-rest-api
 */
export class RevolutXService {
  private client: AxiosInstance;
  private apiKey: string;
  private privateKey: Uint8Array;

  // Revolut X fee schedule (as of 2024)
  private static readonly MAKER_FEE_RATE = 0.0000; // 0%
  private static readonly TAKER_FEE_RATE = 0.0009; // 0.09%

  constructor(apiKey: string, privateKeyInput: string) {
    this.apiKey = apiKey;
    this.privateKey = this.parsePrivateKey(privateKeyInput);
    
    this.client = axios.create({
      baseURL: 'https://revx.revolut.com',
      timeout: 30000,
    });
  }

  static async createFromApiKey(exchangeApiKey: ExchangeApiKey): Promise<RevolutXService> {
    const apiKey = decrypt(exchangeApiKey.apiKey);
    const privateKeyInput = decrypt(exchangeApiKey.apiSecret);
    return new RevolutXService(apiKey, privateKeyInput);
  }

  private parsePrivateKey(input: string): Uint8Array {
    input = input.trim();

    // PEM format (-----BEGIN PRIVATE KEY-----)
    if (input.includes('BEGIN PRIVATE KEY')) {
      const base64 = input
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
      
      const der = this.base64ToUint8Array(base64);
      const seed = der.slice(-32);
      const keypair = nacl.sign.keyPair.fromSeed(seed);
      return keypair.secretKey;
    }
    
    // Hex format (64 or 128 chars)
    if (/^[0-9a-fA-F]+$/.test(input.replace(/\s/g, ''))) {
      const hex = input.replace(/\s/g, '');
      
      // 32-byte seed (64 hex chars)
      if (hex.length === 64) {
        const seed = this.hexToUint8Array(hex);
        const keypair = nacl.sign.keyPair.fromSeed(seed);
        return keypair.secretKey;
      }
      
      // 64-byte secret key (128 hex chars)
      if (hex.length === 128) {
        return this.hexToUint8Array(hex);
      }
    }

    // Try Base64 format (most common for Revolut X)
    try {
      const decoded = this.base64ToUint8Array(input);
      
      // If 32 bytes, it's a seed
      if (decoded.length === 32) {
        const keypair = nacl.sign.keyPair.fromSeed(decoded);
        return keypair.secretKey;
      }
      
      // If 64 bytes, it's the full secret key
      if (decoded.length === 64) {
        return decoded;
      }

      // If it's a DER-encoded key, extract the last 32 bytes as seed
      if (decoded.length > 32) {
        const seed = decoded.slice(-32);
        const keypair = nacl.sign.keyPair.fromSeed(seed);
        return keypair.secretKey;
      }
    } catch (e) {
      // Not valid base64, continue to error
    }

    throw new Error('Invalid private key format. Expected PEM, hex (64/128 chars), or base64.');
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  private uint8ArrayToBase64(arr: Uint8Array): string {
    return Buffer.from(arr).toString('base64');
  }

  /**
   * Parse timestamp to Date object
   * Handles Unix epoch milliseconds, ISO strings, and other formats
   */
  private parseTimestamp(value: any): Date {
    if (!value) {
      return new Date();
    }

    // If already a Date
    if (value instanceof Date) {
      return value;
    }

    // If Unix timestamp (number or string number)
    if (typeof value === 'number' || /^\d+$/.test(String(value))) {
      const timestamp = Number(value);
      return new Date(timestamp);
    }

    // Try parsing as ISO string
    const parsed = new Date(value);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    // Fallback to current time
    console.warn(`[Revolut X] Could not parse timestamp: ${value}, using current time`);
    return new Date();
  }

  /**
   * Calculate estimated fee for a trade
   * Since the API doesn't provide per-trade fees, we estimate using the taker fee rate
   * 
   * @param quantity - Trade quantity in base currency
   * @param price - Trade price in quote currency
   * @returns Estimated fee in quote currency (EUR for XXX/EUR pairs)
   */
  private calculateEstimatedFee(quantity: number, price: number): number {
    const tradeValue = quantity * price;
    const estimatedFee = tradeValue * RevolutXService.TAKER_FEE_RATE;
    return estimatedFee;
  }

  /**
   * Extract quote currency from symbol (e.g., "BTC-EUR" -> "EUR")
   */
  private getQuoteCurrency(symbol: string): string {
    if (!symbol) return 'EUR';
    
    // Handle formats: BTC-EUR, BTC/EUR, BTCEUR
    const normalized = symbol.toUpperCase();
    
    if (normalized.includes('-')) {
      return normalized.split('-')[1] || 'EUR';
    }
    
    if (normalized.includes('/')) {
      return normalized.split('/')[1] || 'EUR';
    }
    
    // Common quote currencies for Revolut X
    const quotes = ['EUR', 'USD', 'GBP', 'BTC', 'ETH'];
    for (const quote of quotes) {
      if (normalized.endsWith(quote)) {
        return quote;
      }
    }
    
    // Default to EUR (primary quote currency on Revolut X)
    return 'EUR';
  }

  /**
   * Generate Ed25519 signature according to Revolut X spec
   * Format: timestamp + METHOD + path + queryString + body
   */
  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    queryString: string = '',
    body: string = ''
  ): string {
    const message = timestamp + method.toUpperCase() + path + queryString + body;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.privateKey);
    return this.uint8ArrayToBase64(signature);
  }

  /**
   * Build query string for signature (must match axios output)
   */
  private buildQueryStringForSignature(params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) {
      return '';
    }
    
    const url = new URL('http://dummy.com');
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });
    
    return url.search.substring(1);
  }

  private async makeAuthenticatedRequest(
    method: 'GET' | 'POST',
    path: string,
    queryParams?: Record<string, any>,
    data?: any
  ): Promise<any> {
    const timestamp = Date.now().toString();
    const queryStringForSignature = this.buildQueryStringForSignature(queryParams);
    const body = data ? JSON.stringify(data) : '';
    const signature = this.generateSignature(timestamp, method, path, queryStringForSignature, body);

    const headers = {
      'X-Revx-API-Key': this.apiKey,
      'X-Revx-Timestamp': timestamp,
      'X-Revx-Signature': signature,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    try {
      const response = await this.client.request({
        method,
        url: path,
        params: queryParams,
        headers,
        data,
      });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        throw new Error(
          `Revolut X API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.makeAuthenticatedRequest('GET', '/api/1.0/balances');
      return true;
    } catch (error) {
      console.error('Revolut X connection test failed:', error);
      return false;
    }
  }

  async getAccountBalances(): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest('GET', '/api/1.0/balances');
      return data.filter((balance: any) => parseFloat(balance.total || 0) > 0);
    } catch (error) {
      throw new Error(`Failed to fetch Revolut X balances: ${error}`);
    }
  }

  /**
   * Fetch historical orders for a specific date range (max 7 days per request)
   * Includes cursor-based pagination
   */
  private async fetchHistoricalOrdersChunk(
    startDate: number,
    endDate: number,
    limit: number = 100
  ): Promise<any[]> {
    const allOrders: any[] = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 20; // Safety limit per chunk

    do {
      pageCount++;
      
      const queryParams: Record<string, any> = { 
        limit,
        start_date: startDate,
        end_date: endDate
      };
      
      if (cursor) {
        queryParams.cursor = cursor;
      }

      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/api/1.0/orders/historical',
        queryParams
      );
      
      const orders = response.data || response || [];
      const metadata = response.metadata || {};
      
      allOrders.push(...orders);
      
      // Get next cursor
      cursor = metadata.next_cursor || null;
      
      // Safety check
      if (pageCount >= maxPages) {
        console.warn(`[Revolut X] Reached max page limit (${maxPages}) for chunk, stopping pagination`);
        break;
      }
    } while (cursor);
    
    return allOrders;
  }

  /**
   * Get trade history with automatic chunking to bypass 7-day limit
   * Fetches from NEWEST to OLDEST (reverse chronological) to find recent trades first
   */
  async getTradeHistory(limit: number = 100, fromTimestamp?: number): Promise<any[]> {
    try {
      const allTrades: any[] = [];
      const now = Date.now();
      
      // Default to 2 years ago if no start date provided
      const startTimestamp = fromTimestamp || (now - (730 * 24 * 60 * 60 * 1000)); // 2 years
      
      // Calculate 6-day chunks (safety margin from 7-day API limit)
      const CHUNK_SIZE_MS = 6 * 24 * 60 * 60 * 1000; // 6 days in milliseconds
      const chunks: Array<{ start: number; end: number }> = [];
      
      // Build chunks in REVERSE (newest first)
      let currentEnd = now;
      while (currentEnd > startTimestamp) {
        const currentStart = Math.max(currentEnd - CHUNK_SIZE_MS, startTimestamp);
        chunks.push({ start: currentStart, end: currentEnd });
        currentEnd = currentStart - 1; // Move to previous chunk
      }
      
      console.log(`[Revolut X] Fetching history in ${chunks.length} chunk(s) of ~6 days each (newest to oldest)`);
      console.log(`[Revolut X] Date range: ${new Date(startTimestamp).toISOString()} to ${new Date(now).toISOString()}`);
      
      let emptyChunksInARow = 0;
      const MAX_EMPTY_CHUNKS = 10; // Stop after 60 days of no data
      let isFirstBatch = true;
      
      // Fetch each chunk (starting from most recent)
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStart = new Date(chunk.start).toISOString().split('T')[0];
        const chunkEnd = new Date(chunk.end).toISOString().split('T')[0];
        
        console.log(`[Revolut X] Chunk ${i + 1}/${chunks.length}: ${chunkStart} to ${chunkEnd}`);
        
        try {
          const orders = await this.fetchHistoricalOrdersChunk(chunk.start, chunk.end, limit);
          console.log(`[Revolut X] Chunk ${i + 1}: fetched ${orders.length} orders`);
          
          // Log first order structure ONCE for debugging
          if (isFirstBatch && orders.length > 0) {
            console.log('[Revolut X] Sample order:', {
              symbol: orders[0].symbol,
              side: orders[0].side,
              filled_quantity: orders[0].filled_quantity,
              average_fill_price: orders[0].average_fill_price,
              created_date: orders[0].created_date
            });
            isFirstBatch = false;
          }
          
          // Track empty chunks
          if (orders.length === 0) {
            emptyChunksInARow++;
          } else {
            emptyChunksInARow = 0; // Reset counter when we find data
          }
          
          // Convert filled orders to trades
          for (const order of orders) {
            if (order.filled_quantity && parseFloat(order.filled_quantity) > 0) {
              allTrades.push({
                id: order.id,
                symbol: order.symbol,
                side: order.side,
                quantity: order.filled_quantity,
                price: order.average_fill_price || order.price || 0,
                timestamp: order.created_date,
                status: order.status,
              });
            }
          }
          
          // Stop if too many consecutive empty chunks (60 days of no activity)
          if (emptyChunksInARow >= MAX_EMPTY_CHUNKS) {
            console.log(`[Revolut X] ${MAX_EMPTY_CHUNKS} consecutive empty chunks (60 days), stopping early at chunk ${i + 1}`);
            break;
          }
          
          // Small delay between chunks to avoid rate limiting
          if (i < chunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error: any) {
          console.error(`[Revolut X] Error fetching chunk ${i + 1}:`, error.message);
          // Continue with next chunk instead of failing completely
        }
      }
      
      console.log(`[Revolut X] Total fetched: ${allTrades.length} trades`);
      return allTrades;
      
    } catch (error) {
      console.error('Failed to fetch Revolut X trade history:', error);
      return [];
    }
  }

  /**
   * Convert Revolut X trade to internal format
   * Calculates estimated fee based on trade value (0.09% taker fee)
   */
  convertToInternalFormat(trade: any): any {
    const quantity = parseFloat(trade.quantity || 0);
    const price = parseFloat(trade.price || 0);
    const quoteCurrency = this.getQuoteCurrency(trade.symbol);
    
    // Calculate estimated fee (0.09% of trade value)
    // Note: Revolut X API doesn't expose per-trade fees in historical orders
    const estimatedFee = this.calculateEstimatedFee(quantity, price);
    
    return {
      externalId: trade.id?.toString() || '',
      timestamp: this.parseTimestamp(trade.timestamp),
      symbol: this.normalizeSymbol(trade.symbol || ''),
      side: (trade.side || 'buy').toLowerCase(),
      quantity,
      price,
      fee: estimatedFee,
      feeCurrency: quoteCurrency,
      type: 'trade',
    };
  }

  private normalizeSymbol(symbol: string): string {
    if (!symbol) return '';
    return symbol.replace('-', '').replace('/', '').toUpperCase();
  }
}
