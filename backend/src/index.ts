import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import { ExchangeApiKey } from './entities/ExchangeApiKey';
import { Portfolio } from './entities/Portfolio';
import { Trade } from './entities/Trade';
import { Transfer } from './entities/Transfer';
import authRoutes from './routes/authRoutes';
import exchangeRoutes from './routes/exchangeRoutes';
import portfolioRoutes from './routes/portfolioRoutes';
import priceRoutes from './routes/priceRoutes';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(helmet());

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: true,
  logging: false,
  entities: [User, ExchangeApiKey, Portfolio, Trade, Transfer],
});

AppDataSource.initialize()
  .then(() => {
    console.log('Database connected');

    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    app.use('/api/auth', authRoutes);
    app.use('/api/exchange', exchangeRoutes);
    app.use('/api/portfolios', portfolioRoutes);
    app.use('/api/prices', priceRoutes);

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Backend running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Database connection error:', error);
  });
