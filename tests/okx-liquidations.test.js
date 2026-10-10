import { describe, it, expect, vi } from 'vitest';
import {
  parseCtVals, detailUsd, detailSide, summarize, fetchUnderlying, loadLiquidations, DAY_MS,
} from '../src/data/okx-liquidations.js';
import sampleLiqs from '../src/data/sample-liquidations.json';

const NOW = Date.UTC(2026, 9, 10, 12);
const detail = (over = {}) => ({ bkPx: '80000', sz: '2', posSide: 'long', side: 'sell', ts: String(NOW - 3600e3), ...over });
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: '0', data }) });

describe('parseCtVals', () => {
  it('只收 USDT 本位永續，對應 uly → 每張合約幾顆幣', () => {
    const map = parseCtVals([
      { instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', ctValCcy: 'BTC' },
      { instId: 'BTC-USD-SWAP', uly: 'BTC-USD', ctVal: '100', ctValCcy: 'USD' },
      { instId: 'DOGE-USDT-SWAP', uly: 'DOGE-USDT', ctVal: '1000', ctValCcy: 'DOGE' },
      { instId: 'BAD-USDT-SWAP', uly: 'BAD-USDT', ctVal: 'x', ctValCcy: 'BAD' },
    ]);
    expect([...map]).toEqual([['BTC-USDT', 0.01], ['DOGE-USDT', 1000]]);
  });
  it('非陣列輸入回傳空 Map', () => {
    expect(parseCtVals(null).size).toBe(0);
  });
});

describe('detailUsd / detailSide', () => {
  it('金額＝張數 × 每張幣數 × 破產價', () => {
    expect(detailUsd(detail(), 0.01)).toBe(1600);
  });
  it('無效數字回傳 0', () => {
    expect(detailUsd(detail({ sz: 'x' }), 0.01)).toBe(0);
  });
  it('優先看 posSide；單向持倉模式沒有 posSide 時，sell＝多單爆倉、buy＝空單爆倉', () => {
    expect(detailSide(detail({ posSide: 'short', side: 'buy' }))).toBe('short');
    expect(detailSide(detail({ posSide: '', side: 'sell' }))).toBe('long');
    expect(detailSide(detail({ posSide: '', side: 'buy' }))).toBe('short');
    expect(detailSide(detail({ posSide: '', side: '' }))).toBeNull();
  });
});

describe('summarize', () => {
  it('只算 24 小時內，依幣種加總並由大到小排序', () => {
    const result = summarize([
      { symbol: 'BTC', ctVal: 0.01, details: [detail(), detail({ posSide: 'short' }), detail({ ts: String(NOW - DAY_MS - 1) })] },
      { symbol: 'DOGE', ctVal: 1000, details: [detail({ bkPx: '0.1', sz: '100' })] },
      { symbol: 'ETH', ctVal: 0.1, details: [] },
    ], NOW);
    expect(result.long).toBe(1600 + 10000);
    expect(result.short).toBe(1600);
    expect(result.byCoin).toEqual([
      { symbol: 'DOGE', long: 10000, short: 0 },
      { symbol: 'BTC', long: 1600, short: 1600 },
      { symbol: 'ETH', long: 0, short: 0 },
    ]);
  });
});

describe('fetchUnderlying', () => {
  it('往前翻頁直到超過 24 小時或沒有資料', async () => {
    const pages = [
      [detail({ ts: String(NOW - 1000) }), detail({ ts: String(NOW - 5 * 3600e3) })],
      [detail({ ts: String(NOW - 10 * 3600e3) })],
      [detail({ ts: String(NOW - 30 * 3600e3) })],
      [detail({ ts: String(NOW - 40 * 3600e3) })],
    ];
    const urls = [];
    const fetchImpl = vi.fn(async (url) => {
      urls.push(url);
      return ok([{ details: pages[urls.length - 1] }]);
    });
    const { details, truncated } = await fetchUnderlying('BTC-USDT', { fetchImpl, now: NOW });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(details).toHaveLength(4);
    expect(truncated).toBe(false);
    expect(new URL(urls[1]).searchParams.get('after')).toBe(String(NOW - 5 * 3600e3));
  });
  it('OKX 回傳錯誤碼時丟出錯誤', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ code: '50011', msg: 'Too Many Requests', data: [] }) });
    await expect(fetchUnderlying('BTC-USDT', { fetchImpl, now: NOW })).rejects.toThrow(/50011/);
  });
  it('沒有任何爆倉時回傳空陣列', async () => {
    const fetchImpl = async () => ok([]);
    expect(await fetchUnderlying('TRX-USDT', { fetchImpl, now: NOW })).toEqual({ details: [], truncated: false });
  });
  it('翻到頁數上限仍未涵蓋 24 小時時標記為 truncated', async () => {
    const fetchImpl = async () => ok([{ details: [detail({ ts: String(NOW - 1000) })] }]);
    const result = await fetchUnderlying('BTC-USDT', { fetchImpl, now: NOW, maxPages: 3 });
    expect(result.details).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });
  it('時間戳不是數字時停止翻頁，不會送出 after=NaN', async () => {
    const urls = [];
    const fetchImpl = async (url) => { urls.push(url); return ok([{ details: [detail({ ts: 'oops' })] }]); };
    await fetchUnderlying('BTC-USDT', { fetchImpl, now: NOW });
    expect(urls).toHaveLength(1);
  });
});

describe('loadLiquidations', () => {
  const coins = [{ symbol: 'BTC' }, { symbol: 'XMR' }];
  it('抓合約面值與每個幣的爆倉，OKX 沒有的幣略過', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('instruments')) return ok([{ instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', ctValCcy: 'BTC' }]);
      const firstPage = !new URL(url).searchParams.has('after');
      return ok([{ details: firstPage ? [detail()] : [] }]);
    });
    const result = await loadLiquidations(coins, { fetchImpl, now: NOW });
    expect(result).toMatchObject({ source: 'okx', long: 1600, short: 0, byCoin: [{ symbol: 'BTC', long: 1600, short: 0 }] });
    expect(fetchImpl.mock.calls.some(([u]) => u.includes('XMR'))).toBe(false);
  });
  it('部分幣種失敗時，加總成功的幣並標記 partial', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('instruments')) {
        return ok([
          { instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', ctValCcy: 'BTC' },
          { instId: 'ETH-USDT-SWAP', uly: 'ETH-USDT', ctVal: '0.1', ctValCcy: 'ETH' },
        ]);
      }
      if (url.includes('ETH-USDT')) return { ok: false, status: 429 };
      const firstPage = !new URL(url).searchParams.has('after');
      return ok([{ details: firstPage ? [detail()] : [] }]);
    });
    const result = await loadLiquidations([{ symbol: 'BTC' }, { symbol: 'ETH' }], { fetchImpl, now: NOW });
    expect(result).toMatchObject({ source: 'okx', long: 1600, partial: true });
    expect(result.byCoin.map((c) => c.symbol)).toEqual(['BTC']);
  });
  it('所有幣種都失敗時改用範例資料', async () => {
    const fetchImpl = async (url) => (url.includes('instruments')
      ? ok([{ instId: 'BTC-USDT-SWAP', uly: 'BTC-USDT', ctVal: '0.01', ctValCcy: 'BTC' }])
      : { ok: false, status: 503 });
    const result = await loadLiquidations([{ symbol: 'BTC' }], { fetchImpl, now: NOW });
    expect(result.source).toBe('sample');
  });
  it('失敗時改用範例資料並附上錯誤', async () => {
    const fetchImpl = async () => ({ ok: false, status: 503 });
    const result = await loadLiquidations(coins, { fetchImpl, now: NOW });
    expect(result.source).toBe('sample');
    expect(result.long).toBe(sampleLiqs.long);
    expect(result.error).toMatch(/503/);
  });
});
