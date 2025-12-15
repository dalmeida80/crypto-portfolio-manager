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

@Entity('closed_positions')
export class ClosedPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  portfolioId: string;

  @ManyToOne(() => Portfolio, (portfolio) => portfolio.closedPositions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'portfolioId' })
  portfolio: Portfolio;

  @Column()
  symbol: string; // Original symbol (e.g., CHESSUSDC)

  @Column('decimal', { precision: 20, scale: 8 })
  totalBought: number; // Total quantity bought

  @Column('decimal', { precision: 20, scale: 8 })
  totalSold: number; // Total quantity sold

  @Column('decimal', { precision: 20, scale: 8 })
  averageBuyPrice: number;

  @Column('decimal', { precision: 20, scale: 8 })
  averageSellPrice: number;

  @Column('decimal', { precision: 20, scale: 8 })
  totalInvested: number; // Total money invested (buys + fees)

  @Column('decimal', { precision: 20, scale: 8 })
  totalReceived: number; // Total money received (sells - fees)

  @Column('decimal', { precision: 20, scale: 8 })
  realizedProfitLoss: number; // totalReceived - totalInvested

  @Column('decimal', { precision: 10, scale: 2 })
  realizedProfitLossPercentage: number;

  @Column({ type: 'timestamp' })
  openedAt: Date; // First buy date

  @Column({ type: 'timestamp' })
  closedAt: Date; // Last sell date

  @Column({ type: 'integer' })
  numberOfTrades: number; // Total trades for this position

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
