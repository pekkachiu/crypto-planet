import { describe, it, expect } from 'vitest';
import { createNoise3 } from '../src/sim/noise.js';
import { createTerrainField, PLAZA_ANGLE } from '../src/sim/terrain-field.js';

const unit = (x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };

describe('createNoise3', () => {
  it('同一種子結果相同，數值在 [-1, 1]', () => {
    const a = createNoise3(7);
    const b = createNoise3(7);
    for (let i = 0; i < 50; i++) {
      const p = [i * 0.37, i * 0.11, -i * 0.23];
      expect(a(...p)).toBe(b(...p));
      expect(Math.abs(a(...p))).toBeLessThanOrEqual(1);
    }
  });
  it('不同種子結果不同', () => {
    expect(createNoise3(1)(0.5, 0.5, 0.5)).not.toBe(createNoise3(2)(0.5, 0.5, 0.5));
  });
  it('連續：相鄰點數值接近', () => {
    const n = createNoise3(3);
    expect(Math.abs(n(1, 1, 1) - n(1.001, 1, 1))).toBeLessThan(0.01);
  });
});

describe('createTerrainField', () => {
  const spot = unit(0, 1, 0);
  const field = createTerrainField({ seed: 5, spots: [spot], waterLevel: -0.1 });

  it('店面廣場內是平坦的鋪面', () => {
    const s = field(spot);
    expect(s.kind).toBe('plaza');
    expect(s.height).toBe(0);
    const edge = unit(Math.sin(PLAZA_ANGLE * 0.8), Math.cos(PLAZA_ANGLE * 0.8), 0);
    expect(field(edge)).toMatchObject({ kind: 'plaza', height: 0 });
  });

  it('廣場外的地形有起伏，種類是水、沙、草或岩石', () => {
    const kinds = new Set();
    for (let i = 0; i < 400; i++) {
      const p = unit(Math.sin(i) * 3, Math.cos(i * 1.7) - 0.5, Math.sin(i * 0.3) * 2);
      const s = field(p);
      kinds.add(s.kind);
      if (s.kind !== 'plaza') expect(Math.abs(s.height)).toBeLessThanOrEqual(0.6);
    }
    expect([...kinds].every((k) => ['plaza', 'water', 'sand', 'grass', 'rock'].includes(k))).toBe(true);
    expect(kinds.has('water')).toBe(true);
    expect(kinds.has('grass')).toBe(true);
  });

  it('水面是平的，高度固定在海平面下', () => {
    for (let i = 0; i < 400; i++) {
      const s = field(unit(Math.cos(i * 2.1), Math.sin(i * 0.7), Math.cos(i * 1.3)));
      if (s.kind === 'water') expect(s.height).toBeLessThan(0);
    }
  });

  it('廣場邊緣與外圍地形平滑銜接，不會有懸崖', () => {
    const just = unit(Math.sin(PLAZA_ANGLE * 1.05), Math.cos(PLAZA_ANGLE * 1.05), 0);
    expect(Math.abs(field(just).height)).toBeLessThan(0.08);
  });

  it('適合種樹的地方只在草地', () => {
    for (let i = 0; i < 200; i++) {
      const p = unit(Math.sin(i * 1.3), Math.cos(i * 0.9), Math.sin(i * 2.7));
      if (field.canPlant(p)) expect(field(p).kind).toBe('grass');
    }
  });
});
