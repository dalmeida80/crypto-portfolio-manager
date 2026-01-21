import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';
import { Portfolio } from './Portfolio';

@Entity('trading212_transactions')
@Index(['portfolioId', 'externalId'], { unique: true })
export class Trading212Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Portfolio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'portfolioId' })
  portfolio!: Portfolio;

  @Column()
  portfolioId!: string;

  @Column()
  action!: string;

  @Column({ type: 'timestamptz' })
  @Index()
  time!: Date;

  @Column({ nullable: true })
  isin?: string;

  @Column({ nullable: true })
  ticker?: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ nullable: true })
  externalId?: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    nullable: true, 
    transformer: { 
      to: (v) => v, 
      from: (v) => v ? parseFloat(v) : null 
    } 
  })
  shares?: number;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    nullable: true, 
    transformer: { 
      to: (v) => v, 
      from: (v) => v ? parseFloat(v) : null 
    } 
  })
  pricePerShare?: number;

  @Column({ length: 10, nullable: true })
  priceCurrency?: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    nullable: true, 
    transformer: { 
      to: (v) => v, 
      from: (v) => v ? parseFloat(v) : null 
    } 
  })
  exchangeRate?: number;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    nullable: true, 
    transformer: { 
      to: (v) => v, 
      from: (v) => v ? parseFloat(v) : null 
    } 
  })
  resultAmount?: number;

  @Column({ length: 10, nullable: true })
  resultCurrency?: string;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    nullable: true, 
    transformer: { 
      to: (v) => v, 
      from: (v) => v ? parseFloat(v) : null 
    } 
  })
  totalAmount?: number;

  @Column({ length: 10, nullable: true })
  totalCurrency?: string;

  @Column({ nullable: true })
  merchantName?: string;

  @Column({ nullable: true })
  merchantCategory?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
