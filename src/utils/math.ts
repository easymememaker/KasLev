/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Calculates the protocol fee percentage based on the exact leverage tiers requested.
 * Tiers:
 * - Std Leverage (leverage <= 50x) -> 1% (0.01)
 * - High-Risk Leverage (51x to 9,999x) -> 5% (0.05)
 * - Floor Leverage (10,000x) -> 1% (0.01)
 * - Mega Leverage (100,000x) -> 2% (0.02)
 * - Hyper Leverage (1,000,000x or more) -> 5% (0.05)
 */
export function getFeePercentage(leverage: number): number {
  const FLOOR_LEVERAGE = 10000;
  const MEGA_LEVERAGE = 100000;
  const HYPER_LEVERAGE = 1000000;

  if (leverage <= 50) {
    return 1.0; // 1%
  }
  if (leverage < FLOOR_LEVERAGE) {
    return 5.0; // 5%
  }
  if (leverage < MEGA_LEVERAGE) {
    return 1.0; // 1% at Floor (10,000x)
  }
  if (leverage < HYPER_LEVERAGE) {
    return 2.0; // 2% at Mega (100,000x)
  }
  return 5.0; // 5% at Hyper (1,000,000x or more)
}

/**
 * Calculates the liquidation price for LONG or SHORT positions.
 * Formula includes a 0.1% maintenance margin threshold buffer to avoid pool bad-debt.
 */
export function calculateLiquidationPrice(
  type: 'LONG' | 'SHORT',
  entryPrice: number,
  leverage: number
): number {
  if (leverage <= 0) return 0;
  const maintenanceMarginFactor = 0.001; // Liquidation happens slightly before 100% loss
  const marginRatio = (1 / leverage) - maintenanceMarginFactor;

  if (type === 'LONG') {
    return entryPrice * (1 - Math.max(0, marginRatio));
  } else {
    return entryPrice * (1 + Math.max(0, marginRatio));
  }
}

/**
 * Computes the trade size in tokens from collateral, leverage, KAS price, and token price.
 */
export function calculatePositionSize(
  collateral: number,
  leverage: number,
  kasPrice: number,
  tokenPrice: number
): number {
  if (tokenPrice <= 0) return 0;
  const sizeInKAS = collateral * leverage;
  return sizeInKAS * (kasPrice / tokenPrice);
}

/**
 * Computes the real-time profit and loss (PnL) in KAS terms.
 */
export function calculatePnL(
  type: 'LONG' | 'SHORT',
  entryPrice: number,
  currentPrice: number,
  size: number, // In Token units
  kasPrice: number
): { pnlUSD: number; pnlKAS: number; pnlPercentage: number } {
  if (entryPrice <= 0 || kasPrice <= 0) {
    return { pnlUSD: 0, pnlKAS: 0, pnlPercentage: 0 };
  }

  const priceDiff = type === 'LONG' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  
  const pnlUSD = priceDiff * size;
  const pnlKAS = pnlUSD / kasPrice;
  const pnlPercentage = (priceDiff / entryPrice) * 100;

  return { pnlUSD, pnlKAS, pnlPercentage };
}
