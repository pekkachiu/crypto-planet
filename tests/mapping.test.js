import { describe, it, expect } from 'vitest';
import { scaleSqrt, scaleLog, mapTown, planetRadius, RANGES } from '../src/data/mapping.js';

describe('scaleSqrt', () => {
  it('最小值對應輸出下限、最大值對應上限', () => {
    expect(scaleSqrt(0, 0, 100, 4, 18)).toBe(4);
    expect(scaleSqrt(100, 0, 100, 4, 18)).toBe(18);
  });
  it('依平方根縮放', () => {
    expect(scaleSqrt(25, 0, 100, 0, 10)).toBeCloseTo(5);
  });
  it('超出範圍時夾住', () => {
    expect(scaleSqrt(-5, 0, 100, 4, 18)).toBe(4);
    expect(scaleSqrt(500, 0, 100, 4, 18)).toBe(18);
  });
  it('值域為零時回傳中間值', () => {
    expect(scaleSqrt(7, 7, 7, 0, 10)).toBe(5);
  });
});

describe('scaleLog', () => {
  it('依對數縮放並夾住', () => {
    expect(scaleLog(10, 10, 1000, 1, 3)).toBe(1);
    expect(scaleLog(100, 10, 1000, 1, 3)).toBeCloseTo(2);
    expect(scaleLog(1e9, 10, 1000, 1, 3)).toBe(3);
  });
  it('非正數輸入回傳下限', () => {
    expect(scaleLog(0, 10, 1000, 1, 3)).toBe(1);
    expect(scaleLog(5, 0, 1000, 1, 3)).toBe(1);
  });
  it('值域為零時回傳中間值', () => {
    expect(scaleLog(5, 5, 5, 1, 3)).toBe(2);
  });
});

describe('mapTown', () => {
  const coin = (id, over) => ({ id, volume24h: 0, takerBuy: 0, takerSell: 0, trades: 0, marketCap: 1, change24h: 0, ...over });
  const coins = [
    coin('a', { volume24h: 1e9, takerBuy: 6e8, takerSell: 4e8, trades: 1e6, marketCap: 1e12, change24h: 2 }),
    coin('b', { volume24h: 1e6, takerBuy: 1e5, takerSell: 9e5, trades: 1e3, marketCap: 1e9, change24h: -3 }),
  ];

  it('招牌顯示排名、代號、價格與 24h 漲跌', () => {
    const [a] = mapTown([{ ...coins[0], rank: 1, symbol: 'BTC', price: 64000 }]);
    expect(a.sign).toEqual({ rank: 1, symbol: 'BTC', primary: '$64,000', secondary: '+2.00%' });
  });
  it('成交量最大的店人最多、最小的人最少', () => {
    const [a, b] = mapTown(coins);
    expect(a.pedestrians).toBe(RANGES.pedestrians[1]);
    expect(b.pedestrians).toBe(RANGES.pedestrians[0]);
  });
  it('隊伍人數為整數且在範圍內', () => {
    for (const t of mapTown(coins)) {
      for (const q of [t.buyQueue, t.sellQueue]) {
        expect(Number.isInteger(q)).toBe(true);
        expect(q).toBeGreaterThanOrEqual(RANGES.queue[0]);
        expect(q).toBeLessThanOrEqual(RANGES.queue[1]);
      }
    }
  });
  it('成交筆數越多叫號越快', () => {
    const [a, b] = mapTown(coins);
    expect(a.callInterval).toBeCloseTo(RANGES.callInterval[1]);
    expect(b.callInterval).toBeCloseTo(RANGES.callInterval[0]);
  });
  it('綠漲紅跌', () => {
    const [a, b] = mapTown(coins);
    expect(a.trend).toBe('up');
    expect(b.trend).toBe('down');
    expect(mapTown([coin('c', { change24h: 0 })])[0].trend).toBe('flat');
  });
  it('保留原始幣種資料且不改動輸入', () => {
    const snapshot = JSON.stringify(coins);
    const [a] = mapTown(coins);
    expect(a.coin).toBe(coins[0]);
    expect(JSON.stringify(coins)).toBe(snapshot);
  });
  it('依絕對市值附上建築等級與級內位置', () => {
    const [a, b] = mapTown(coins);
    expect(a.tier).toBe(1);
    expect(b.tier).toBe(4);
    expect(a.tierProgress).toBeGreaterThanOrEqual(0);
    expect(a.tierProgress).toBeLessThanOrEqual(1);
  });
  it('空陣列回傳空陣列', () => {
    expect(mapTown([])).toEqual([]);
  });
});

describe('planetRadius', () => {
  it('總市值越大星球越大，並夾在範圍內', () => {
    const small = planetRadius(1e9);
    const big = planetRadius(3e12);
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(RANGES.planetRadius[0]);
    expect(big).toBeLessThanOrEqual(RANGES.planetRadius[1]);
  });
});
