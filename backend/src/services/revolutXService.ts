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
    console.log('[Revolut X Debug] Signature message:', message);
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.privateKey);
    return this.uint8ArrayToBase64(signature);
  }

  /**
   * Build query string that matches exactly what will be sent in the URL
   * CRITICAL: Must match the exact order and format axios sends
   */
  private buildQueryStringForSignature(params?: Record<string, any>): string {
    if (!params || Object.keys(params).length === 0) {
      return '';
    }
    
    // Build URL to see exactly what axios will send
    const url = new URL('http://dummy.com');
    Object.keys(params).forEach(key => {
      url.searchParams.append(key, params[key]);
    });
    
    // Get query string without '?'
    const queryString = url.search.substring(1);
    console.log('[Revolut X Debug] Query string from URLSearchParams:', queryString);
    
    return queryString;
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

    console.log('[Revolut X Debug] Request:', {
      method,
      path,
      queryParams,
      timestamp,
      hasBody: !!body,
    });

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
      console.log('[Revolut X] Testing connection with /api/1.0/balances...');
      await this.makeAuthenticatedRequest('GET', '/api/1.0/balances');
      console.log('[Revolut X] Connection test PASSED');
      return true;
    } catch (error) {
      console.error('Revolut X connection test failed:', error);
      return false;
    }
  }

  async getAccountBalances(): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest('GET', '/api/1.0/balances');
      // Filter balances with total > 0
      return data.filter((balance: any) => parseFloat(balance.total || 0) > 0);
    } catch (error) {
      throw new Error(`Failed to fetch Revolut X balances: ${error}`);
    }
  }

  /**
   * Get trade history from historical orders
   */
  async getTradeHistory(limit: number = 100, fromTimestamp?: number): Promise<any[]> {
    try {
      // First test: try WITHOUT query params to verify basic auth works
      console.log('[Revolut X] Testing basic request without query params...');
      try {
        await this.makeAuthenticatedRequest('GET', '/api/1.0/balances');
        console.log('[Revolut X] Basic auth works!');
      } catch (e) {
        console.error('[Revolut X] Basic auth FAILED:', e);
        return [];
      }

      // Now try with query params
      const queryParams: Record<string, any> = { limit };
      
      if (fromTimestamp) {
        queryParams.start_date = fromTimestamp;
        queryParams.end_date = Date.now();
      }

      console.log('[Revolut X] Attempting historical orders request...');
      const response = await this.makeAuthenticatedRequest(
        'GET',
        '/api/1.0/orders/historical',
        queryParams
      );
      
      const orders = response.data || response || [];
      console.log(`[Revolut X] Fetched ${orders.length} historical orders`);
      
      // Convert filled orders to trade format
      const trades: any[] = [];
      for (const order of orders) {
        if (order.filled_quantity && parseFloat(order.filled_quantity) > 0) {
          trades.push({
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
      
      return trades;
    } catch (error) {
      console.error('Failed to fetch Revolut X trade history:', error);
      return [];
    }
  }

  convertToInternalFormat(trade: any): any {
    return {
      externalId: trade.id?.toString() || '',
      timestamp: new Date(trade.timestamp || trade.updated_at || trade.created_at),
      symbol: this.normalizeSymbol(trade.symbol),
      side: (trade.side || '').toLowerCase(),
      quantity: parseFloat(trade.quantity || trade.filled_quantity || 0),
      price: parseFloat(trade.price || trade.average_price || 0),
      fee: parseFloat(trade.fee || 0),
      feeCurrency: trade.fee_currency || trade.feeCurrency || 'USD',
      type: 'trade',
    };
  }

  private normalizeSymbol(symbol: string): string {
    return symbol.replace('-', '').replace('/', '').toUpperCase();
  }
}
