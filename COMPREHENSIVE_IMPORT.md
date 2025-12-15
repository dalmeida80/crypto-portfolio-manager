# Comprehensive Binance Import

## 🎯 What Changed

### **Before:**
- ❌ Had to manually add each trading pair
- ❌ Only checked USDT pairs
- ❌ Missed pairs like SAGAUSDC, BTCUSDC, etc.
- ❌ No support for deposits/withdrawals

### **Now:**
- ✅ **Automatically discovers ALL trading pairs** from your account
- ✅ **Checks ALL quote currencies**: USDT, USDC, BUSD, BTC, ETH, BNB, FDUSD, TUSD
- ✅ **Imports deposits** (treated as BUY at price 0)
- ✅ **Imports withdrawals** (treated as SELL at price 0)
- ✅ **Comprehensive logging** to see exactly what's being imported

---

## 🚀 How It Works

### 1. **Discovery Phase**
The system:
1. Gets your account info from Binance
2. Identifies all assets you have/had (e.g., BTC, ETH, SAGA, SOL)
3. Generates all possible trading pairs for each asset:
   - SAGAUSDT, SAGAUSDC, SAGABUSD, SAGABTC, etc.
   - BTCUSDT, BTCUSDC, BTCBUSD, etc.
4. Checks each pair for trades

### 2. **Trade Fetching**
- Fetches up to **1000 trades per symbol** (Binance limit)
- Logs which symbols have trades
- Aggregates all trades together

### 3. **Deposits & Withdrawals**
- Fetches deposit history (successful only)
- Fetches withdrawal history (completed only)
- Converts them to trades:
  - **Deposit**: BUY trade at price 0 (you acquired the asset)
  - **Withdrawal**: SELL trade at price 0 (you removed the asset)

### 4. **Deduplication**
- Each item has unique `externalId`:
  - Trades: `binance-{trade_id}`
  - Deposits: `binance-deposit-{txId}`
  - Withdrawals: `binance-withdrawal-{id}`
- Skips items already in database

### 5. **Portfolio Update**
- Automatically recalculates holdings
- Updates portfolio values with current prices

---

## 📊 Data Mapping

### Regular Trades
```
Binance API          →  Database
-----------------       ----------
id                   →  externalId: binance-{id}
symbol (SAGAUSDC)    →  symbol: SAGAUSDC
isBuyer=true         →  type: BUY
isBuyer=false        →  type: SELL
qty                  →  quantity
price                →  price
commission           →  fee
quoteQty             →  total
time                 →  executedAt
                        source: binance
```

### Deposits
```
Binance Deposit      →  Database
-----------------       ----------
txId                 →  externalId: binance-deposit-{txId}
coin (BTC)           →  symbol: BTCUSDT
amount               →  quantity
                        type: BUY
                        price: 0
                        fee: 0
insertTime           →  executedAt
                        source: binance-deposit
                        notes: "Deposit: BTC"
```

### Withdrawals
```
Binance Withdrawal   →  Database
-----------------       ----------
id                   →  externalId: binance-withdrawal-{id}
coin (ETH)           →  symbol: ETHUSDT
amount               →  quantity
                        type: SELL
                        price: 0
transactionFee       →  fee
completeTime         →  executedAt
                        source: binance-withdrawal
                        notes: "Withdrawal: ETH"
```

---

## 🛠️ Usage

### Deploy the update
```bash
cd ~/workspace/crypto-portfolio-manager
git pull origin main
docker compose build backend
docker compose up -d

# Wait for backend to start
sleep 10
```

### Import everything from Dec 1, 2025
```bash
# Login first
TOKEN=$(curl -s -X POST https://danielapp.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "your-email", "password": "your-password"}' \
  | jq -r '.accessToken')

# Import ALL (trades + deposits + withdrawals)
curl -X POST "https://danielapp.duckdns.org/api/exchange/portfolios/YOUR_PORTFOLIO_ID/import-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-12-01T00:00:00.000Z"}'
```

### Expected Response
```json
{
  "success": true,
  "imported": 156,
  "skipped": 1,
  "errors": 0,
  "deposits": 3,
  "withdrawals": 1,
  "message": "Successfully imported 156 items (152 trades, 3 deposits, 1 withdrawals). 1 already existed."
}
```

---

## 🔍 Viewing Logs

To see exactly what's being imported:

```bash
# See comprehensive logs
docker compose logs backend --tail=200 | grep -i "fetching\|found\|checking\|deposit\|withdrawal"

# Example output:
Fetching all trading symbols from Binance...
Found 45 assets in account
Checking 225 potential trading pairs...
✓ BTCUSDT: 23 trades
✓ ETHUSDT: 15 trades
✓ SAGAUSDC: 8 trades
✓ SOLUSDC: 12 trades
  ADAUSDT: no trades
Found trades in 18 symbols, total 234 trades
Fetching deposit history...
Found 3 deposits
Fetching withdrawal history...
Found 1 withdrawals
Import complete:
  - Trades: 234
  - Deposits: 3
  - Withdrawals: 1
  - Total imported: 238
  - Skipped (duplicates): 56
```

---

## 📝 Verify Import

### Check database
```bash
DB_USER=$(grep DB_USER backend/.env | cut -d '=' -f2 | tr -d '\r')

docker compose exec db psql -U $DB_USER -d crypto_portfolio -c "
SELECT 
  source,
  COUNT(*) as count,
  MIN(\"executedAt\") as oldest,
  MAX(\"executedAt\") as newest
FROM trades
GROUP BY source
ORDER BY source;
"
```

### Expected output:
```
      source       | count |         oldest          |         newest
-------------------+-------+-------------------------+-------------------------
 binance           |   234 | 2025-12-01 08:15:23     | 2025-12-15 10:30:45
 binance-deposit   |     3 | 2025-12-05 14:20:11     | 2025-12-10 09:15:33
 binance-withdrawal|     1 | 2025-12-08 16:45:22     | 2025-12-08 16:45:22
```

### Check specific symbols
```bash
docker compose exec db psql -U $DB_USER -d crypto_portfolio -c "
SELECT 
  symbol,
  type,
  quantity,
  price,
  source,
  \"executedAt\"
FROM trades
WHERE symbol LIKE '%SAGA%'
ORDER BY \"executedAt\" DESC
LIMIT 10;
"
```

---

## ⚠️ Important Notes

### Deposits & Withdrawals Handling

**Why price = 0?**
- Deposits don't have a "purchase price"
- They represent asset transfers, not purchases
- When calculating P/L, these are handled specially

**Portfolio Calculations:**
- Holdings calculation considers all BUY/SELL types
- Deposits increase quantity
- Withdrawals decrease quantity
- Average price calculated only from actual trades (price > 0)

### Rate Limits

- Binance API has rate limits
- The import checks many symbols sequentially
- May take 1-2 minutes for complete import
- If you hit rate limit, wait and try again

### Missing Trades?

If trades are still missing:

1. **Check the logs** to see which symbols were checked
2. **Verify the trading pair** exists on Binance
3. **Check the date** - make sure startDate is correct
4. **API key permissions** - ensure "Read" is enabled

---

## 🔧 Troubleshooting

### "No trades imported"
```bash
# Check logs for errors
docker compose logs backend --tail=100 | grep -i "error\|failed"

# Verify API key works
curl "https://danielapp.duckdns.org/api/exchange/api-keys" \
  -H "Authorization: Bearer $TOKEN"
```

### "Missing specific symbol"
```bash
# Check if symbol was checked
docker compose logs backend | grep -i "SAGA"

# Manually verify on Binance
# Go to Binance > Orders > Trade History
# Check exact symbol name (e.g., SAGAUSDC vs SAGAUSDT)
```

### "Deposits not showing"
```bash
# Check if deposits were fetched
docker compose logs backend | grep -i "deposit"

# Query database
docker compose exec db psql -U $DB_USER -d crypto_portfolio -c "
SELECT * FROM trades WHERE source = 'binance-deposit';
"
```

---

## 🎯 Next Steps

1. **Deploy** the updated code
2. **Reset** portfolio (delete old data)
3. **Import** everything from Dec 1, 2025
4. **Verify** in the UI that all assets show correctly
5. **Refresh prices** to get current values

---

## 💼 Example Complete Workflow

```bash
#!/bin/bash

echo "=== COMPLETE IMPORT WORKFLOW ==="
cd ~/workspace/crypto-portfolio-manager

# 1. Deploy
echo "Step 1: Deploying updates..."
git pull origin main
docker compose build backend
docker compose up -d
sleep 15

# 2. Login
echo "Step 2: Login..."
TOKEN=$(curl -s -X POST https://danielapp.duckdns.org/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "daniel.mcp@gmail.com", "password": "Teste12345"}' \
  | jq -r '.accessToken')

echo "Token: ${TOKEN:0:50}..."

# 3. Import
echo "Step 3: Importing all data from Dec 1, 2025..."
curl -s -X POST "https://danielapp.duckdns.org/api/exchange/portfolios/8615cf5e-58df-4143-8689-ffe684e3bec5/import-all" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-12-01T00:00:00.000Z"}' | jq .

# 4. Refresh prices
echo "Step 4: Refreshing portfolio prices..."
curl -s -X POST "https://danielapp.duckdns.org/api/prices/portfolio/8615cf5e-58df-4143-8689-ffe684e3bec5/refresh" \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Status
echo "Step 5: Import status..."
curl -s "https://danielapp.duckdns.org/api/exchange/portfolios/8615cf5e-58df-4143-8689-ffe684e3bec5/import-status" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo ""
echo "=== COMPLETE ==="
echo "View your portfolio: https://danielapp.duckdns.org/portfolios/8615cf5e-58df-4143-8689-ffe684e3bec5"
```

---

**Status**: ✅ Ready to deploy and test
