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
 * Documentation: https://developer.revolut.com/docs/x-api/revolut-x-crypto-exchange-rest-api
 */
export class RevolutXService {
  private client: AxiosInstance;
  private apiKey: string;
  private privateKey: Uint8Array;

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
   * Get trade history from historical orders with pagination support
   * Fetches all pages automatically until no more data
   */
  async getTradeHistory(limit: number = 100, fromTimestamp?: number): Promise<any[]> {
    try {
      const allTrades: any[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      const maxPages = 50; // Safety limit

      do {
        pageCount++;
        
        const queryParams: Record<string, any> = { limit };
        
        if (fromTimestamp && !cursor) {
          // Only use dates on first request
          queryParams.start_date = fromTimestamp;
          queryParams.end_date = Date.now();
        }
        
        if (cursor) {
          queryParams.cursor = cursor;
        }

        console.log(`[Revolut X] Fetching page ${pageCount}${cursor ? ' (cursor: ' + cursor.substring(0, 20) + '...)' : ''}`);
        
        const response = await this.makeAuthenticatedRequest(
          'GET',
          '/api/1.0/orders/historical',
          queryParams
        );
        
        const orders = response.data || response || [];
        const metadata = response.metadata || {};
        
        console.log(`[Revolut X] Page ${pageCount}: ${orders.length} orders, has next: ${!!metadata.next_cursor}`);
        
        // Convert filled orders to trades
        for (const order of orders) {
          if (order.filled_quantity && parseFloat(order.filled_quantity) > 0) {
            allTrades.push({
              id: order.id,
              symbol: order.symbol,
              side: order.side,
              quantity: order.filled_quantity,
              price: order.average_price || order.limit_price || 0,
              timestamp: order.updated_at || order.created_at,
              status: order.status,
            });
          }
        }
        
        // Get next cursor
        cursor = metadata.next_cursor || null;
        
        // Safety check
        if (pageCount >= maxPages) {
          console.warn(`[Revolut X] Reached max page limit (${maxPages}), stopping pagination`);
          break;
        }
      } while (cursor);
      
      console.log(`[Revolut X] Total fetched: ${allTrades.length} trades from ${pageCount} page(s)`);
      return allTrades;
      
    } catch (error) {
      console.error('Failed to fetch Revolut X trade history:', error);
      return [];
    }
  }

  convertToInternalFormat(trade: any): any {
    return {
      externalId: trade.id?.toString() || '',
      timestamp: this.parseTimestamp(trade.timestamp || trade.updated_at || trade.created_at),
      symbol: this.normalizeSymbol(trade.symbol || ''),
      side: (trade.side || 'buy').toLowerCase(),
      quantity: parseFloat(trade.quantity || trade.filled_quantity || 0),
      price: parseFloat(trade.price || trade.average_price || 0),
      fee: parseFloat(trade.fee || 0),
      feeCurrency: trade.fee_currency || trade.feeCurrency || 'USD',
      type: 'trade',
    };
  }

  private normalizeSymbol(symbol: string): string {
    if (!symbol) return '';
    return symbol.replace('-', '').replace('/', '').toUpperCase();
  }
}
