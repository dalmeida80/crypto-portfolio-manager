# Real-Time Price Integration with Binance

## Overview

This feature adds real-time cryptocurrency price tracking and automatic portfolio value calculation using Binance public API.

## New Services

### 1. PriceService (`backend/src/services/priceService.ts`)

**Purpose:** Fetch real-time cryptocurrency prices from Binance

**Features:**
- Singleton pattern for efficient resource usage
- Price caching (30 seconds) to reduce API calls
- Batch price fetching for multiple symbols
- Automatic symbol normalization (BTC → BTCUSDT)
- Fallback to cached prices on API errors

**Usage:**
```typescript
const priceService = PriceService.getInstance();

// Single price
const btcPrice = await priceService.getPrice('BTC');

// Multiple prices (more efficient)
const prices = await priceService.getPrices(['BTC', 'ETH', 'BNB']);
```

### 2. PortfolioUpdateService (`backend/src/services/portfolioUpdateService.ts`)

**Purpose:** Calculate current portfolio values based on holdings and real-time prices

**Features:**
- Calculates current holdings from trade history
- Handles BUY and SELL trades correctly
- Updates `totalInvested`, `currentValue`, and `profitLoss`
- Provides detailed holdings breakdown with P&L per asset

**Methods:**
- `updatePortfolio(portfolioId)` - Update single portfolio
- `updateUserPortfolios(userId)` - Update all user portfolios
- `updateAllPortfolios()` - Update all system portfolios (admin/cron)
- `getPortfolioHoldings(portfolioId)` - Get detailed holdings with current prices

## New API Endpoints

### Public Endpoints (No Authentication)

#### Get Price for Single Symbol
```bash
GET /api/prices/price/:symbol

# Example
curl https://danielapp.duckdns.org/api/prices/price/BTC

# Response
{
  "symbol": "BTC",
  "price": 43250.50,
  "timestamp": "2025-12-12T16:48:00.000Z"
}
```

#### Get Prices for Multiple Symbols
```bash
POST /api/prices/prices
Content-Type: application/json

{
  "symbols": ["BTC", "ETH", "BNB"]
}

# Example with curl
curl -X POST https://danielapp.duckdns.org/api/prices/prices \
  -H "Content-Type: application/json" \
  -d '{"symbols": ["BTC", "ETH", "BNB"]}'

# Response
{
  "prices": {
    "BTCUSDT": 43250.50,
    "ETHUSDT": 2280.30,
    "BNBUSDT": 315.80
  },
  "timestamp": "2025-12-12T16:48:00.000Z"
}
```

#### Get Cache Statistics
```bash
GET /api/prices/cache/stats

# Response
{
  "size": 15,
  "symbols": ["BTCUSDT", "ETHUSDT", "BNBUSDT", ...]
}
```

### Protected Endpoints (Require Authentication)

#### Refresh Single Portfolio
```bash
POST /api/prices/portfolio/:portfolioId/refresh
Authorization: Bearer <your_jwt_token>

# Example
curl -X POST https://danielapp.duckdns.org/api/prices/portfolio/abc-123/refresh \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response: Updated portfolio object
{
  "id": "abc-123",
  "name": "My Portfolio",
  "totalInvested": 10000.00,
  "currentValue": 12500.50,
  "profitLoss": 2500.50,
  ...
}
```

#### Get Detailed Holdings
```bash
GET /api/prices/portfolio/:portfolioId/holdings
Authorization: Bearer <your_jwt_token>

# Response
[
  {
    "symbol": "BTC",
    "quantity": 0.5,
    "averagePrice": 40000.00,
    "currentPrice": 43250.50,
    "totalInvested": 20000.00,
    "currentValue": 21625.25,
    "profitLoss": 1625.25,
    "profitLossPercentage": 8.13
  },
  ...
]
```

#### Refresh All User Portfolios
```bash
POST /api/prices/portfolios/refresh
Authorization: Bearer <your_jwt_token>

# Response
{
  "updated": 3,
  "portfolios": [ ... ]
}
```

#### Clear Price Cache
```bash
POST /api/prices/cache/clear
Authorization: Bearer <your_jwt_token>

# Response
{
  "message": "Cache cleared successfully"
}
```

## How It Works

### Holdings Calculation

1. **Fetch all trades** for a portfolio
2. **Sort by execution date** (oldest first)
3. **Process each trade:**
   - **BUY:** Add to position, update average price
   - **SELL:** Reduce position proportionally
4. **Calculate totals:**
   - `totalInvested` = Sum of all invested amounts
   - `currentValue` = Sum of (quantity × current price)
   - `profitLoss` = currentValue - totalInvested

### Example Calculation

**Trades:**
1. BUY 0.5 BTC @ $40,000 = $20,000
2. BUY 0.3 BTC @ $42,000 = $12,600
3. SELL 0.2 BTC @ $45,000 = $9,000

**Holdings:**
- Quantity: 0.5 + 0.3 - 0.2 = **0.6 BTC**
- Total Invested: $20,000 + $12,600 - (proportion) = **$26,000**
- Average Price: $26,000 / 0.6 = **$43,333**

**Current Value (at $43,250):**
- Current Value: 0.6 × $43,250 = **$25,950**
- Profit/Loss: $25,950 - $26,000 = **-$50**

## Symbol Normalization

The system automatically converts symbols to Binance format:

- `BTC` → `BTCUSDT`
- `ETH` → `ETHUSDT`
- `bitcoin` → `BTCUSDT`
- `ethereum` → `ETHUSDT`
- `BTCUSDT` → `BTCUSDT` (unchanged)

## Performance Optimizations

1. **Price Caching:** Prices cached for 30 seconds
2. **Batch Requests:** Fetch multiple prices in one API call
3. **Singleton Pattern:** Single PriceService instance
4. **Fallback Logic:** Use expired cache on API failures

## Future Enhancements

- [ ] WebSocket integration for real-time updates
- [ ] Support for other quote currencies (EUR, BTC pairs)
- [ ] Historical price data for charts
- [ ] Price alerts/notifications
- [ ] Scheduled automatic updates (cron job)
- [ ] Multi-exchange price aggregation

## Testing

See testing commands in the main repository README.
