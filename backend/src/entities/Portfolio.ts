import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './User';
import { Trade } from './Trade';
import { Transfer } from './Transfer';
import { ClosedPosition } from './ClosedPosition';

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

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  totalInvested!: number;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  currentValue!: number;

  @Column({ 
    type: 'decimal', 
    precision: 20, 
    scale: 8, 
    default: 0,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value)
    }
  })
  profitLoss!: number;

  @OneToMany(() => Trade, trade => trade.portfolio)
  trades!: Trade[];

  @OneToMany(() => Transfer, transfer => transfer.portfolio)
  transfers!: Transfer[];

  @OneToMany(() => ClosedPosition, closedPosition => closedPosition.portfolio)
  closedPositions!: ClosedPosition[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
