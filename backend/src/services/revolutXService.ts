import axios, { AxiosInstance } from 'axios';
import * as nacl from 'tweetnacl';
import { decrypt } from '../utils/encryption';
import { ExchangeApiKey } from '../entities/ExchangeApiKey';

/**
 * RevolutXService - Handles Revolut X API authentication and data fetching
 * 
 * Correct configuration:
 * - Base URL: https://revx.revolut.com
 * - Signature format: timestamp + METHOD + path
 * - Headers: X-Revx-API-Key, X-Revx-Timestamp, X-Revx-Signature (base64)
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
   * Generate Ed25519 signature
   * Format: timestamp + METHOD + path
   */
  private generateSignature(
    timestamp: string,
    method: string,
    path: string
  ): string {
    const message = timestamp + method.toUpperCase() + path;
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, this.privateKey);
    return this.uint8ArrayToBase64(signature);
  }

  private async makeAuthenticatedRequest(
    method: 'GET' | 'POST',
    path: string,
    queryParams?: Record<string, any>,
    data?: any
  ): Promise<any> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, path);

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
      // Filter balances with total > 0
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
        '/api/1.0/fills',
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
      externalId: trade.id?.toString() || trade.fill_id?.toString() || '',
      timestamp: new Date(trade.timestamp || trade.created_at || trade.time),
      symbol: this.normalizeSymbol(trade.symbol || trade.pair || trade.instrument),
      side: (trade.side || '').toLowerCase(),
      quantity: parseFloat(trade.quantity || trade.amount || trade.size || 0),
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
