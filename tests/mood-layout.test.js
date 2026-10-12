import { describe, it, expect } from 'vitest';
import { gaugeAngle, cloudPlan, GAUGE_BANDS, MAX_CLOUDS } from '../src/sim/mood-layout.js';

describe('gaugeAngle', () => {
  it('0 分在左（π）、50 分朝上（π/2）、100 分在右（0）', () => {
    expect(gaugeAngle(0)).toBeCloseTo(Math.PI);
    expect(gaugeAngle(50)).toBeCloseTo(Math.PI / 2);
    expect(gaugeAngle(100)).toBeCloseTo(0);
  });
  it('超出範圍或無效時夾在刻度內，無效當成 50', () => {
    expect(gaugeAngle(150)).toBeCloseTo(0);
    expect(gaugeAngle(-5)).toBeCloseTo(Math.PI);
    expect(gaugeAngle(NaN)).toBeCloseTo(Math.PI / 2);
  });
});

describe('GAUGE_BANDS', () => {
  it('五段刻度首尾相接，涵蓋 0～100，由紅到綠', () => {
    expect(GAUGE_BANDS[0].from).toBe(0);
    expect(GAUGE_BANDS.at(-1).to).toBe(100);
    GAUGE_BANDS.slice(1).forEach((b, i) => expect(b.from).toBe(GAUGE_BANDS[i].to));
    expect(GAUGE_BANDS.map((b) => b.level)).toEqual(['extremeFear', 'fear', 'neutral', 'greed', 'extremeGreed']);
  });
});

describe('cloudPlan', () => {
  it('中性：幾朵白雲', () => {
    const plan = cloudPlan({ rain: 0, sun: 0 });
    expect(plan.count).toBeGreaterThan(0);
    expect(plan.darkness).toBe(0);
  });
  it('越恐懼雲越多越黑，最多 MAX_CLOUDS 朵', () => {
    const light = cloudPlan({ rain: 0.3, sun: 0 });
    const heavy = cloudPlan({ rain: 1, sun: 0 });
    expect(heavy.count).toBeGreaterThan(light.count);
    expect(heavy.darkness).toBeGreaterThan(light.darkness);
    expect(heavy.count).toBe(MAX_CLOUDS);
  });
  it('越貪婪雲越少，極度貪婪時萬里無雲', () => {
    expect(cloudPlan({ rain: 0, sun: 0.5 }).count).toBeLessThan(cloudPlan({ rain: 0, sun: 0 }).count);
    expect(cloudPlan({ rain: 0, sun: 1 }).count).toBe(0);
  });
});
