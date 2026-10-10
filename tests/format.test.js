import { describe, it, expect } from 'vitest';
import { formatUsd, formatPrice, formatPct } from '../src/ui/format.js';

describe('formatUsd', () => {
  it('以 T/B/M/K 縮寫', () => {
    expect(formatUsd(1.62e12)).toBe('$1.62T');
    expect(formatUsd(3.4e10)).toBe('$34.0B');
    expect(formatUsd(5.5e6)).toBe('$5.50M');
    expect(formatUsd(1234)).toBe('$1.23K');
    expect(formatUsd(12)).toBe('$12');
  });
  it('無效值顯示破折號', () => {
    expect(formatUsd(NaN)).toBe('—');
    expect(formatUsd(null)).toBe('—');
  });
});

describe('formatPrice', () => {
  it('依價格大小調整小數位數', () => {
    expect(formatPrice(82807.47)).toBe('$82,807');
    expect(formatPrice(123.456)).toBe('$123.46');
    expect(formatPrice(0.123456)).toBe('$0.1235');
    expect(formatPrice(0.00001234)).toBe('$0.00001234');
  });
  it('無效值顯示破折號', () => {
    expect(formatPrice(undefined)).toBe('—');
  });
});

describe('formatPct', () => {
  it('正數加上加號', () => {
    expect(formatPct(1.234)).toBe('+1.23%');
    expect(formatPct(-0.5)).toBe('-0.50%');
    expect(formatPct(0)).toBe('0.00%');
  });
  it('無效值顯示破折號', () => {
    expect(formatPct(NaN)).toBe('—');
  });
});
