import { tierOf, tierProgress } from './tiers.js';

/** 資料 → 畫面參數的換算範圍 */
export const RANGES = Object.freeze({
  pedestrians: [4, 18],
  queue: [3, 48],
  /** 叫號間隔秒數：[最慢, 最快] */
  callInterval: [7, 2.2],
  planetRadius: [6, 16],
  /** 分類總市值的對數縮放區間（美元） */
  planetCap: [1e9, 4e12],
});

const clamp01 = (t) => Math.min(1, Math.max(0, t));
const lerp = (a, b, t) => a + (b - a) * t;

export function scaleSqrt(value, dMin, dMax, oMin, oMax) {
  const span = Math.sqrt(dMax) - Math.sqrt(dMin);
  if (span === 0) return lerp(oMin, oMax, 0.5);
  return lerp(oMin, oMax, clamp01((Math.sqrt(Math.max(0, value)) - Math.sqrt(dMin)) / span));
}

export function scaleLog(value, dMin, dMax, oMin, oMax) {
  if (value <= 0 || dMin <= 0) return oMin;
  const span = Math.log(dMax) - Math.log(dMin);
  if (span === 0) return lerp(oMin, oMax, 0.5);
  return lerp(oMin, oMax, clamp01((Math.log(value) - Math.log(dMin)) / span));
}

const extent = (values) => [Math.min(...values), Math.max(...values)];

function trendOf(change) {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

/** 依同一顆星球上所有幣種的相對大小，算出每間店的畫面參數 */
export function mapTown(coins) {
  if (coins.length === 0) return [];
  const [vMin, vMax] = extent(coins.map((c) => c.volume24h));
  const [qMin, qMax] = extent(coins.flatMap((c) => [c.takerBuy, c.takerSell]));
  const [tMin, tMax] = extent(coins.map((c) => c.trades));
  const queue = (v) => Math.round(scaleSqrt(v, qMin, qMax, ...RANGES.queue));

  return coins.map((coin) => ({
    coin,
    pedestrians: Math.round(scaleSqrt(coin.volume24h, vMin, vMax, ...RANGES.pedestrians)),
    buyQueue: queue(coin.takerBuy),
    sellQueue: queue(coin.takerSell),
    callInterval: scaleSqrt(coin.trades, tMin, tMax, ...RANGES.callInterval),
    tier: tierOf(coin.marketCap),
    tierProgress: tierProgress(coin.marketCap),
    trend: trendOf(coin.change24h),
  }));
}

export function planetRadius(totalMarketCap) {
  return scaleLog(totalMarketCap, ...RANGES.planetCap, ...RANGES.planetRadius);
}
