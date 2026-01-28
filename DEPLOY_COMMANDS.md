# 🚀 Deploy Commands - Trading212 API Integration

## ✅ Status: Implementação Completa

Todos os ficheiros foram criados/atualizados no GitHub:
- ✅ Backend Service (`trading212ApiService.ts`)
- ✅ Backend Controller (`trading212Controller.ts`)
- ✅ Backend Routes (`portfolioRoutes.ts`)
- ✅ Backend Environment (`.env.example`)
- ✅ Frontend API (`api.ts`)
- ✅ Frontend UI (`PortfolioDetail.tsx`)
- ✅ Documentação completa

---

## 💻 Comandos para Deploy no Servidor OCI

### Passo 1: SSH no Servidor

```bash
ssh opc@seu-servidor.com
```

### Passo 2: Navegar e Atualizar Código

```bash
cd ~/workspace/crypto-portfolio-manager
git pull origin main
```

### Passo 3: Configurar Environment Variable

```bash
# Editar ficheiro .env
nano backend/.env
```

**Adicionar esta linha:**
```bash
TRADING212_ENV=demo
```

**Nota:** Começar com `demo` para testes. Mudar para `live` depois de validar.

**Guardar e sair:** `Ctrl+O`, `Enter`, `Ctrl+X`

### Passo 4: Rebuild e Restart Containers

```bash
# Parar containers
docker compose down

# Rebuild com novas alterações
docker compose up -d --build
```

### Passo 5: Verificar Logs

```bash
# Ver logs do backend em tempo real
docker logs crypto-backend -f
```

**Procurar por:**
- Erros de importação de módulos
- "Server started" ou similar
- Mensagens de erro relacionadas com Trading212

**Para sair dos logs:** `Ctrl+C`

---

## 🔑 Configurar API Keys Trading212

### Gerar API Key

1. **Demo Account:**
   - Aceder: [https://demo.trading212.com](https://demo.trading212.com)
   - Login → Settings → API (Beta) → Generate API Key

2. **Live Account:**
   - Aceder: [https://www.trading212.com/en/login](https://www.trading212.com/en/login)
   - Login → Settings → API (Beta) → Generate API Key

3. **Copiar:**
   - API Key
   - API Secret

### Adicionar via UI (Recomendado)

1. Abrir aplicação web
2. Login com a tua conta
3. Settings → API Keys
4. Add New API Key:
   - **Exchange:** trading212
   - **API Key:** (colar)
   - **API Secret:** (colar)
   - **Label:** Trading212 Demo (ou Live)

---

## 🧪 Testes Pós-Deploy

### Teste 1: Verificar Backend Online

```bash
curl http://localhost:4000/health
```

**Esperado:** Status 200 ou resposta com "ok"/"healthy"

### Teste 2: Sync Holdings via API

**Obter JWT Token primeiro via UI:**
1. Login na aplicação web
2. Abrir DevTools (F12) → Console
3. Executar: `localStorage.getItem('accessToken')`
4. Copiar token

**Depois executar:**

```bash
# Substituir valores:
# {PORTFOLIO_ID} - ID do portfolio Trading212
# {JWT_TOKEN} - Token copiado acima

curl -X POST http://localhost:4000/api/portfolios/{PORTFOLIO_ID}/trading212/sync-holdings \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json"
```

**Esperado:**
```json
{
  "success": true,
  "holdings": [...],
  "cash": {...},
  "summary": {...}
}
```

### Teste 3: Import Orders

```bash
curl -X POST http://localhost:4000/api/portfolios/{PORTFOLIO_ID}/trading212/sync-orders \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Esperado:**
```json
{
  "success": true,
  "imported": 45,
  "summary": {...}
}
```

### Teste 4: Verificar Trades na Database

```bash
# Conectar ao PostgreSQL
docker exec -it crypto-db psql -U crypto_user -d crypto_portfolio
```

**Query:**
```sql
SELECT 
  symbol, 
  type, 
  quantity, 
  price, 
  source, 
  "executedAt" 
FROM trades 
WHERE source = 'trading212-api' 
ORDER BY "executedAt" DESC 
LIMIT 10;
```

**Validar:**
- Símbolos sem sufixo (ex: `AAPL` não `AAPL_US_EQ`)
- Source = `trading212-api`
- Prices em EUR

**Sair do PostgreSQL:**
```sql
\q
```

---

## 🐛 Troubleshooting Rápido

### Erro: "Module not found" nos logs

```bash
# Reinstalar dependências e rebuild
cd ~/workspace/crypto-portfolio-manager
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Erro: "No active Trading212 API key found"

1. Verificar se API key existe:
   ```bash
   docker exec -it crypto-db psql -U crypto_user -d crypto_portfolio
   ```
   ```sql
   SELECT id, exchange, "isActive", "createdAt" 
   FROM exchange_api_keys 
   WHERE exchange = 'trading212';
   ```

2. Se não existir, adicionar via UI (ver secção acima)

### Erro: "Rate limit exceeded"

- Esperar 1 minuto
- Trading212 tem limite de 50 requests/minuto
- O service já tem delay automático de 1.2s entre requests

### Backend não inicia

```bash
# Ver logs completos
docker logs crypto-backend --tail 100

# Se necessário, rebuild completo
docker compose down -v
docker compose up -d --build
```

---

## 🔄 Mudar de Demo para Live

### Quando estiver pronto para usar conta real:

1. **Editar .env:**
   ```bash
   nano backend/.env
   ```
   
   Mudar:
   ```bash
   TRADING212_ENV=live
   ```

2. **Restart containers:**
   ```bash
   docker compose restart crypto-backend
   ```

3. **Adicionar nova API key Live:**
   - Gerar key na conta Live
   - Adicionar via UI com label "Trading212 Live"

4. **Testar sync:**
   - Usar UI para clicar "🔄 Sync Holdings"
   - Verificar dados corretos

---

## 📊 Monitorização

### Logs em Tempo Real

```bash
# Backend
docker logs crypto-backend -f

# Database
docker logs crypto-db -f

# Todos os containers
docker compose logs -f
```

### Status dos Containers

```bash
docker compose ps
```

**Esperado:** Todos com status "Up"

### Uso de Recursos

```bash
docker stats
```

---

## ✅ Checklist Final

```markdown
☐ Código atualizado no servidor (git pull)
☐ TRADING212_ENV adicionado ao backend/.env
☐ Containers rebuilded (docker compose up -d --build)
☐ Logs verificados sem erros
☐ API key Trading212 adicionada via UI
☐ Sync Holdings testado com sucesso
☐ Import Orders testado com sucesso
☐ Trades verificados na database
☐ UI funcional (botões visíveis e a funcionar)
☐ Rate limits respeitados (sem erros 429)
☐ Documentado no README principal (opcional)
```

---

## 📞 Suporte

- **Documentação:** [TRADING212_API_SETUP.md](./TRADING212_API_SETUP.md)
- **Trading212 API Docs:** [https://docs.trading212.com/api](https://docs.trading212.com/api)
- **GitHub Repo:** [https://github.com/dalmeida80/crypto-portfolio-manager](https://github.com/dalmeida80/crypto-portfolio-manager)

---

**Última atualização:** 28 Jan 2026  
**Commit:** [5e13ce47](https://github.com/dalmeida80/crypto-portfolio-manager/commit/5e13ce47ee1a4f8ab567f0da4d8e9e5b6f46b849)
