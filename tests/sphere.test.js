import { describe, it, expect } from 'vitest';
import { capPoints, tangentFrame, groundHeight } from '../src/sim/sphere.js';

const len = (v) => Math.hypot(v.x, v.y, v.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('capPoints', () => {
  it('產生指定數量的單位向量，第一個在北極附近', () => {
    const pts = capPoints(10, -0.2);
    expect(pts).toHaveLength(10);
    for (const p of pts) expect(len(p)).toBeCloseTo(1);
    expect(pts[0].y).toBeGreaterThan(0.9);
  });
  it('所有點都在指定的緯度帽內', () => {
    for (const p of capPoints(10, -0.2)) expect(p.y).toBeGreaterThanOrEqual(-0.2 - 1e-9);
  });
  it('點與點之間保持距離，店面不會重疊', () => {
    const pts = capPoints(10, -0.2);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z);
        expect(d).toBeGreaterThan(0.4);
      }
    }
  });
  it('數量為零回傳空陣列；只有一個時放在北極', () => {
    expect(capPoints(0, 0)).toEqual([]);
    expect(capPoints(1, 0)[0].y).toBeCloseTo(1);
  });
});

describe('tangentFrame', () => {
  it('回傳互相垂直的單位向量，up 等於法向量', () => {
    const n = { x: 0.6, y: 0.8, z: 0 };
    const { up, east, south } = tangentFrame(n);
    expect(up).toEqual(n);
    expect(len(east)).toBeCloseTo(1);
    expect(len(south)).toBeCloseTo(1);
    expect(dot(up, east)).toBeCloseTo(0);
    expect(dot(up, south)).toBeCloseTo(0);
    expect(dot(east, south)).toBeCloseTo(0);
  });
  it('south 指向遠離北極的方向', () => {
    const { south } = tangentFrame({ x: 0.6, y: 0.8, z: 0 });
    expect(south.y).toBeLessThan(0);
  });
  it('在北極也不會退化', () => {
    const { east, south } = tangentFrame({ x: 0, y: 1, z: 0 });
    expect(len(east)).toBeCloseTo(1);
    expect(len(south)).toBeCloseTo(1);
  });
});

describe('groundHeight', () => {
  it('中心為零，越遠越低（球面下彎）', () => {
    expect(groundHeight(15, 0, 0)).toBe(0);
    expect(groundHeight(15, 3, 0)).toBeLessThan(0);
    expect(groundHeight(15, 3, 4)).toBeCloseTo(Math.sqrt(225 - 25) - 15);
  });
  it('超出球半徑時夾在 -R', () => {
    expect(groundHeight(2, 5, 0)).toBe(-2);
  });
});
