import { describe, it, expect } from 'vitest';
import { createShopSim, queueSlot, LAYOUT } from '../src/sim/crowd.js';
import { createRng } from '../src/sim/rng.js';

const params = (over = {}) => ({ pedestrians: 6, buyQueue: 10, sellQueue: 4, callInterval: 3, ...over });
const count = (sim, kind, state) => sim.agents.filter((a) => a.kind === kind && (!state || a.state === state)).length;

describe('createRng', () => {
  it('同一個種子產生相同序列，數值在 [0,1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seq = Array.from({ length: 5 }, () => a());
    expect(seq).toEqual(Array.from({ length: 5 }, () => b()));
    for (const v of seq) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('queueSlot', () => {
  it('買方隊伍在門口右邊（+x）、賣方在左邊（-x）', () => {
    expect(queueSlot('buy', 0).x).toBeGreaterThan(0);
    expect(queueSlot('sell', 0).x).toBeLessThan(0);
  });
  it('隊伍蛇行排列，第一排滿了往外排第二排', () => {
    const first = queueSlot('buy', 0);
    const nextRow = queueSlot('buy', LAYOUT.perRow);
    expect(nextRow.z).toBeGreaterThan(first.z);
  });
  it('排頭最靠近門口', () => {
    const head = queueSlot('buy', 0);
    expect(Math.abs(head.x)).toBeLessThan(Math.abs(queueSlot('buy', 3).x));
  });
});

describe('createShopSim', () => {
  it('初始化時隊伍與路人數量符合參數', () => {
    const sim = createShopSim(params(), createRng(1));
    expect(count(sim, 'buy', 'queue')).toBe(10);
    expect(count(sim, 'sell', 'queue')).toBe(4);
    expect(count(sim, 'walker')).toBe(6);
  });

  it('到了叫號時間，排頭進店，隊伍補人維持長度', () => {
    const sim = createShopSim(params({ callInterval: 2 }), createRng(1));
    const headId = sim.agents.find((a) => a.kind === 'buy' && a.slot === 0).id;
    sim.step(2.05);
    const head = sim.agents.find((a) => a.id === headId);
    expect(head.state).toBe('entering');
    const inLine = sim.agents.filter((a) => a.kind === 'buy' && (a.state === 'queue' || a.state === 'joining'));
    expect(inLine).toHaveLength(10);
    expect(inLine.map((a) => a.slot).toSorted((a, b) => a - b)).toEqual([...Array(10).keys()]);
  });

  it('進店的人走到門口後消失，並有人從中間走道出來', () => {
    const sim = createShopSim(params({ callInterval: 2 }), createRng(1));
    sim.step(2.05);
    for (let i = 0; i < 40; i++) sim.step(0.1);
    expect(sim.stats.served).toBeGreaterThan(0);
    const exits = sim.agents.filter((a) => a.state === 'exiting');
    for (const e of exits) expect(Math.abs(e.x)).toBeLessThan(LAYOUT.aisleHalfWidth);
  });

  it('離開的人走到人行道後移除，人數不會無限成長', () => {
    const sim = createShopSim(params({ callInterval: 2 }), createRng(1));
    for (let i = 0; i < 1200; i++) sim.step(0.1);
    expect(sim.agents.length).toBeLessThan(10 + 4 + 6 + 12);
  });

  it('路人沿著店外圍的環形路線走，不會走進店裡', () => {
    const sim = createShopSim(params(), createRng(3));
    for (let i = 0; i < 100; i++) {
      sim.step(0.1);
      for (const w of sim.agents.filter((a) => a.kind === 'walker')) {
        const inside = Math.abs(w.x) < LAYOUT.shopHalfWidth && Math.abs(w.z) < LAYOUT.shopHalfDepth;
        expect(inside).toBe(false);
      }
    }
  });

  it('update 參數後，隊伍長度逐步調整到新目標', () => {
    const sim = createShopSim(params({ buyQueue: 10, callInterval: 1 }), createRng(1));
    sim.update(params({ buyQueue: 5, callInterval: 1 }));
    for (let i = 0; i < 200; i++) sim.step(0.1);
    const inLine = sim.agents.filter((a) => a.kind === 'buy' && (a.state === 'queue' || a.state === 'joining'));
    expect(inLine).toHaveLength(5);
    sim.update(params({ buyQueue: 12, callInterval: 1 }));
    for (let i = 0; i < 200; i++) sim.step(0.1);
    expect(sim.agents.filter((a) => a.kind === 'buy' && (a.state === 'queue' || a.state === 'joining'))).toHaveLength(12);
  });

  it('路人數量也會隨參數調整', () => {
    const sim = createShopSim(params({ pedestrians: 6 }), createRng(1));
    sim.update(params({ pedestrians: 2 }));
    expect(count(sim, 'walker')).toBe(2);
    sim.update(params({ pedestrians: 9 }));
    expect(count(sim, 'walker')).toBe(9);
  });

  it('受到驚嚇時路人加速散開，一段時間後恢復', () => {
    const calm = createShopSim(params(), createRng(5));
    const scared = createShopSim(params(), createRng(5));
    scared.startle();
    const walked = (sim) => {
      const before = sim.agents.filter((a) => a.kind === 'walker').map((a) => a.s);
      sim.step(0.5);
      const after = sim.agents.filter((a) => a.kind === 'walker').map((a) => a.s);
      return after.reduce((sum, s, i) => sum + Math.abs(s - before[i]), 0);
    };
    expect(walked(scared)).toBeGreaterThan(walked(calm) * 1.8);
    scared.step(LAYOUT.startleSeconds);
    expect(walked(scared)).toBeCloseTo(walked(calm), 5);
  });

  it('step(0) 或負數不會改變狀態', () => {
    const sim = createShopSim(params(), createRng(1));
    const before = JSON.stringify(sim.agents);
    sim.step(0);
    sim.step(-1);
    expect(JSON.stringify(sim.agents)).toBe(before);
  });
});
