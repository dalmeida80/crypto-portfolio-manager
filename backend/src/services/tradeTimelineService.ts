import { Trade } from '../entities/Trade';
import { Transfer } from '../entities/Transfer';
import { ClosedPosition } from '../entities/ClosedPosition';
import { AppDataSource } from '../index';

type EventType = 'BUY' | 'SELL' | 'DEPOSIT' | 'WITHDRAWAL';

interface AssetEvent {
  type: EventType;
  quantity: number;
  price?: number; // for trades
  fee?: number; // trading fee in quote currency
  knownCostUsd?: number; // optional, for deposits with known cost
  timestamp: Date;
  tradeId?: string;
  transferId?: string;
}

interface PositionState {
  symbol: string;
  totalQuantity: number;
  totalCost: number;
  realizedProfitLoss: number;
  unrealizedProfitLoss: number;
  currentPrice?: number;
}

interface ClosedPositionData {
  symbol: string;
  totalBought: number;
  totalSold: number;
  averageBuyPrice: number;
  averageSellPrice: number;
  totalInvested: number;
  totalReceived: number;
  realizedProfitLoss: number;
  realizedProfitLossPercentage: number;
  openedAt: Date;
  closedAt: Date;
  numberOfTrades: number;
}

export class TradeTimelineService {
  /**
   * Process all events (trades + transfers) for a single asset
   * Returns final position state with realized and unrealized P/L
   */
  processAssetTimeline(
    events: AssetEvent[],
    currentPrice?: number
  ): PositionState {
    // Sort events by timestamp
    const sortedEvents = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    const state: PositionState = {
      symbol: '',
      totalQuantity: 0,
      totalCost: 0,
      realizedProfitLoss: 0,
      unrealizedProfitLoss: 0,
      currentPrice,
    };

    for (const event of sortedEvents) {
      this.processEvent(state, event);
    }

    // Calculate unrealized P/L if we have current price and open position
    if (state.totalQuantity > 0 && currentPrice) {
      const currentValue = state.totalQuantity * currentPrice;
      state.unrealizedProfitLoss = currentValue - state.totalCost;
    }

    return state;
  }

  /**
   * Process a single event and update position state
   */
  private processEvent(state: PositionState, event: AssetEvent): void {
    switch (event.type) {
      case 'BUY':
        this.processBuy(state, event);
        break;
      case 'SELL':
        this.processSell(state, event);
        break;
      case 'DEPOSIT':
        this.processDeposit(state, event);
        break;
      case 'WITHDRAWAL':
        this.processWithdrawal(state, event);
        break;
    }
  }

  /**
   * Process BUY trade: increase position and cost
   */
  private processBuy(state: PositionState, event: AssetEvent): void {
    const tradeCost = (event.price ?? 0) * event.quantity + (event.fee ?? 0);
    state.totalQuantity += event.quantity;
    state.totalCost += tradeCost;
  }

  /**
   * Process SELL trade: reduce position, calculate realized P/L
   */
  private processSell(state: PositionState, event: AssetEvent): void {
    const averagePrice =
      state.totalQuantity > 0 ? state.totalCost / state.totalQuantity : 0;

    const proceeds = (event.price ?? 0) * event.quantity - (event.fee ?? 0);
    const costBasis = averagePrice * event.quantity;
    const realized = proceeds - costBasis;

    state.realizedProfitLoss += realized;
    state.totalQuantity -= event.quantity;
    state.totalCost -= costBasis;

    // Handle dust/rounding: if quantity becomes very small, set to 0
    if (state.totalQuantity < 0.00000001) {
      state.totalQuantity = 0;
      state.totalCost = 0;
    }
  }

  /**
   * Process DEPOSIT: increase quantity, optionally add cost
   */
  private processDeposit(state: PositionState, event: AssetEvent): void {
    state.totalQuantity += event.quantity;

    // If deposit has known cost, add it to total cost
    if (event.knownCostUsd && event.knownCostUsd > 0) {
      state.totalCost += event.knownCostUsd;
    }
    // Otherwise, treat as cost 0 (lowers average cost)
  }

  /**
   * Process WITHDRAWAL: reduce quantity and cost proportionally
   * Does not generate realized P/L (just moving funds out)
   */
  private processWithdrawal(state: PositionState, event: AssetEvent): void {
    if (state.totalQuantity <= 0) {
      console.warn('Withdrawal with no position available');
      return;
    }

    const averagePrice = state.totalCost / state.totalQuantity;
    const withdrawCost = averagePrice * event.quantity;

    state.totalQuantity -= event.quantity;
    state.totalCost -= withdrawCost;

    // Handle dust/rounding
    if (state.totalQuantity < 0.00000001) {
      state.totalQuantity = 0;
      state.totalCost = 0;
    }
  }

  /**
   * Convert trades and transfers into unified event list for a symbol
   */
  buildAssetEvents(trades: Trade[], transfers: Transfer[]): AssetEvent[] {
    const events: AssetEvent[] = [];

    // Add trades
    for (const trade of trades) {
      events.push({
        type: trade.type as 'BUY' | 'SELL',
        quantity: trade.quantity,
        price: trade.price,
        fee: trade.fee || 0,
        timestamp: new Date(trade.executedAt),
        tradeId: trade.id,
      });
    }

    // Add transfers
    for (const transfer of transfers) {
      events.push({
        type: transfer.type as 'DEPOSIT' | 'WITHDRAWAL',
        quantity: transfer.amount,
        fee: transfer.fee || 0,
        knownCostUsd: 0, // TODO: add field to Transfer entity if needed
        timestamp: new Date(transfer.executedAt),
        transferId: transfer.id,
      });
    }

    return events;
  }

  /**
   * Detect closed positions from event timeline
   * A position is considered closed when totalQuantity reaches 0 after a SELL
   */
  async detectClosedPositions(
    portfolioId: string,
    symbol: string,
    events: AssetEvent[]
  ): Promise<ClosedPositionData[]> {
    const closedPositions: ClosedPositionData[] = [];
    const sortedEvents = [...events].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Track lot state
    let lotQuantity = 0;
    let lotCost = 0;
    let lotBought = 0;
    let lotSold = 0;
    let lotReceived = 0;
    let lotFirstBuyDate: Date | null = null;
    let lotLastSellDate: Date | null = null;
    let lotTradeCount = 0;

    for (const event of sortedEvents) {
      if (event.type === 'BUY') {
        const tradeCost = (event.price ?? 0) * event.quantity + (event.fee ?? 0);
        lotQuantity += event.quantity;
        lotCost += tradeCost;
        lotBought += event.quantity;
        lotTradeCount++;

        if (!lotFirstBuyDate) {
          lotFirstBuyDate = event.timestamp;
        }
      } else if (event.type === 'SELL') {
        const averagePrice = lotQuantity > 0 ? lotCost / lotQuantity : 0;
        const proceeds = (event.price ?? 0) * event.quantity - (event.fee ?? 0);
        const costBasis = averagePrice * event.quantity;

        lotQuantity -= event.quantity;
        lotCost -= costBasis;
        lotSold += event.quantity;
        lotReceived += proceeds;
        lotLastSellDate = event.timestamp;
        lotTradeCount++;

        // Position closed: quantity is 0 or very small
        if (lotQuantity < 0.00000001 && lotBought > 0) {
          const totalInvested = lotCost + costBasis; // Recalculate from original buys
          const realizedPL = lotReceived - totalInvested;
          const realizedPLPercent =
            totalInvested > 0 ? (realizedPL / totalInvested) * 100 : 0;

          const avgBuyPrice = lotBought > 0 ? totalInvested / lotBought : 0;
          const avgSellPrice = lotSold > 0 ? lotReceived / lotSold : 0;

          closedPositions.push({
            symbol,
            totalBought: lotBought,
            totalSold: lotSold,
            averageBuyPrice: avgBuyPrice,
            averageSellPrice: avgSellPrice,
            totalInvested,
            totalReceived: lotReceived,
            realizedProfitLoss: realizedPL,
            realizedProfitLossPercentage: realizedPLPercent,
            openedAt: lotFirstBuyDate || event.timestamp,
            closedAt: lotLastSellDate || event.timestamp,
            numberOfTrades: lotTradeCount,
          });

          // Reset lot
          lotQuantity = 0;
          lotCost = 0;
          lotBought = 0;
          lotSold = 0;
          lotReceived = 0;
          lotFirstBuyDate = null;
          lotLastSellDate = null;
          lotTradeCount = 0;
        }
      } else if (event.type === 'DEPOSIT') {
        lotQuantity += event.quantity;
        if (event.knownCostUsd && event.knownCostUsd > 0) {
          lotCost += event.knownCostUsd;
        }
        if (!lotFirstBuyDate) {
          lotFirstBuyDate = event.timestamp;
        }
      } else if (event.type === 'WITHDRAWAL') {
        const averagePrice = lotQuantity > 0 ? lotCost / lotQuantity : 0;
        const withdrawCost = averagePrice * event.quantity;
        lotQuantity -= event.quantity;
        lotCost -= withdrawCost;

        if (lotQuantity < 0.00000001) {
          lotQuantity = 0;
          lotCost = 0;
        }
      }
    }

    return closedPositions;
  }

  /**
   * Save closed positions to database
   * Removes old closed positions for this portfolio/symbol and creates new ones
   */
  async saveClosedPositions(
    portfolioId: string,
    symbol: string,
    closedPositions: ClosedPositionData[]
  ): Promise<void> {
    const closedPositionRepo = AppDataSource.getRepository(ClosedPosition);

    // Delete existing closed positions for this symbol
    await closedPositionRepo.delete({ portfolioId, symbol });

    // Create new closed positions
    for (const data of closedPositions) {
      const closedPosition = closedPositionRepo.create({
        portfolioId,
        ...data,
      });
      await closedPositionRepo.save(closedPosition);
    }

    console.log(
      `Saved ${closedPositions.length} closed position(s) for ${symbol} in portfolio ${portfolioId}`
    );
  }
}
