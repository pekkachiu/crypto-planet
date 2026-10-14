import { describe, it, expect } from 'vitest';
import { PLANETS, orbitPosition, findPlanet, planetNameKey, planetSubtitleKey } from '../src/data/planets.js';
import { MESSAGES } from '../src/i18n/index.js';

describe('PLANETS', () => {
  it('包含主流、迷因、AI、公鏈、ETF、恐懼貪婪六顆星球，且 id 不重複', () => {
    const ids = PLANETS.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['major', 'meme', 'ai', 'layer1', 'etf', 'mood']));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('六顆星球都開放（主流星以外要等資料載入成功才解鎖）', () => {
    expect(PLANETS.every((p) => p.enabled)).toBe(true);
  });
  it('迷因、AI、公鏈星各對應一個 CoinGecko 分類，公鏈星排除主流星已有的幣', () => {
    expect(findPlanet('meme').category).toBe('meme-token');
    expect(findPlanet('ai').category).toBe('artificial-intelligence');
    expect(findPlanet('layer1').category).toBe('layer-1');
    expect(findPlanet('layer1').excludeMajor).toBe(true);
    expect(PLANETS.filter((p) => p.category).map((p) => p.id)).toEqual(['meme', 'ai', 'layer1']);
  });
  it('軌道半徑不重複，相鄰軌道至少相隔 25，不會撞在一起', () => {
    const orbits = PLANETS.map((p) => p.orbit).toSorted((a, b) => a - b);
    expect(new Set(orbits).size).toBe(orbits.length);
    orbits.slice(1).forEach((o, i) => expect(o - orbits[i]).toBeGreaterThanOrEqual(25));
  });
  it('最外圈軌道不超過 ETF 星，預設的太陽系視角放得下所有星球', () => {
    expect(Math.max(...PLANETS.map((p) => p.orbit))).toBe(findPlanet('etf').orbit);
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
