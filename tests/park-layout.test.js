import { describe, it, expect } from 'vitest';
import { sitterCounts, seatPositions, monument, PARK } from '../src/sim/park-layout.js';

describe('sitterCounts', () => {
  it('總人數隨總金額增加，依多空比例分配', () => {
    const small = sitterCounts({ long: 1e5, short: 1e5 });
    const big = sitterCounts({ long: 3e8, short: 1e8 });
    expect(big.long + big.short).toBeGreaterThan(small.long + small.short);
    expect(big.long).toBeGreaterThan(big.short);
  });
  it('每邊不超過座位數；有金額的一邊至少一人', () => {
    const r = sitterCounts({ long: 1e12, short: 1 });
    expect(r.long).toBeLessThanOrEqual(PARK.seatsPerSide);
    expect(r.short).toBe(1);
  });
  it('沒有爆倉時公園是空的', () => {
    expect(sitterCounts({ long: 0, short: 0 })).toEqual({ long: 0, short: 0 });
  });
});

describe('seatPositions', () => {
  it('多單（紅）坐左半邊、空單（綠）坐右半邊，跟門口隊伍同一邊', () => {
    for (const p of seatPositions('long', 10)) expect(p.x).toBeLessThan(0);
    for (const p of seatPositions('short', 10)) expect(p.x).toBeGreaterThan(0);
  });
  it('回傳指定數量，座位不重疊，面向公園中央', () => {
    const seats = seatPositions('long', PARK.seatsPerSide);
    expect(seats).toHaveLength(PARK.seatsPerSide);
    const keys = new Set(seats.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`));
    expect(keys.size).toBe(seats.length);
    for (const s of seats) {
      const toCenter = Math.atan2(-s.x, -s.z);
      expect(Math.abs(Math.sin(s.heading - toCenter))).toBeLessThan(1e-9);
    }
  });
  it('超過座位數時只回傳座位數', () => {
    expect(seatPositions('short', 999)).toHaveLength(PARK.seatsPerSide);
  });
});

describe('monument', () => {
  it('紀念碑高度隨總額增加，紅色比例＝多單佔比', () => {
    const a = monument({ long: 3e6, short: 1e6 });
    const b = monument({ long: 3e8, short: 1e8 });
    expect(b.height).toBeGreaterThan(a.height);
    expect(a.longShare).toBeCloseTo(0.75);
  });
  it('沒有爆倉時佔比為一半', () => {
    expect(monument({ long: 0, short: 0 }).longShare).toBe(0.5);
  });
});
