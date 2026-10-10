import { describe, it, expect } from 'vitest';
import { tierOf, tierProgress, TIERS, ETF_TIERS } from '../src/data/tiers.js';

describe('tierOf', () => {
  it('依絕對市值分四級', () => {
    expect(tierOf(1.6e12)).toBe(1);
    expect(tierOf(1e12)).toBe(1);
    expect(tierOf(3.0e11)).toBe(2);
    expect(tierOf(8.5e10)).toBe(3);
    expect(tierOf(2e10)).toBe(3);
    expect(tierOf(1.2e10)).toBe(4);
    expect(tierOf(0)).toBe(4);
  });
  it('無效市值歸為最小級', () => {
    expect(tierOf(NaN)).toBe(4);
    expect(tierOf(-5)).toBe(4);
  });
  it('每一級都有翻譯鍵', () => {
    expect(TIERS.map((t) => t.key)).toEqual(['tier.1', 'tier.2', 'tier.3', 'tier.4']);
  });
});

describe('tierProgress', () => {
  it('級距下緣為 0、上緣為 1，用對數內插', () => {
    expect(tierProgress(1e11)).toBeCloseTo(0);
    expect(tierProgress(Math.sqrt(1e11 * 1e12))).toBeCloseTo(0.5);
    expect(tierProgress(9.99e11)).toBeGreaterThan(0.99);
  });
  it('超出最上級或最下級時夾在 0～1', () => {
    expect(tierProgress(1e14)).toBe(1);
    expect(tierProgress(1)).toBe(0);
  });
});

describe('ETF_TIERS', () => {
  it('ETF 依資產規模分級：≥$50B、≥$10B、≥$1B、其他', () => {
    expect([8e10, 5e10, 1.5e10, 3e9, 1.5e8].map((v) => tierOf(v, ETF_TIERS))).toEqual([1, 1, 2, 3, 4]);
  });
  it('級距內位置也依 ETF 級距計算', () => {
    expect(tierProgress(1e10, ETF_TIERS)).toBeCloseTo(0);
  });
});
