# Revolut X API Integration - Deployment Guide

## ✅ What Was Implemented

The Revolut X trading API is now **fully integrated** and **ready to use**:

- ✅ **Ed25519 authentication** with proper signature generation
- ✅ **Place limit orders** (BUY/SELL) via REST API
- ✅ **List open orders** in real-time
- ✅ **Cancel orders** by ID
- ✅ **Encrypted API key storage** (AES-256-GCM)
- ✅ **Error handling** with detailed API responses

---

## 🚀 Deploy to Production Server (OCI)

### Step 1: SSH to Server

```bash
ssh your-user@danielapp.duckdns.org
```

**What it does:** Connects to your OCI server.

---

### Step 2: Navigate to Project Directory

```bash
cd /path/to/crypto-portfolio-manager
```

**What it does:** Goes to where your app is installed.

---

### Step 3: Pull Latest Code from GitHub

```bash
git pull origin main
```

**What it does:** Downloads the new Revolut X integration code.

---

### Step 4: Rebuild Docker Containers

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

**What it does:**
- Stops running containers
- Rebuilds images with new code (no cache = fresh build)
- Starts containers in background

---

### Step 5: Check Logs (Optional)

```bash
docker compose logs -f crypto-backend
```

**What it does:** Shows live backend logs. Press `Ctrl+C` to exit.

---

## 🔑 Using the API (Frontend Already Configured)

Your frontend (`Trade.tsx`) is already set up to call the real API. No changes needed!

### What Happens Now:

1. **User clicks "🚀 Trade"** on Revolut X portfolio
2. **Frontend sends order to backend**: `POST /api/portfolios/:id/orders/limit`
3. **Backend:**
   - Loads encrypted API key from database
   - Generates Ed25519 signature
   - Calls Revolut X API: `https://revx.revolut.com/api/1.0/orders`
4. **Real order is placed** on Revolut X exchange
5. **Order appears in "📊 Ordens Abertas" tab** (fetched from real API every 10 seconds)

---

## 📋 Testing the Integration

### Test 1: Check API Connection

After deployment, try placing a **small test order** via the UI:

1. Go to: `https://danielapp.duckdns.org`
2. Login → Portfolio "Revolut X" → "🚀 Trade"
3. Select pair: **DOGE-EUR**
4. Side: **Buy**
5. Amount: **10** (small amount for testing)
6. Price: **0.30** (below market for safety)
7. Click **"Comprar DOGE-EUR"**

Expected result: ✅ **"Ordem Criada!"** message with real order ID.

---

### Test 2: View Open Orders

Click the **"📊 Ordens Abertas"** tab.

**Expected result:** Your test order appears with status "open".

---

### Test 3: Cancel Order

Click **"❌"** button next to your test order.

**Expected result:** Order disappears from list (cancelled via API).

---

## 🛠️ Troubleshooting

### Error: "Revolut X API key not configured"

**Fix:**
1. Go to **Settings** → **Add Exchange API Key**
2. Exchange: **Revolut X**
3. Paste your **API Key** (public key from Revolut X)
4. Paste your **Private Key** (PEM format)
5. Save

---

### Error: "Revolut X API error: 401"

**Possible causes:**
- Wrong private key format
- API key not registered in Revolut X app
- Public key in Revolut X doesn't match your private key

**Fix:**
1. Go to Revolut X web app → API settings
2. Check your public key is registered
3. Regenerate keys if needed (use OpenSSL as per Revolut X docs)

---

### Check Backend Logs

```bash
docker compose logs -f crypto-backend
```

Look for lines starting with `[Revolut X]` for detailed API activity.

---

## 📚 API Endpoints Reference

### Place Limit Order

```bash
POST /api/portfolios/:portfolioId/orders/limit
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN

{
  "pair": "DOGE-EUR",
  "side": "buy",
  "amount": "100",
  "price": "0.35"
}
```

---

### List Open Orders

```bash
GET /api/portfolios/:portfolioId/orders
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### Cancel Order

```bash
DELETE /api/portfolios/:portfolioId/orders/:orderId
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🔐 Security Notes

- ✅ **Private keys are encrypted** in database (AES-256-GCM)
- ✅ **JWT authentication** required for all endpoints
- ✅ **User isolation**: Users can only access their own portfolios
- ⚠️ **Use read-only keys for testing** (Revolut X "Spot view" permission only)
- ⚠️ **Enable trading permission** only when ready for real trades

---

## 🎯 Next Steps (Optional Enhancements)

1. **Market Orders**: Add support for instant buy/sell at market price
2. **Order Book**: Display real-time bid/ask prices
3. **WebSocket**: Live price updates instead of polling
4. **Stop-Loss/Take-Profit**: Conditional orders
5. **Trade History**: Fetch executed trades from `/api/1.0/fills`

---

## 📞 Support

If you encounter issues:

1. Check backend logs: `docker compose logs crypto-backend`
2. Verify API keys in Settings page
3. Test connection via `/api/1.0/balances` endpoint (returns your balances)

---

**Your Revolut X integration is live! 🎉**
