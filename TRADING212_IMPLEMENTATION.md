# Implementação Trading212 + Rebranding

## Visão Geral

Esta branch contém a implementação completa da feature Trading212 e rebranding para "Personal Portfolio Manager".

## Ficheiros Criados

### Backend
- `backend/src/entities/Trading212Transaction.ts` - Entidade TypeORM
- `backend/src/services/Trading212ImportService.ts` - Service para import CSV e cálculos
- `backend/src/controllers/trading212Controller.ts` - Controller com endpoints
- `backend/src/routes/trading212Routes.ts` - Rotas Express

### Frontend  
- `frontend/src/pages/trading212/Account.tsx` - Página React completa

## Passos de Implementação

### 1. Instalar Dependências Backend

```bash
cd backend
npm install csv-parse multer @types/multer
```

### 2. Registar Entidade no TypeORM

Editar `backend/src/config/database.ts` ou onde as entidades são registadas:

```typescript
import { Trading212Transaction } from '../entities/Trading212Transaction';

// Adicionar Trading212Transaction ao array de entities
entities: [
  User,
  Portfolio,
  Trade,
  Transfer,
  ClosedPosition,
  ExchangeApiKey,
  Trading212Transaction  // <-- ADICIONAR
]
```

### 3. Criar e Executar Migration

```bash
cd backend
npm run typeorm migration:generate -- -n CreateTrading212Transaction
npm run typeorm migration:run
```

### 4. Registar Rotas Backend

Editar `backend/src/index.ts` (ou ficheiro principal de rotas):

```typescript
import trading212Routes from './routes/trading212Routes';

// Adicionar com as outras rotas
app.use('/api/portfolios', trading212Routes);
```

### 5. Adicionar Rota Frontend

Editar `frontend/src/App.tsx` ou ficheiro de rotas:

```typescript
import Trading212Account from './pages/trading212/Account';

// Adicionar rota
<Route path="/portfolios/:id/trading212" element={<Trading212Account />} />
```

### 6. Actualizar PortfolioDetail

Editar `frontend/src/pages/PortfolioDetail.tsx` para adicionar botão:

```typescript
{portfolio.exchange === 'trading212' && (
  <button
    onClick={() => navigate(`/portfolios/${id}/trading212`)}
    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
  >
    📊 View Trading212 Account
  </button>
)}
```

### 7. Actualizar Portfolio Creation

Permitir criar portfolio com `exchange: 'trading212'` no formulário de criação.

### 8. Rebranding (Opcional)

#### Frontend
```bash
# Search and replace
find frontend/src -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's/Crypto Portfolio Manager/Personal Portfolio Manager/g' {} +
```

Editar manualmente:
- `frontend/index.html` - title e meta tags
- Componentes de layout (Navbar, Header)

#### Backend
- `backend/package.json` - name e description
- `README.md` - actualizar documentação

## Comandos de Deploy

```bash
# No servidor OCI
cd ~/crypto-portfolio-manager

# Fazer pull da branch
git fetch origin
git checkout feature/trading212-implementation
git pull origin feature/trading212-implementation

# Instalar dependências
cd backend && npm install && cd ..

# Rebuild e restart
docker compose build --no-cache
docker compose up -d

# Ver logs
docker compose logs -f backend
```

## Endpoints API

### POST `/api/portfolios/:portfolioId/trading212/import`
- Body: `multipart/form-data` com ficheiro CSV
- Headers: `Authorization: Bearer <token>`
- Response: `{ imported, updated, duplicates, errors }`

### GET `/api/portfolios/:portfolioId/trading212/summary`
- Headers: `Authorization: Bearer <token>`  
- Response: `{ totalDeposits, netDeposits, interestOnCash, cashback, currentBalance, ... }`

### GET `/api/portfolios/:portfolioId/trading212/transactions?limit=50&offset=0`
- Headers: `Authorization: Bearer <token>`
- Response: `{ transactions: [], total: number }`

## Testing

1. Criar portfolio com `exchange: 'trading212'`
2. Navegar para `/portfolios/:id/trading212`
3. Upload CSV da Trading212
4. Verificar summary e lista de transações

## Troubleshooting

### Migration Error
Se houver erro na migration:
```bash
cd backend
npm run typeorm migration:revert
npm run typeorm migration:run
```

### CSV Import Error
Verificar que o CSV tem as colunas corretas:
- Action, Time, ISIN, Ticker, Name, ID
- No. of shares, Price / share, Total, etc.

### Frontend Build Error
```bash
cd frontend
npm install
npm run build
```

## Próximos Passos

1. **Fix Foreign Key Constraints**: Adicionar `onDelete: CASCADE` em Trade, Transfer, ClosedPosition
2. **Holdings Calculation**: Calcular posições actuais a partir de buy/sell transactions
3. **Market Prices**: Integrar API para preços actuais de ETFs/ações
4. **Dashboard Cards**: Adicionar cartões Trading212 no dashboard principal

## Referências

- TypeORM Relations: https://typeorm.io/relations
- csv-parse: https://csv.js.org/parse/
- Multer: https://github.com/expressjs/multer
