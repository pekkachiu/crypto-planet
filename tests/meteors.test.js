import { describe, it, expect } from 'vitest';
import { createMeteorField, METEOR } from '../src/sim/meteors.js';
import { createRng } from '../src/sim/rng.js';

describe('createMeteorField', () => {
  it('新增的隕石從落下階段開始，進度隨時間增加', () => {
    const field = createMeteorField(createRng(1));
    field.spawn({ shopIndex: 2, side: 'long', size: 1 });
    expect(field.meteors).toHaveLength(1);
    const [m] = field.meteors;
    expect(m).toMatchObject({ shopIndex: 2, side: 'long', size: 1, phase: 'falling' });
    field.step(METEOR.fallSeconds / 2);
    expect(field.meteors[0].progress).toBeCloseTo(0.5);
  });

  it('落地點在店前廣場，不會砸在建築上', () => {
    const field = createMeteorField(createRng(4));
    for (let i = 0; i < 60; i++) field.spawn({ shopIndex: 0, side: 'short', size: 0.5 });
    for (const m of field.meteors) {
      const inBuilding = Math.abs(m.x) < 1.4 && m.z < 1.2;
      expect(inBuilding).toBe(false);
      expect(Math.hypot(m.x, m.z)).toBeLessThan(3.8);
    }
  });

  it('落地瞬間回報撞擊事件一次，接著進入衝擊與坑洞階段後消失', () => {
    const field = createMeteorField(createRng(1));
    field.spawn({ shopIndex: 1, side: 'long', size: 1 });
    const impacts = field.step(METEOR.fallSeconds + 0.01);
    expect(impacts).toEqual([expect.objectContaining({ shopIndex: 1, size: 1 })]);
    expect(field.meteors[0].phase).toBe('impact');
    expect(field.step(0.01)).toEqual([]);
    field.step(METEOR.impactSeconds);
    expect(field.meteors[0].phase).toBe('crater');
    field.step(METEOR.craterSeconds);
    expect(field.meteors).toHaveLength(0);
  });

  it('流星（shopIndex 為 null）不落地，劃過後消失、不回報撞擊', () => {
    const field = createMeteorField(createRng(1));
    field.spawn({ shopIndex: null, side: 'short', size: 0.3 });
    expect(field.meteors[0].phase).toBe('streak');
    expect(field.step(METEOR.streakSeconds + 0.01)).toEqual([]);
    expect(field.meteors).toHaveLength(0);
  });

  it('同時存在的數量有上限，超過時移除最舊的', () => {
    const field = createMeteorField(createRng(1));
    for (let i = 0; i < METEOR.max + 5; i++) field.spawn({ shopIndex: 0, side: 'long', size: i });
    expect(field.meteors).toHaveLength(METEOR.max);
    expect(field.meteors[0].size).toBe(5);
  });

  it('step(0) 或負數不改變狀態', () => {
    const field = createMeteorField(createRng(1));
    field.spawn({ shopIndex: 0, side: 'long', size: 1 });
    const before = JSON.stringify(field.meteors);
    field.step(0);
    field.step(-2);
    expect(JSON.stringify(field.meteors)).toBe(before);
  });
});
