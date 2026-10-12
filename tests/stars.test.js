import { describe, it, expect } from 'vitest';
import { createStarData, STAR_TINTS } from '../src/sim/stars.js';
import { moodColor, GAUGE_BANDS } from '../src/sim/mood-layout.js';

describe('createStarData', () => {
  const data = createStarData({ count: 500, shell: 900, seed: 7 });

  it('每顆星有位置、顏色、大小與閃爍相位，都落在球殼上', () => {
    expect(data.positions).toHaveLength(500 * 3);
    expect(data.colors).toHaveLength(500 * 3);
    expect(data.sizes).toHaveLength(500);
    expect(data.phases).toHaveLength(500);
    for (let i = 0; i < 500; i++) {
      const [x, y, z] = data.positions.slice(i * 3, i * 3 + 3);
      expect(Math.hypot(x, y, z)).toBeCloseTo(900, 0);
    }
  });
  it('大小有差異：大多是小星星，少數亮星', () => {
    const sizes = [...data.sizes];
    const big = sizes.filter((s) => s > 2.5).length;
    expect(Math.min(...sizes)).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(0);
    expect(big).toBeLessThan(500 * 0.1);
  });
  it('顏色從星色表中挑，偏藍、白、偏黃都有', () => {
    const seen = new Set();
    for (let i = 0; i < 500; i++) seen.add(data.colors.slice(i * 3, i * 3 + 3).join(','));
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(seen.size).toBeLessThanOrEqual(STAR_TINTS.length);
  });
  it('同一個種子產生一樣的星空', () => {
    expect(createStarData({ count: 50, shell: 10, seed: 3 })).toEqual(createStarData({ count: 50, shell: 10, seed: 3 }));
  });
});

describe('moodColor', () => {
  it('光暈顏色跟儀表刻度一致：恐懼紅、貪婪綠', () => {
    expect(moodColor('extremeFear')).toBe(GAUGE_BANDS[0].color);
    expect(moodColor('greed')).toBe(GAUGE_BANDS[3].color);
  });
  it('未知等級用中性的顏色', () => {
    expect(moodColor('nope')).toBe(GAUGE_BANDS[2].color);
  });
});
