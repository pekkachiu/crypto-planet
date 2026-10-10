import { describe, it, expect } from 'vitest';
import { PLANETS, orbitPosition, findPlanet, planetNameKey, planetSubtitleKey } from '../src/data/planets.js';
import { MESSAGES } from '../src/i18n/index.js';

describe('PLANETS', () => {
  it('包含主流、迷因、AI、公鏈、ETF 五顆星球，且 id 不重複', () => {
    const ids = PLANETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['major', 'meme', 'ai', 'layer1', 'etf']));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('主流星與 ETF 星開放（ETF 星還要等資料載入成功才解鎖）', () => {
    expect(PLANETS.filter((p) => p.enabled).map((p) => p.id)).toEqual(['major', 'etf']);
  });
  it('軌道半徑由內而外遞增，不會撞在一起', () => {
    const orbits = PLANETS.map((p) => p.orbit);
    expect(orbits).toEqual(orbits.toSorted((a, b) => a - b));
    expect(new Set(orbits).size).toBe(orbits.length);
  });
});

describe('星球名稱翻譯', () => {
  it('每顆星球都有中英文名稱與副標', () => {
    for (const p of PLANETS) {
      for (const lang of ['zh-TW', 'en']) {
        expect(MESSAGES[lang][planetNameKey(p)], `${lang} ${p.id}`).toBeTruthy();
        expect(MESSAGES[lang][planetSubtitleKey(p)], `${lang} ${p.id}`).toBeTruthy();
      }
    }
  });
});

describe('orbitPosition', () => {
  it('位置落在軌道半徑上，並隨時間前進', () => {
    const p = { orbit: 50, speed: 0.1, phase: 0 };
    const a = orbitPosition(p, 0);
    const b = orbitPosition(p, 5);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(50);
    expect(Math.hypot(b.x, b.z)).toBeCloseTo(50);
    expect(a).not.toEqual(b);
  });
});

describe('findPlanet', () => {
  it('依 id 找星球，找不到回傳 undefined', () => {
    expect(findPlanet('major').id).toBe('major');
    expect(findPlanet('nope')).toBeUndefined();
  });
});
