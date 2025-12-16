# Revolut X Integration - Technical Documentation

## Overview

This document describes the Revolut X integration implementation in the Crypto Portfolio Manager application. The integration includes trade import, fee calculation, P&L tracking, and portfolio management features.

## Features Implemented

### ✅ Phase 1: Fee Calculation

**Status:** Complete

**Implementation:**
- Automatic fee calculation based on Revolut X fee schedule (0% maker, 0.09% taker)
- Fees calculated as: `fee = quantity * price * 0.0009`
- Fee currency automatically detected from symbol (EUR for XXX/EUR pairs)
- Fees included in trade cost basis calculations

**Files Modified:**
- `backend/src/services/revolutXService.ts`
  - Added `TAKER_FEE_RATE` constant (0.0009)
  - Added `calculateEstimatedFee()` method
  - Added `getQuoteCurrency()` method
  - Updated `convertToInternalFormat()` to calculate fees

**Limitations:**
- Revolut X API does not expose per-trade fees in historical orders endpoint
- Fees are estimated using public fee schedule (may not reflect actual fees for special accounts)
- All trades assumed to be taker orders (conservative estimate)

---

### ✅ Phase 2: Robust P&L Calculation

**Status:** Complete

**Implementation:**
- Timeline-based P&L calculation using `TradeTimelineService`
- Weighted average cost basis tracking
- Separate realized and unrealized P&L
- Comprehensive edge case handling

**Key Calculations:**
```typescript
// BUY trade
total_cost = (price * quantity) + fee

// SELL trade
proceeds = (price * quantity) - fee
realized_pl = proceeds - cost_basis

// Unrealized P&L
unrealized_pl = (current_price * quantity) - total_invested

// Total P&L
total_pl = unrealized_pl + realized_pl
```

**Edge Cases Handled:**

1. **SELL without prior BUY** (deposited assets):
   - No P&L calculated (cost basis unknown)
   - Creates temporary negative position
   - Corrected by subsequent BUY/DEPOSIT
   - Warning logged: `[Timeline] SELL without open position`

2. **DEPOSIT without cost basis**:
   - Increases quantity only
   - Lowers average cost (assumes cost = 0)
   - Use `Transfer.knownCostUsd` for accurate P&L when available

3. **WITHDRAWAL**:
   - Reduces quantity and cost proportionally
   - Does NOT generate realized P&L
   - Just moves funds out of portfolio

4. **Dust amounts** (< 0.00000001):
   - Treated as zero
   - Position considered closed

**Files Modified:**
- `backend/src/services/tradeTimelineService.ts`
  - Added comprehensive JSDoc documentation
  - Improved logging with `[Timeline]` prefix
  - Documented all edge cases

- `backend/src/services/portfolioUpdateService.ts`
  - Added class-level documentation
  - Added total fees tracking in logs
  - Improved logging with `[Portfolio Update]` prefix

---

### ✅ Phase 3: Trade History Pagination

**Status:** Complete

**Implementation:**
- Backend pagination support in trade listing endpoint
- Query parameters: `page`, `pageSize`, `source`, `symbol`
- Pagination metadata in response

**API Endpoint:**
```
GET /api/portfolios/:portfolioId/trades?page=1&pageSize=50
```

**Query Parameters:**
- `page`: Page number (default: 1, min: 1)
- `pageSize`: Items per page (default: 50, min: 1, max: 100)
- `source`: Filter by source (optional: 'binance', 'revolutx', 'manual')
- `symbol`: Filter by symbol (optional, case-insensitive)

**Response Format:**
```json
{
  "data": [
    {
      "id": "uuid",
      "symbol": "DOGEEUR",
      "type": "BUY",
      "quantity": 100.5,
      "price": 0.1112,
      "fee": 0.01,
      "total": 11.18,
      "executedAt": "2024-12-16T10:30:00Z",
      "source": "revolutx"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 247,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Files Modified:**
- `backend/src/controllers/tradeController.ts`
  - Updated `listTrades()` with pagination logic
  - Added filters for source and symbol
  - Added pagination metadata to response

**Frontend Integration (TODO):**
- Add pagination controls (Previous/Next buttons)
- Add page number display
- Add page size selector (25/50/100)
- Add source/symbol filters

---

### ✅ Phase 4: Deposits & Withdrawals

**Status:** Documented (API limitation)

**Findings:**
- Revolut X API does **NOT** expose deposit/withdrawal endpoints as of December 2024
- Only trading operations (orders, fills, balances) available via API
- Fiat deposits/withdrawals between Revolut app and Revolut X are internal transfers

**Current Solution:**
- Manual transfer entry via UI ("Add Transfer" button)
- Transfer types: DEPOSIT, WITHDRAWAL
- Supports both fiat (EUR) and crypto

**Files Modified:**
- `backend/src/services/revolutXService.ts`
  - Added documentation note about API limitation
  - Explained manual transfer workaround

**Future Enhancement:**
- If Revolut X adds deposit/withdrawal API endpoints, implement automatic import
- Similar to Binance integration (`getDepositHistory`, `getWithdrawHistory`)

---

### ✅ Phase 5: EUR Currency Support

**Status:** Complete

**Implementation:**
- EUR price conversion using EUR/USDT rate from Binance
- New methods in `PriceService` for EUR support
- Cached EUR rate with 30-second refresh

**New Methods:**
```typescript
// Get prices in EUR (converts from USDT)
await priceService.getPricesInEur(['BTCUSDT', 'DOGEEUR']);

// Convert specific USDT amount to EUR
await priceService.convertUsdtToEur(100.50);

// Get current EUR/USDT rate
const rate = priceService.getEurRate();
```

**How It Works:**
1. Fetch prices in USDT from Binance (most liquid market)
2. Fetch EUR/USDT conversion rate
3. Convert: `eur_price = usdt_price / eur_usdt_rate`
4. Cache both USDT prices and EUR rate for 30 seconds

**Example:**
```typescript
// BTC price: $73,000 USDT
// EUR/USDT rate: 1.08
// BTC price in EUR: 73000 / 1.08 = €67,592.59
```

**Files Modified:**
- `backend/src/services/priceService.ts`
  - Added `eurUsdtRate` property
  - Added `updateEurRate()` method
  - Added `getPricesInEur()` method
  - Added `convertUsdtToEur()` method
  - Added `getEurRate()` method
  - Updated documentation

**Portfolio Display:**
- Revolut X portfolios show prices in EUR automatically
- Symbol format: XXX/EUR (e.g., DOGE/EUR, BTC/EUR)
- All calculations (invested, current value, P&L) in EUR

---

## Data Flow

### Trade Import Process

```
1. User clicks "Import Trades" for Revolut X portfolio
   ↓
2. TradeImportService.importFromAllSources()
   ↓
3. RevolutXService.getTradeHistory()
   - Fetches from newest to oldest in 6-day chunks
   - Handles pagination with cursor
   - Stops after 60 days of no activity
   ↓
4. For each order with filled_quantity > 0:
   - RevolutXService.convertToInternalFormat()
   - Calculates estimated fee (0.09%)
   - Normalizes symbol (DOGE-EUR → DOGEEUR)
   ↓
5. TradeImportService saves to database
   - Checks for duplicates by externalId
   - Creates Trade entity with source='revolutx'
   ↓
6. PortfolioUpdateService.updatePortfolio()
   - Fetches current prices
   - Calculates holdings using TradeTimelineService
   - Updates portfolio totals
```

### P&L Calculation Process

```
1. PortfolioUpdateService.updatePortfolio(portfolioId)
   ↓
2. Fetch all trades and transfers for portfolio
   ↓
3. Group by symbol (e.g., DOGEEUR, BTCEUR)
   ↓
4. For each symbol:
   - TradeTimelineService.buildAssetEvents()
   - Combines trades + transfers
   - Sorts by timestamp
   ↓
5. TradeTimelineService.processAssetTimeline()
   - Process each event chronologically
   - BUY: add to position, increase cost
   - SELL: reduce position, calculate realized P&L
   - DEPOSIT: increase quantity
   - WITHDRAWAL: reduce quantity proportionally
   ↓
6. Calculate totals:
   - Total Invested = sum of all holding costs
   - Current Value = sum of (quantity * current_price)
   - Unrealized P&L = Current Value - Total Invested
   - Realized P&L = sum from closed positions
   - Total P&L = Unrealized + Realized
   ↓
7. Save to Portfolio entity
```

---

## Database Schema

### Trade Entity

```typescript
{
  id: string;              // UUID
  portfolioId: string;     // Foreign key to Portfolio
  symbol: string;          // Normalized symbol (DOGEEUR)
  type: 'BUY' | 'SELL';   // Trade side
  quantity: number;        // Amount of base asset
  price: number;           // Price in quote currency
  fee: number;             // Trading fee (quote currency)
  total: number;           // quantity * price
  executedAt: Date;        // Trade execution time
  externalId: string;      // 'revolutx-{order_id}'
  source: string;          // 'revolutx', 'binance', 'manual'
  notes: string;           // Optional notes
  createdAt: Date;         // Record creation time
}
```

### Transfer Entity

```typescript
{
  id: string;              // UUID
  portfolioId: string;     // Foreign key to Portfolio
  type: 'DEPOSIT' | 'WITHDRAWAL';
  asset: string;           // Asset symbol (DOGE, BTC, EUR)
  amount: number;          // Transfer amount
  fee: number;             // Transfer fee (if any)
  executedAt: Date;        // Transfer execution time
  txId: string;            // Transaction ID (for blockchain)
  network: string;         // Network (e.g., ERC20, BEP20)
  source: string;          // 'revolutx', 'binance', 'manual'
  externalId: string;      // External reference
  notes: string;           // Optional notes
  createdAt: Date;         // Record creation time
}
```

---

## Configuration

### Revolut X API Keys

**Setup:**
1. Log in to Revolut X web app
2. Navigate to Settings → API Keys
3. Generate new API key
4. Copy API Key and Private Key
5. Add to Crypto Portfolio Manager:
   - Go to Settings → Exchange API Keys
   - Select "Revolut X"
   - Paste API Key
   - Paste Private Key (supports PEM, hex, or base64 format)
   - Test connection

**Security:**
- API keys stored encrypted in database
- Private keys never logged or exposed
- Read-only permissions recommended

---

## Testing

### Manual Test Checklist

**Trade Import:**
- [ ] Import trades from Revolut X
- [ ] Verify no duplicates on re-import
- [ ] Check fees are calculated (should be ~0.09% of trade value)
- [ ] Verify symbols normalized correctly (DOGE-EUR → DOGEEUR)
- [ ] Check executedAt timestamps are correct

**P&L Calculation:**
- [ ] Verify AVG PRICE matches expected weighted average
- [ ] Check INVESTED includes buy costs + fees
- [ ] Verify CURRENT VALUE uses latest prices
- [ ] Check PROFIT/LOSS = unrealized + realized
- [ ] Test with mix of BUY and SELL trades
- [ ] Test with deposits/withdrawals

**Pagination:**
- [ ] Test page navigation (next/previous)
- [ ] Verify page size limits (1-100)
- [ ] Test source filter (revolutx only)
- [ ] Test symbol filter (case-insensitive)
- [ ] Check pagination metadata accuracy

**EUR Display:**
- [ ] Verify prices shown in EUR for Revolut X
- [ ] Check EUR/USDT conversion is applied
- [ ] Verify totals match EUR calculations

**Edge Cases:**
- [ ] SELL without prior BUY (should log warning, no P&L)
- [ ] DEPOSIT without cost basis (quantity increases, AVG drops)
- [ ] WITHDRAWAL (quantity decreases, no P&L impact)
- [ ] Dust amounts (< 0.00000001 treated as zero)

---

## Troubleshooting

### Common Issues

**Issue:** No trades imported
**Possible Causes:**
- API key permissions (must have read access to orders)
- Date range too old (API limited to certain lookback period)
- No filled orders in timeframe
**Solution:** Check logs for API errors, verify API key in Revolut X settings

**Issue:** Incorrect fees
**Possible Causes:**
- User has special fee tier (API doesn't expose actual fees)
- Maker orders charged as taker (we assume all taker)
**Solution:** Fees are estimated, actual fees may vary. Consider manual adjustment.

**Issue:** Wrong P&L calculations
**Possible Causes:**
- Deposits without cost basis
- Sells before buys in import history
- Missing historical data
**Solution:** Check logs for `[Timeline]` warnings, add manual transfers for deposits

**Issue:** Prices not in EUR
**Possible Causes:**
- EUR/USDT rate not fetched
- Price service cache issue
**Solution:** Check logs for price service errors, clear cache if needed

---

## Performance Considerations

### API Rate Limits

**Revolut X:**
- Unknown official rate limits
- Implemented 500ms delay between chunk fetches
- Max 20 pages per 6-day chunk (safety limit)

**Binance (Price Service):**
- No authentication required for price endpoints
- High rate limits for public endpoints
- 30-second cache reduces API calls

### Database Queries

**Optimizations:**
- Trade queries use indexes on: `portfolioId`, `executedAt`, `source`, `symbol`
- Pagination uses `skip`/`take` (efficient for large datasets)
- Portfolio updates batch-process all symbols

**Recommendations:**
- Add database index on `trades.portfolioId` + `trades.executedAt`
- Add database index on `trades.source` for filtered queries
- Consider caching portfolio calculations (refresh on demand)

---

## Future Enhancements

### Short Term
- [ ] Frontend pagination UI (Phase 3 completion)
- [ ] Export trades to CSV
- [ ] Manual fee adjustment per trade
- [ ] Tax report generation

### Medium Term
- [ ] Automatic deposit/withdrawal import (if API available)
- [ ] Real-time price updates via WebSocket
- [ ] Portfolio comparison (Binance vs Revolut X)
- [ ] Advanced filtering (date range, profit/loss)

### Long Term
- [ ] Multi-currency support (USD, GBP)
- [ ] Tax optimization suggestions
- [ ] Automated trading via API
- [ ] Mobile app

---

## Support

For issues or questions:
1. Check logs: `docker logs crypto-backend --tail 200 -f`
2. Review this documentation
3. Check GitHub issues
4. Contact maintainer

## References

- [Revolut X API Documentation](https://developer.revolut.com/docs/x-api/revolut-x-crypto-exchange-rest-api)
- [Revolut X Fees](https://www.revolut.com/en-PT/legal/crypto-exchange-fees/)
- [Binance API Documentation](https://binance-docs.github.io/apidocs/spot/en/)
