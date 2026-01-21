# Personal Portfolio Manager

Aplicação web completa para gestão de portfólios financeiros, suportando criptomoedas (Binance, Revolut X) e ações/ETFs (Trading212).

## Funcionalidades

- **Multi-Exchange Support**: Binance, Revolut X, Trading212
- **Portfolio Tracking**: Monitorização de P/L, holdings, e histórico de trades
- **CSV Import**: Importação de histórico de transações Trading212
- **Live Trading**: Interface para trading em Revolut X
- **Análise de Dados**: Dashboards com estatísticas e gráficos
- **Segurança**: Encriptação AES-256-GCM para API keys

## Stack Técnica

### Backend
- Node.js + TypeScript
- Express.js
- PostgreSQL + TypeORM
- JWT Authentication
- Docker

### Frontend
- React + TypeScript
- Tailwind CSS
- React Router
- Recharts

## Quick Start

### Pré-requisitos
- Docker e Docker Compose
- Git

### Deploy

```bash
# Clone o repositório
git clone https://github.com/dalmeida80/crypto-portfolio-manager.git
cd crypto-portfolio-manager

# Configurar variáveis de ambiente
cp backend/.env.example backend/.env
# Editar backend/.env com as suas credenciais

# Build e iniciar containers
docker compose build --no-cache
docker compose up -d

# Ver logs
docker compose logs -f
```

A aplicação estará disponível em `http://localhost` (frontend) e `http://localhost:4000` (backend API).

## Estrutura do Projeto

```
.
├── backend/          # API Node.js + TypeScript
│   ├── src/
│   │   ├── entities/     # TypeORM entities
│   │   ├── controllers/  # Route controllers
│   │   ├── services/     # Business logic
│   │   ├── routes/       # API routes
│   │   └── middleware/   # Auth & validation
│   └── Dockerfile
├── frontend/         # React + TypeScript
│   ├── src/
│   │   ├── pages/        # Page components
│   │   ├── components/   # Reusable components
│   │   ├── contexts/     # React contexts
│   │   └── services/     # API client
│   └── Dockerfile
├── nginx/            # Reverse proxy config
└── docker-compose.yml
```

## Funcionalidades por Exchange

### Binance
- Sincronização automática de trades
- Cálculo de P/L
- Importação de histórico

### Revolut X
- Trading interface com ordens limit
- Visualização de ordens abertas
- Balances simplificados

### Trading212
- **Importação CSV**: Upload de histórico completo de transações
- **Análise Financeira**: Deposits, withdrawals, interest, cashback
- **Histórico de Transações**: Visualização detalhada de todas as operações

## Desenvolvimento

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Próximos Passos

- [ ] Implementar integração real Revolut X (Ed25519 signing)
- [ ] Calcular holdings Trading212 a partir de transações
- [ ] Adicionar suporte para mais exchanges
- [ ] Notificações por email
- [ ] Mobile app

## Licença

This project is under active development.

## Autor

[Daniel Almeida](https://github.com/dalmeida80)
