# Trading212 API Integration - Setup Guide

## 🎯 Overview

Esta integração permite sync automático de dados da Trading212 via API oficial, eliminando a necessidade de importação manual de CSV.

## ✅ Implementação Completa

### Backend
- ✅ `backend/src/services/trading212ApiService.ts` - API client com paginação automática
- ✅ `backend/src/controllers/trading212Controller.ts` - Endpoints sync (holdings, orders, transactions)
- ✅ `backend/src/routes/portfolioRoutes.ts` - Rotas configuradas
- ✅ `backend/.env.example` - Variável TRADING212_ENV adicionada

### Frontend
- ✅ `frontend/src/services/api.ts` - Métodos TypeScript para sync

### Pendente
- ⚠️ UI com botões de sync em `PortfolioDetail.tsx` (precisa implementação manual)

---

## 🚀 Deploy e Configuração

### 1. Atualizar Código no Servidor

```bash
# SSH no servidor OCI
ssh opc@seu-servidor.com

# Navegar para o projeto
cd ~/workspace/crypto-portfolio-manager

# Pull latest code
git pull origin main
```

### 2. Configurar Environment Variable

```bash
# Editar .env
nano backend/.env

# Adicionar esta linha (ou editar se já existe):
TRADING212_ENV=demo  # Use 'demo' para testes, 'live' para produção
```

**Atenção:** Começar com `demo` e mudar para `live` depois de validar.

### 3. Rebuild e Restart Containers

```bash
# Parar containers
docker compose down

# Rebuild e iniciar
docker compose up -d --build

# Ver logs do backend
docker logs crypto-backend -f
```

### 4. Verificar Logs de Startup

```bash
# Procurar por erros de import
docker logs crypto-backend -f | grep -i trading212

# Verificar se o service foi carregado
docker logs crypto-backend | grep -i "trading212ApiService"
```

---

## 🔑 Configurar API Keys

### Gerar API Key na Trading212

1. Abrir [Trading212 Demo](https://demo.trading212.com) ou [Trading212 Live](https://www.trading212.com)
2. Login → Settings → API (Beta)
3. Clicar "Generate API Key"
4. Copiar **API Key** e **API Secret**

### Adicionar no Sistema

**Opção 1: Via UI (recomendado)**
1. Login na aplicação web
2. Settings → API Keys
3. Add New API Key:
   - Exchange: `trading212`
   - API Key: `cole aqui`
   - API Secret: `cole aqui`
   - Label: `Trading212 Main Account`

**Opção 2: Via API (cURL)**
```bash
curl -X POST http://localhost:4000/api/exchange/api-keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "trading212",
    "apiKey": "YOUR_API_KEY",
    "apiSecret": "YOUR_API_SECRET",
    "label": "Trading212 Demo"
  }'
```

---

## 🧪 Testing

### Teste 1: Sync Holdings

```bash
# Substituir {portfolioId} e {JWT_TOKEN}
curl -X POST http://localhost:4000/api/portfolios/{portfolioId}/trading212/sync-holdings \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Resposta esperada:**
```json
{
  "success": true,
  "holdings": [
    {
      "ticker": "AAPL_US_EQ",
      "symbol": "AAPL",
      "quantity": 10,
      "averagePrice": 150.25,
      "currentPrice": 175.50,
      "totalValue": 1755.00,
      "ppl": 252.50
    }
  ],
  "cash": {
    "free": 1500.00,
    "total": 3000.00,
    "invested": 1500.00,
    "result": 252.50
  },
  "summary": {
    "totalHoldings": 5,
    "totalValue": 5000.00,
    "freeCash": 1500.00
  }
}
```

### Teste 2: Import Orders

```bash
curl -X POST http://localhost:4000/api/portfolios/{portfolioId}/trading212/sync-orders \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Resposta esperada:**
```json
{
  "success": true,
  "imported": 45,
  "updated": 0,
  "skipped": 0,
  "summary": {
    "totalOrders": 50,
    "filledOrders": 45,
    "buyOrders": 30,
    "sellOrders": 15
  }
}
```

### Teste 3: Verificar Rate Limits

```bash
# Monitorar logs durante sync
docker logs crypto-backend -f | grep "Rate Limit"
```

**Esperado:** Mensagens de warning se < 10 requests restantes.

### Teste 4: Validar Dados na DB

```bash
# Conectar ao PostgreSQL
docker exec -it crypto-db psql -U crypto_user -d crypto_portfolio

# Query trades importados
SELECT 
  symbol, 
  type, 
  quantity, 
  price, 
  total, 
  source, 
  "executedAt" 
FROM trades 
WHERE source = 'trading212-api' 
ORDER BY "executedAt" DESC 
LIMIT 10;
```

**Validar:**
- Símbolos sem sufixo `_US_EQ` (ex: `AAPL` não `AAPL_US_EQ`)
- Prices em EUR
- Source = `trading212-api`

---

## 🐛 Troubleshooting

### Erro: "No active Trading212 API key found"

**Solução:**
1. Verificar se API key existe:
   ```sql
   SELECT * FROM exchange_api_keys WHERE exchange = 'trading212';
   ```
2. Confirmar `isActive = true`
3. Adicionar nova key via UI ou API

### Erro: "Rate limit exceeded"

**Solução:**
- Esperar 1 minuto antes de tentar novamente
- Trading212 tem limite de **50 requests/minuto**
- O service já inclui delay de 1.2s entre requests

### Erro: "Failed to connect to Trading212 API"

**Causas possíveis:**
1. API key inválida ou expirada
2. Environment errado (`demo` vs `live`)
3. Credenciais erradas

**Solução:**
```bash
# Testar conexão manual
API_KEY="your_key"
API_SECRET="your_secret"
CREDENTIALS=$(echo -n "$API_KEY:$API_SECRET" | base64)

curl -X GET "https://demo.trading212.com/api/v0/equity/account/cash" \
  -H "Authorization: Basic $CREDENTIALS"
```

### Símbolos com sufixo `_US_EQ` na DB

**Problema:** Normalização não está a funcionar.

**Solução:**
```sql
-- Limpar trades incorretos
DELETE FROM trades WHERE symbol LIKE '%_US_EQ' OR symbol LIKE '%_UK_EQ';

-- Reimportar via API
```

---

## 📊 Diferenças vs Binance

| Feature | Binance | Trading212 |
|---------|---------|------------|
| **Moeda Base** | USD/USDT | EUR |
| **Fees** | 0.1% | €0 (zero) |
| **Rate Limit** | 1200/min | 50/min |
| **Paginação** | Offset | Cursor |
| **Order Types (Live)** | Todos | Apenas Market |
| **Ticker Format** | `BTCUSDT` | `AAPL_US_EQ` |

---

## 📚 Endpoints Disponíveis

### API Sync (Novo)
```
POST /api/portfolios/{id}/trading212/sync-holdings
POST /api/portfolios/{id}/trading212/sync-orders
POST /api/portfolios/{id}/trading212/sync-transactions
```

### CSV Import (Fallback)
```
POST /api/portfolios/{id}/trading212/import-csv
GET  /api/portfolios/{id}/trading212/summary
GET  /api/portfolios/{id}/trading212/transactions
GET  /api/portfolios/{id}/trading212/holdings
GET  /api/portfolios/{id}/trading212/totals
```

---

## 🔗 Referências

- [Trading212 API Docs](https://docs.trading212.com/api)
- [Gerar API Keys](https://www.trading212.com/en/login) → Settings → API
- [Repositório GitHub](https://github.com/dalmeida80/crypto-portfolio-manager)

---

## ✅ Próximos Passos

1. ✅ Backend implementado
2. ✅ Rotas configuradas
3. ✅ Frontend API service pronto
4. ⚠️ **Implementar UI em `PortfolioDetail.tsx`** (ver exemplo no commit message)
5. 🔴 Testar com Demo account
6. 🔴 Validar dados na DB
7. 🔴 Mudar `TRADING212_ENV=live` em produção

---

## 📝 Notas Importantes

1. **Sempre testar com Demo account primeiro**
2. Rate limits são por conta, não por API key
3. Live account apenas suporta Market orders
4. Moeda primária deve ser EUR
5. Multi-currency não é suportado pela API
6. CSV import continua disponível como fallback

---

**Criado em:** 28 Jan 2026  
**Último commit:** [c63e3db](https://github.com/dalmeida80/crypto-portfolio-manager/commit/c63e3db3a810cf9b0294cadf117cd323459dc99c)
