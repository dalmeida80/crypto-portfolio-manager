import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Portfolio } from './Portfolio';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  portfolioId: string;

  @ManyToOne(() => Portfolio, (portfolio) => portfolio.transfers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'portfolioId' })
  portfolio: Portfolio;

  @Column()
  type: 'DEPOSIT' | 'WITHDRAWAL';

  @Column()
  asset: string; // e.g., BTC, ETH, SOL

  @Column('decimal', { precision: 20, scale: 8 })
  amount: number;

  @Column('decimal', { precision: 20, scale: 8, default: 0 })
  fee: number;

  @Column({ type: 'timestamp' })
  executedAt: Date;

  @Column({ nullable: true })
  txId: string; // Transaction ID from blockchain

  @Column({ nullable: true })
  network: string; // e.g., BEP20, ERC20, TRC20

  @Column({ nullable: true })
  source: string; // e.g., binance-deposit, binance-withdrawal

  @Column({ nullable: true })
  externalId: string; // Unique ID from exchange

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
