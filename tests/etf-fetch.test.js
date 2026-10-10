import { describe, it, expect, vi } from 'vitest';
import { fetchEtfDataset, SOSO_BASE } from '../src/data/etf-fetch.js';

const KEY = 'test-key-123';
const NOW = Date.UTC(2026, 9, 10, 2);
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: 0, message: 'success', data }) });
const fail = (status = 500) => () => ({ ok: false, status, json: async () => ({}) });
const summary = (assets) => [{ date: '2026-10-09', total_net_inflow: '1.5e8', total_value_traded: '3e9', total_net_assets: String(assets), cum_net_inflow: '6e10' }];
const LISTS = { BTC: ['IBIT', 'FBTC'], ETH: ['ETHA'], SOL: ['BSOL'], XRP: ['XRPZ'] };
const ASSETS = { BTC: 1e11, ETH: 1.5e10, SOL: 6e8, XRP: 4e8 };

/** overrides：key 是「資產/端點」，例如 'SOL/summary-history' */
function api(overrides = {}) {
  return vi.fn(async (url) => {
    const u = new URL(url);
    const asset = u.searchParams.get('symbol');
    const endpoint = u.pathname.endsWith('/etfs') ? 'list' : 'summary-history';
    const override = overrides[`${asset}/${endpoint}`];
    if (override) return override(u);
    if (endpoint === 'list') return ok(LISTS[asset].map((ticker) => ({ ticker, name: `${ticker} Trust`, exchange: 'NASDAQ' })));
    return ok(summary(ASSETS[asset]));
  });
}
const sleep = vi.fn(async () => {});
const run = (fetchImpl, over = {}) => fetchEtfDataset({ apiKey: KEY, fetchImpl, sleep, now: NOW, minIntervalMs: 0, ...over });

describe('fetchEtfDataset', () => {
  it('沒有 API Key 時直接失敗，不送出任何請求', async () => {
    const fetchImpl = api();
    await expect(run(fetchImpl, { apiKey: '' })).rejects.toThrow('SOSOVALUE_API_KEY');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('每個請求都用 header 帶 Key、不放網址，也不跟隨重新導向', async () => {
    const fetchImpl = api();
    await run(fetchImpl);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url.startsWith(`${SOSO_BASE}/etfs`)).toBe(true);
      expect(url).not.toContain(KEY);
      expect(init.headers['x-soso-api-key']).toBe(KEY);
      expect(init.redirect).toBe('error');
    }
  });

  it('每個幣種只抓清單與每日總計（4 種 × 2 = 8 個請求），整理成一棟一幣種', async () => {
    const fetchImpl = api();
    const data = await run(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(data.assets.map((a) => [a.asset, a.fundCount])).toEqual([['BTC', 2], ['ETH', 1], ['SOL', 1], ['XRP', 1]]);
    expect(data.assets[0]).toMatchObject({ netAssets: 1e11, netInflow: 1.5e8, tickers: ['IBIT', 'FBTC'] });
    expect(data.asOf).toBe('2026-10-09');
  });

  it('SOL、XRP 抓不到時略過那一棟，其他照常', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = await run(api({ 'SOL/summary-history': fail(), 'XRP/list': () => ok([]) }));
    expect(data.assets.map((a) => a.asset)).toEqual(['BTC', 'ETH']);
    warn.mockRestore();
  });

  it('BTC 或 ETH 抓不到時整體失敗，讓部署沿用上一次的資料', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(run(api({ 'ETH/summary-history': () => ok([]) }))).rejects.toThrow('ETH');
    await expect(run(api({ 'BTC/list': fail(401) }))).rejects.toThrow('BTC');
    warn.mockRestore();
  });

  it('被限流（429）時依 retry_after 或 Retry-After 等待後重試，最多等 120 秒', async () => {
    const limited = (body, headers = {}) => {
      let first = true;
      return () => {
        if (!first) return ok(summary(1e11));
        first = false;
        return { ok: false, status: 429, headers: new Headers(headers), json: async () => body };
      };
    };
    sleep.mockClear();
    await run(api({ 'BTC/summary-history': limited({ details: { retry_after: 7 } }) }));
    expect(sleep).toHaveBeenCalledWith(7000);
    sleep.mockClear();
    await run(api({ 'BTC/summary-history': limited({ details: { retry_after: 99999 } }) }));
    expect(sleep).toHaveBeenCalledWith(120_000);
    sleep.mockClear();
    await run(api({ 'BTC/summary-history': limited({}, { 'Retry-After': '9' }) }));
    expect(sleep).toHaveBeenCalledWith(9000);
  });

  it('請求之間至少間隔 minIntervalMs，避免超過每分鐘 20 次', async () => {
    sleep.mockClear();
    let clock = 0;
    await fetchEtfDataset({ apiKey: KEY, fetchImpl: api(), sleep: async (ms) => { clock += ms; sleep(ms); }, now: NOW, minIntervalMs: 3100, clock: () => clock });
    expect(sleep.mock.calls.filter(([ms]) => ms === 3100)).toHaveLength(7);
  });

  it('API 錯誤時訊息帶狀態碼但不含 Key；HTTP 成功但 code 不是 0 也算失敗', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ code: 400101, message: 'API Key is invalid' }) });
    const err = await run(api({ 'BTC/list': unauthorized })).catch((e) => e);
    expect(err.message).toContain('401');
    expect(err.message).not.toContain(KEY);
    const badCode = () => ({ ok: true, status: 200, json: async () => ({ code: 400003, message: 'Invalid parameter: symbol' }) });
    await expect(run(api({ 'ETH/list': badCode }))).rejects.toThrow('400003');
    warn.mockRestore();
  });
});
