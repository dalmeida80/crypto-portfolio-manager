import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Portfolio } from './Portfolio';

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  portfolioId!: string;

  @ManyToOne(() => Portfolio, portfolio => portfolio.trades)
  @JoinColumn({ name: 'portfolioId' })
  portfolio!: Portfolio;

  @Column()
  symbol!: string;

  @Column()
  type!: 'BUY' | 'SELL';

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  quantity!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  price!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  fee!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  total!: number;

  @Column({ type: 'timestamp' })
  executedAt!: Date;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ default: 'binance' })
  source!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
