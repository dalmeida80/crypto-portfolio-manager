# 🚀 Revolut X Trade Page - Guia de Configuração

## 📋 Visão Geral
Página protegida para criar **Buy/Sell Limit Orders** na Revolut X, associada a portfolios específicos do utilizador autenticado.

## 🏗️ Estrutura Criada

```
crypto-portfolio-manager/
├── frontend/src/pages/revolutx/
│   └── Trade.tsx                          ← Página de trading
├── backend/src/controllers/
│   └── revolutXController.ts              ← Controller para orders
└── backend/src/routes/
    └── portfolioRoutes.ts                 ← Rota: POST /:id/orders/limit
```

## 🔐 Requisitos de Base de Dados

### Adicionar Campo `revolutXApiKey` à Tabela Portfolio

Executa esta migration no PostgreSQL:

```sql
-- Add Revolut X API key field to portfolios table
ALTER TABLE portfolios 
ADD COLUMN revolut_x_api_key VARCHAR(255) DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX idx_portfolios_revolut_x_key 
ON portfolios(revolut_x_api_key) 
WHERE revolut_x_api_key IS NOT NULL;
```

### Atualizar Entity Portfolio

Edita `backend/src/entities/Portfolio.ts` e adiciona:

```typescript
@Column({ type: 'varchar', length: 255, nullable: true })
revolutXApiKey?: string;
```

## 🔑 Configurar API Key da Revolut X

### 1. Obter API Key na Revolut X Web App
1. Acede a [https://app.revolut.com/x](https://app.revolut.com/x)
2. Vai a **Settings** → **API Keys**
3. Cria uma nova key com permissões: **Orders (Read & Write)**
4. Copia a key gerada

### 2. Associar API Key ao Portfolio

**Opção A: Via SQL Direto**
```sql
UPDATE portfolios 
SET revolut_x_api_key = 'sua_api_key_aqui'
WHERE id = PORTFOLIO_ID AND user_id = USER_ID;
```

**Opção B: Via API (recomendado)**
Cria endpoint em `portfolioController.ts`:

```typescript
export const updatePortfolioApiKey = async (req: AuthRequest, res: Response) => {
  const { portfolioId } = req.params;
  const { revolutXApiKey } = req.body;

  const portfolio = await portfolioRepository.findOne({
    where: { id: parseInt(portfolioId), userId: req.user!.userId }
  });

  if (!portfolio) {
    return res.status(404).json({ error: 'Portfolio not found' });
  }

  portfolio.revolutXApiKey = revolutXApiKey;
  await portfolioRepository.save(portfolio);

  res.json({ success: true, message: 'API key updated' });
};
```

E adiciona rota em `portfolioRoutes.ts`:
```typescript
router.patch('/:portfolioId/revolut-key', authenticate, updatePortfolioApiKey);
```

## 🌐 Endpoints Criados

### POST /api/portfolios/:portfolioId/orders/limit

**Headers:**
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer JWT_TOKEN"
}
```

**Body:**
```json
{
  "pair": "DOGE-EUR",
  "side": "buy",
  "amount": "1000",
  "price": "0.35"
}
```

**Response Sucesso (200):**
```json
{
  "success": true,
  "order": {
    "orderId": "12345",
    "status": "pending",
    "pair": "DOGE-EUR",
    "side": "buy",
    "amount": 1000,
    "price": 0.35
  },
  "portfolio": {
    "id": 1,
    "name": "Revolut X Portfolio"
  }
}
```

**Response Erro (400):**
```json
{
  "error": "Revolut X API key not configured for this portfolio"
}
```

## 🎨 Features da Página Frontend

✅ Formulário com dropdown de pares (DOGE-EUR, BTC-EUR, PEPE-EUR, etc)  
✅ Botões Buy/Sell com cores distintas  
✅ Inputs para Amount e Limit Price  
✅ Loading states durante submissão  
✅ Feedback visual de sucesso/erro  
✅ Design moderno com gradientes Tailwind  
✅ Mobile responsive  
✅ Proteção com `useAuth()` (redirect para /login se não autenticado)

## 📱 Como Usar

### 1. Aceder à Página
```
https://teudominio.com/portfolios/PORTFOLIO_ID/trade
```

### 2. Preencher Formulário
- **Par**: Seleciona (ex: DOGE-EUR)
- **Tipo**: Clica em COMPRAR ou VENDER
- **Quantidade**: Insere valor (ex: 1000)
- **Preço Limite**: Insere preço EUR (ex: 0.35)

### 3. Submeter
Clica em **"Colocar Ordem"**

### 4. Ver Resultado
- ✅ **Sucesso**: JSON da ordem criada
- ❌ **Erro**: Mensagem de erro detalhada

## 🚢 Deploy no OCI

```bash
# SSH no servidor
ssh usuario@teudominio.com

# Pull da branch
cd crypto-portfolio-manager
git fetch origin
git checkout feature/revolutx-trade-page
git pull

# Rebuild containers
docker-compose down
docker-compose up -d --build

# Verificar logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

## ✅ Checklist Final

- [ ] Migration executada (campo `revolut_x_api_key` adicionado)
- [ ] Entity Portfolio atualizada com campo `revolutXApiKey`
- [ ] API Key Revolut X obtida na web app
- [ ] API Key associada ao portfolio no DB
- [ ] Branch merged na main
- [ ] Deploy no OCI realizado
- [ ] Testar URL: `/portfolios/ID/trade`

## 🔒 Notas de Segurança

⚠️ **NUNCA** exponhas a API key no frontend  
⚠️ API key armazenada APENAS no backend (PostgreSQL)  
⚠️ Todas as requests passam por autenticação JWT  
⚠️ Controller valida ownership do portfolio antes de usar API key

## 🆘 Troubleshooting

### Erro: "Portfolio or API key not found"
→ Verifica se o portfolio existe e tem `revolut_x_api_key` configurado

### Erro: "Revolut X API error"
→ Verifica se a API key tem permissões corretas na Revolut X

### Página não carrega
→ Verifica se estás autenticado (JWT válido no localStorage)

### Erro 404 na rota
→ Verifica se o backend foi reiniciado após adicionar a rota

---

**Criado em:** 17 Dezembro 2025  
**Branch:** feature/revolutx-trade-page  
**Commits:** 5 ficheiros criados/atualizados
