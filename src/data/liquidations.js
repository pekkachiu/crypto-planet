import { scaleSqrt } from './mapping.js';

/** 大額爆倉門檻（美元）：觸發鏡頭震動與提示 */
export const BIG_LIQUIDATION_USD = 100_000;
const METEOR_USD = [1e3, 2e6];
const METEOR_SIZE = [0.25, 1.4];

const toNumber = (v) => (typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN);

/**
 * 解析 Binance 合約爆倉推播（forceOrder）。
 * S＝SELL 表示多單被強制賣出（多單爆倉）；S＝BUY 表示空單被強制買回（空單爆倉）。
 * @returns {{pair:string, side:'long'|'short', usd:number, time:number} | null}
 */
export function parseForceOrder(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const o = data?.o;
  if (data?.e !== 'forceOrder' || !o || typeof o.s !== 'string') return null;
  const side = { SELL: 'long', BUY: 'short' }[o.S];
  if (!side) return null;
  let usd = toNumber(o.ap) * toNumber(o.z);
  if (!(usd > 0)) usd = toNumber(o.p) * toNumber(o.q);
  if (!(usd > 0)) return null;
  return { pair: o.s, side, usd, time: Number(o.T) || Number(data.E) || 0 };
}

/** 開站以來的爆倉累計：{ [pair]: { long, short } } */
export function emptyTally() {
  return {};
}

export function addToTally(tally, { pair, side, usd }) {
  const prev = tally[pair] ?? { long: 0, short: 0 };
  return { ...tally, [pair]: { ...prev, [side]: prev[side] + usd } };
}

export function meteorSize(usd) {
  return scaleSqrt(usd, ...METEOR_USD, ...METEOR_SIZE);
}

export function isBigLiquidation(usd) {
  return usd >= BIG_LIQUIDATION_USD;
}
