import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from './entities/User';
import authRoutes from './routes/authRoutes';

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
  entities: [User],
});

AppDataSource.initialize()
  .then(() => {
    console.log('Database connected');

    // Health check
    app.get('/api/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Auth routes
    app.use('/api/auth', authRoutes);

    const port = process.env.PORT || 4000;
    app.listen(port, () => {
      console.log(`Backend running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error('Database connection error:', error);
  });
