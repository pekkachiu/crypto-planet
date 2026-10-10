import { describe, it, expect } from 'vitest';
import {
  parseForceOrder, emptyTally, addToTally, meteorSize, isBigLiquidation, BIG_LIQUIDATION_USD,
} from '../src/data/liquidations.js';

const message = (over = {}) => JSON.stringify({
  e: 'forceOrder', E: 1791624664173,
  o: { s: 'BTCUSDT', S: 'SELL', q: '0.5', p: '82000', ap: '82100', z: '0.5', T: 1791624664170, ...over },
});

describe('parseForceOrder', () => {
  it('SELL 代表多單被強制賣出＝多單爆倉，金額＝成交均價 × 成交量', () => {
    expect(parseForceOrder(message())).toEqual({ pair: 'BTCUSDT', side: 'long', usd: 41050, time: 1791624664170 });
  });
  it('BUY 代表空單被強制買回＝空單爆倉', () => {
    expect(parseForceOrder(message({ S: 'BUY' })).side).toBe('short');
  });
  it('均價為 0 時改用委託價 × 委託量', () => {
    expect(parseForceOrder(message({ ap: '0', z: '0', p: '100', q: '3' })).usd).toBe(300);
  });
  it('格式錯誤、非爆倉事件或金額無效時回傳 null', () => {
    expect(parseForceOrder('not json')).toBeNull();
    expect(parseForceOrder(JSON.stringify({ e: 'aggTrade' }))).toBeNull();
    expect(parseForceOrder(message({ S: 'HOLD' }))).toBeNull();
    expect(parseForceOrder(message({ ap: 'x', p: 'y' }))).toBeNull();
    expect(parseForceOrder(message({ s: 42 }))).toBeNull();
  });
});

describe('addToTally', () => {
  it('依交易對與方向累計，不改動原本的統計', () => {
    const a = emptyTally();
    const b = addToTally(a, { pair: 'BTCUSDT', side: 'long', usd: 100 });
    const c = addToTally(b, { pair: 'BTCUSDT', side: 'short', usd: 40 });
    const d = addToTally(c, { pair: 'BTCUSDT', side: 'long', usd: 5 });
    expect(a).toEqual({});
    expect(b).toEqual({ BTCUSDT: { long: 100, short: 0 } });
    expect(d).toEqual({ BTCUSDT: { long: 105, short: 40 } });
  });
});

describe('meteorSize', () => {
  it('金額越大隕石越大，夾在上下限內', () => {
    expect(meteorSize(10)).toBe(meteorSize(1));
    expect(meteorSize(5e5)).toBeGreaterThan(meteorSize(5e3));
    expect(meteorSize(1e9)).toBe(meteorSize(1e8));
  });
});

describe('isBigLiquidation', () => {
  it(`金額 ≥ ${BIG_LIQUIDATION_USD} 才算大額`, () => {
    expect(isBigLiquidation(BIG_LIQUIDATION_USD)).toBe(true);
    expect(isBigLiquidation(BIG_LIQUIDATION_USD - 1)).toBe(false);
  });
});
