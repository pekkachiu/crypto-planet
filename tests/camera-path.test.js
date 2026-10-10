import { describe, it, expect } from 'vitest';
import { arcPoint } from '../src/sim/camera-path.js';

const dist = (p, c) => Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
const center = { x: 10, y: 0, z: -5 };
const R = 15;

describe('arcPoint', () => {
  const from = { x: 10, y: 18, z: 20 };   // 星球一側
  const to = { x: 10, y: 18, z: -30 };    // 星球另一側
  const opts = { center, minDistance: R * 1.25, lift: R * 0.5 };

  it('起點與終點分毫不差', () => {
    expect(arcPoint(from, to, 0, opts)).toEqual(from);
    const end = arcPoint(from, to, 1, opts);
    for (const k of ['x', 'y', 'z']) expect(end[k]).toBeCloseTo(to[k]);
  });

  it('整條路徑都在星球外，不會穿模', () => {
    for (let i = 0; i <= 100; i++) {
      expect(dist(arcPoint(from, to, i / 100, opts), center)).toBeGreaterThanOrEqual(R * 1.25 - 1e-6);
    }
  });

  it('飛到一半時會拉高（離星球比兩端都遠）', () => {
    const mid = dist(arcPoint(from, to, 0.5, opts), center);
    expect(mid).toBeGreaterThan(Math.max(dist(from, center), dist(to, center)));
  });

  it('兩點方向完全相反時也能算出路徑', () => {
    const a = { x: center.x, y: center.y + 20, z: center.z };
    const b = { x: center.x, y: center.y - 20, z: center.z };
    for (let i = 0; i <= 20; i++) {
      const p = arcPoint(a, b, i / 20, opts);
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      expect(dist(p, center)).toBeGreaterThanOrEqual(R * 1.25 - 1e-6);
    }
  });

  it('起終點相同時停在原地', () => {
    const p = arcPoint(from, from, 0.5, { ...opts, lift: 0 });
    for (const k of ['x', 'y', 'z']) expect(p[k]).toBeCloseTo(from[k]);
  });
});
