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
 * - Signature must be base64 encoded
 */
export class RevolutXService {
  private client: AxiosInstance;
  private apiKey: string;
  private privateKey: Uint8Array;

  constructor(apiKey: string, privateKeyInput: string, baseURL: string = 'https://api.revolut.com') {
    this.apiKey = apiKey;
    this.privateKey = this.parsePrivateKey(privateKeyInput);
    
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });
    
    console.log(`RevolutXService initialized with baseURL: ${baseURL}`);
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
   */
  private parsePrivateKey(input: string): Uint8Array {
    input = input.trim();

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

    throw new Error('Invalid private key format.');
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
   * Generate Ed25519 signature for API request
   */
  private generateSignature(
    timestamp: string,
    method: string,
    path: string,
    queryString: string = '',
    body: string = ''
  ): string {
    const message = timestamp + method.toUpperCase() + path + queryString + body;
    console.log(`[RevolutX] Signature message: ${message.substring(0, 100)}...`);
    
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.privateKey);
    const signatureBase64 = this.uint8ArrayToBase64(signature);
    
    console.log(`[RevolutX] Signature (first 20 chars): ${signatureBase64.substring(0, 20)}...`);
    return signatureBase64;
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
    
    const queryString = queryParams
      ? Object.entries(queryParams)
          .map(([key, value]) => `${key}=${value}`)
          .join('&')
      : '';
    
    const body = data ? JSON.stringify(data) : '';
    const signature = this.generateSignature(timestamp, method, path, queryString, body);

    const headers = {
      'X-Revx-API-Key': this.apiKey,
      'X-Revx-Timestamp': timestamp,
      'X-Revx-Signature': signature,
      'Content-Type': 'application/json',
    };

    const fullUrl = queryString ? `${path}?${queryString}` : path;
    console.log(`[RevolutX] ${method} ${fullUrl}`);
    console.log(`[RevolutX] API Key: ${this.apiKey.substring(0, 10)}...`);

    try {
      const response = await this.client.request({
        method,
        url: path,
        params: queryParams,
        headers,
        data,
      });
      console.log(`[RevolutX] Response status: ${response.status}`);
      return response.data;
    } catch (error: any) {
      console.error(`[RevolutX] Error response:`, error.response?.status, error.response?.data);
      if (error.response) {
        throw new Error(
          `Revolut X API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`
        );
      }
      throw error;
    }
  }

  /**
   * Test API connection by trying multiple possible endpoints
   */
  async testConnection(): Promise<boolean> {
    const endpoints = [
      '/api/1.0/crypto-exchange/balances',
      '/api/1.0/balances',
      '/crypto-exchange/balances',
      '/1.0/crypto-exchange/balances',
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`[RevolutX] Testing endpoint: ${endpoint}`);
        await this.makeAuthenticatedRequest('GET', endpoint);
        console.log(`[RevolutX] Success with endpoint: ${endpoint}`);
        return true;
      } catch (error: any) {
        console.log(`[RevolutX] Failed with endpoint ${endpoint}: ${error.message}`);
      }
    }

    console.error('[RevolutX] All endpoints failed');
    return false;
  }

  async getAccountBalances(): Promise<any[]> {
    try {
      const data = await this.makeAuthenticatedRequest('GET', '/api/1.0/crypto-exchange/balances');
      return data.filter((balance: any) => parseFloat(balance.total || 0) > 0);
    } catch (error) {
      throw new Error(`Failed to fetch Revolut X balances: ${error}`);
    }
  }

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

  private normalizeSymbol(symbol: string): string {
    return symbol.replace('-', '').replace('/', '').toUpperCase();
  }
}
