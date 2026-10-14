import { describe, it, expect } from 'vitest';
import { cacheKey, encodeCache, decodeCache } from '../src/data/category-cache.js';

const coin = (over = {}) => ({
  id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', price: 0.2, marketCap: 1.3e10, rank: 9, change24h: 1.2,
  volume24h: 5e8, takerBuy: 3e8, takerSell: 2e8, trades: 9e5, pair: 'DOGEUSDT', ...over,
});
const NOW = Date.UTC(2026, 9, 14, 6);
const fresh = { coins: [coin()], updatedAt: new Date(NOW - 60_000).toISOString() };

describe('cacheKey', () => {
  it('每顆星球各自一個鍵', () => {
    expect(cacheKey('meme')).not.toBe(cacheKey('ai'));
  });
});

describe('decodeCache', () => {
  it('還沒過期的快取原樣讀回', () => {
    expect(decodeCache(encodeCache(fresh), { now: NOW, maxAgeMs: 5 * 60_000 })).toEqual(fresh);
  });
  it('過期時回傳 null', () => {
    expect(decodeCache(encodeCache(fresh), { now: NOW, maxAgeMs: 30_000 })).toBeNull();
  });
  it('時間在未來（時鐘被調過）時回傳 null', () => {
    const future = { ...fresh, updatedAt: new Date(NOW + 3600e3).toISOString() };
    expect(decodeCache(encodeCache(future), { now: NOW, maxAgeMs: 5 * 60_000 })).toBeNull();
  });
  it('沒有資料、不是 JSON 或格式不對時回傳 null', () => {
    const opts = { now: NOW, maxAgeMs: 5 * 60_000 };
    expect(decodeCache(null, opts)).toBeNull();
    expect(decodeCache('{oops', opts)).toBeNull();
    expect(decodeCache(JSON.stringify({ coins: [], updatedAt: fresh.updatedAt }), opts)).toBeNull();
    expect(decodeCache(JSON.stringify({ coins: 'x', updatedAt: fresh.updatedAt }), opts)).toBeNull();
    expect(decodeCache(JSON.stringify({ coins: [coin()], updatedAt: 'nope' }), opts)).toBeNull();
  });
  it('任何一個幣的欄位型別不對就整份丟掉', () => {
    const opts = { now: NOW, maxAgeMs: 5 * 60_000 };
    for (const bad of [{ symbol: 3 }, { price: 'NaN' }, { takerBuy: null }, { pair: undefined }]) {
      const raw = JSON.stringify({ ...fresh, coins: [coin(), coin(bad)] });
      expect(decodeCache(raw, opts), JSON.stringify(bad)).toBeNull();
    }
  });
});
