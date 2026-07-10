/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Token {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  isCustom?: boolean;
  contractAddress?: string;
  decimals: number;
}

export interface Position {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  leverage: number;
  size: number; // size in Token
  margin: number; // in KAS
  entryPrice: number;
  liquidationPrice: number;
  currentPrice: number;
  pnl: number; // in KAS
  pnlPercentage: number;
  feePaid: number; // in KAS
  timestamp: number;
}

export interface LiquidityPool {
  totalKAS: number;
  developerContribution: number;
  lockedKAS: number;
  lockExpiryDays: number; // starts at 100
  accumulatedFees: number;
  isUnlocked: boolean;
}

export interface OrderBookItem {
  price: number;
  amount: number;
  total: number;
}

export interface AutomatedStrategy {
  id: string;
  symbol: string;
  type: 'TAKE_PROFIT' | 'STOP_LOSS' | 'GRID';
  triggerPrice: number;
  actionPercent: number; // e.g. 100 for entire position
  isActive: boolean;
  status: 'PENDING' | 'TRIGGERED' | 'CANCELLED';
}

export interface TradeHistoryItem {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT' | 'SYSTEM' | 'POOL';
  action: 'OPEN' | 'CLOSE' | 'LIQUIDATION' | 'LOCK' | 'WITHDRAW' | 'DEPOSIT';
  leverage: number;
  size: number;
  price: number;
  pnl: number;
  fee: number;
  timestamp: number;
  txId?: string;
  fromAddress?: string;
  toAddress?: string;
  blueScore?: number;
  isSimulatedInitial?: boolean;
}
