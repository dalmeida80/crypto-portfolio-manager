import axios, { AxiosInstance } from 'axios';
import * as nacl from 'tweetnacl';
import { decrypt } from '../utils/encryption';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

/**
 * RevolutXService - Handles Revolut X API authentication and data fetching
 * 
 * Authentication uses Ed25519 signatures:
 * - Headers: X-Revx-API-Key, X-Revx-Timestamp, X-Revx-Signature
 * - Signature is created from: timestamp + method + path + queryString + body
 * - Path must start with /api
 * - Signature must be base64 encoded (not hex)
 */
export class RevolutXService {
  private client: AxiosInstance;
  private apiKey: string;
  private privateKey: Uint8Array;

  constructor(apiKey: string, privateKeyInput: string) {
    this.apiKey = apiKey;
    // Parse private key from PEM or hex format
    this.privateKey = this.parsePrivateKey(privateKeyInput);
    
    this.client = axios.create({
      baseURL: 'https://api.revolut.com',
      timeout: 30000,
    });
  }

  /**
   * Create service instance from encrypted ExchangeApiKey entity
   */
  static async createFromApiKey(exchangeApiKey: ExchangeApiKey): Promise<RevolutXService> {
    const apiKey = decrypt(exchangeApiKey.apiKey);
    const privateKeyInput = decrypt(exchangeApiKey.apiSecret);
    return new RevolutXService(apiKey, privateKeyInput);
  }

  /**
   * Parse private key from PEM or hex format
   * Ed25519 private key must be 64 bytes (32 byte seed + 32 byte public key)
   */
  private parsePrivateKey(input: string): Uint8Array {
    input = input.trim();

    // If it's PEM format, extract the base64 content
    if (input.includes('BEGIN PRIVATE KEY')) {
      const base64 = input
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s/g, '');
      
      const der = this.base64ToUint8Array(base64);
      const seed = der.slice(-32);
      const keypair = nacl.sign.keyPair.fromSeed(seed);
      return keypair.secretKey; // 64 bytes
    }
    
    // If it's hex format
    if (/^[0-9a-fA-F]+$/.test(input.replace(/\s/g, ''))) {
      const hex = input.replace(/\s/g, '');
      
      if (hex.length === 64) {
        const seed = this.hexToUint8Array(hex);
        const keypair = nacl.sign.keyPair.fromSeed(seed);
        return keypair.secretKey;
      }
      
      if (hex.length === 128) {
        return this.hexToUint8Array(hex);
      }
    }

    throw new Error('Invalid private key format. Expected PEM or 64/128 character hex string.');
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = Buffer.from(base64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Convert hex string to Uint8Array
   */
  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
  }

  /**
   * Convert Uint8Array to base64 string
   */
  private uint8ArrayToBase64(arr: Uint8Array): string {
    return Buffer.from(arr).toString('base64');
  }

  /**
   * Generate Ed25519 signature for API request
   * Message format: timestamp + method + path + queryString + body
   * Path must start with /api
   * Query string without '?'
   * Signature is base64 encoded
   */
  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    queryString: string = '',
    body: string = ''
  ): string {
    // Construct message: timestamp + METHOD + /api/path + query + body
    const message = timestamp + method.toUpperCase() + path + queryString + body;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.privateKey);
    // Return base64 encoded signature (not hex!)
    return this.uint8ArrayToBase64(signature);
  }

  /**
   * Make authenticated request to Revolut X API
   */
  private async makeAuthenticatedRequest(
    method: 'GET' | 'POST',
    path: string,
    queryParams?: Record<string, any>,
    data?: any
  ): Promise<any> {
    const timestamp = Date.now().toString();
    
    // Build query string
    const queryString = queryParams
      ? Object.entries(queryParams)
          .map(([key, value]) => `${key}=${value}`)
          .join('&')
      : '';
    
    // Body as JSON string
    const body = data ? JSON.stringify(data) : '';
    
    // Generate signature with query string
    const signature = this.generateSignature(timestamp, method, path, queryString, body);

    const headers = {
      'X-Revx-API-Key': this.apiKey,
      'X-Revx-Timestamp': timestamp,
      'X-Revx-Signature': signature,
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

  /**
   * Test API connection by fetching balances
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.makeAuthenticatedRequest('GET', '/api/1.0/crypto-exchange/balances');
      return true;
    } catch (error) {
      console.error('Revolut X connection test failed:', error);
      return false;
    }
  }

  /**
   * Get account balances (assets with quantity > 0)
   */
  async getAccountBalances(): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest('GET', '/api/1.0/crypto-exchange/balances');
      // Filter balances with total > 0
      return data.filter((balance: any) => parseFloat(balance.total || 0) > 0);
    } catch (error) {
      throw new Error(`Failed to fetch Revolut X balances: ${error}`);
    }
  }

  /**
   * Get trade history (fills)
   * @param limit - Number of trades to fetch (default 100, max 1000)
   * @param fromTimestamp - Start timestamp in milliseconds
   */
  async getTradeHistory(limit: number = 100, fromTimestamp?: number): Promise<any[]> {
    try {
      const queryParams: Record<string, any> = { limit };
      
      if (fromTimestamp) {
        queryParams.from = fromTimestamp;
      }

      const data = await this.makeAuthenticatedRequest(
        'GET',
        '/api/1.0/crypto-exchange/trades',
        queryParams
      );
      
      return data;
    } catch (error) {
      console.error('Failed to fetch Revolut X trade history:', error);
      return [];
    }
  }

  /**
   * Convert Revolut X trade to internal format
   */
  convertToInternalFormat(trade: any): any {
    return {
      externalId: trade.id?.toString() || '',
      timestamp: new Date(trade.timestamp || trade.created_at),
      symbol: this.normalizeSymbol(trade.symbol || trade.pair),
      side: (trade.side || '').toLowerCase(),
      quantity: parseFloat(trade.quantity || trade.amount || 0),
      price: parseFloat(trade.price || 0),
      fee: parseFloat(trade.fee || 0),
      feeCurrency: trade.fee_currency || trade.feeCurrency || 'USD',
      type: 'trade',
    };
  }

  /**
   * Normalize symbol from Revolut X format to internal format
   * Example: 'BTC-USD' -> 'BTCUSD'
   */
  private normalizeSymbol(symbol: string): string {
    return symbol.replace('-', '').replace('/', '').toUpperCase();
  }
}
