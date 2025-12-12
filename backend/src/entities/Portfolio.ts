import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './User';
import { Trade } from './Trade';

@Entity('portfolios')
export class Portfolio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalInvested!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  currentValue!: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  profitLoss!: number;

  @OneToMany(() => Trade, trade => trade.portfolio)
  trades!: Trade[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
