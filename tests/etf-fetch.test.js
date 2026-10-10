import { describe, it, expect, vi } from 'vitest';
import { fetchEtfDataset, SOSO_BASE } from '../src/data/etf-fetch.js';

const KEY = 'test-key-123';
const NOW = Date.UTC(2026, 9, 10, 2);
const ok = (data) => ({ ok: true, status: 200, json: async () => ({ code: 0, message: 'success', data }) });
const snap = (ticker, netAssets, netInflow = 1e7) => ({
  date: '2026-10-08', ticker, net_inflow: netInflow, cum_inflow: 1e9, net_assets: netAssets,
  mkt_price: 40, prem_dsc: 0, value_traded: 1e8, volume: 1e6, sponsor_fee: 0.0025,
});
const LISTS = {
  BTC: [{ ticker: 'IBIT', name: 'iShares Bitcoin Trust', exchange: 'NASDAQ' }, { ticker: 'FBTC', name: 'Fidelity', exchange: 'CBOE' }],
  ETH: [{ ticker: 'ETHA', name: 'iShares Ethereum Trust', exchange: 'NASDAQ' }],
};
const SNAPS = { IBIT: snap('IBIT', 8e10), FBTC: snap('FBTC', 2e10), ETHA: snap('ETHA', 1e10) };
const SUMMARY = [{ date: '2026-10-08', total_net_inflow: '1.5e8', total_value_traded: '3e9', total_net_assets: '1.2e11', cum_net_inflow: '6e10' }];

function api(overrides = {}) {
  return vi.fn(async (url) => {
    const u = new URL(url);
    for (const [pattern, handler] of Object.entries(overrides)) {
      const response = u.pathname.includes(pattern) ? handler(u) : null;
      if (response) return response;
    }
    if (u.pathname.endsWith('/etfs')) return ok(LISTS[u.searchParams.get('symbol')]);
    if (u.pathname.endsWith('/summary-history')) return ok(SUMMARY);
    const ticker = u.pathname.match(/\/etfs\/([^/]+)\/market-snapshot$/)?.[1];
    return ok(SNAPS[ticker]);
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

  it('每個請求都用 x-soso-api-key header 帶 Key，不放在網址裡', async () => {
    const fetchImpl = api();
    await run(fetchImpl);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url.startsWith(SOSO_BASE)).toBe(true);
      expect(url).not.toContain(KEY);
      expect(init.headers['x-soso-api-key']).toBe(KEY);
    }
  });

  it('抓 BTC 與 ETH 的美國 ETF 清單、每檔快照與類別總計', async () => {
    const data = await run(api());
    expect(data.etfs.map((e) => [e.ticker, e.asset])).toEqual([['IBIT', 'BTC'], ['FBTC', 'BTC'], ['ETHA', 'ETH']]);
    expect(data.totals.BTC.netInflow).toBe(1.5e8);
    expect(data.asOf).toBe('2026-10-08');
    expect(data.updatedAt).toBe(new Date(NOW).toISOString());
  });

  it('清單裡格式不對的代號不會被拼進網址', async () => {
    const fetchImpl = api({ '/etfs': (u) => (u.pathname.endsWith('/etfs') ? ok([{ ticker: '../../admin' }, ...LISTS[u.searchParams.get('symbol')]]) : null) });
    const data = await run(fetchImpl);
    expect(fetchImpl.mock.calls.some(([url]) => url.includes('admin'))).toBe(false);
    expect(data.etfs).toHaveLength(3);
  });

  it('單一基金失敗時略過，其他照常', async () => {
    const data = await run(api({ '/FBTC/': () => ({ ok: false, status: 500, json: async () => ({}) }) }));
    expect(data.etfs.map((e) => e.ticker)).toEqual(['IBIT', 'ETHA']);
  });

  it('超過一半的基金失敗時整體失敗，保留上一次的資料', async () => {
    const fail = () => ({ ok: false, status: 500, json: async () => ({}) });
    await expect(run(api({ '/IBIT/': fail, '/FBTC/': fail }))).rejects.toThrow('2/3');
  });

  it('被限流（429）時依 retry_after 等待後重試', async () => {
    let first = true;
    const fetchImpl = api({
      '/IBIT/': () => {
        if (!first) return ok(SNAPS.IBIT);
        first = false;
        return { ok: false, status: 429, json: async () => ({ code: 42901, details: { retry_after: 7 } }) };
      },
    });
    sleep.mockClear();
    const data = await run(fetchImpl);
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(data.etfs).toHaveLength(3);
  });

  it('請求之間至少間隔 minIntervalMs，避免超過每分鐘 20 次', async () => {
    sleep.mockClear();
    let clock = 0;
    await fetchEtfDataset({ apiKey: KEY, fetchImpl: api(), sleep: async (ms) => { clock += ms; sleep(ms); }, now: NOW, minIntervalMs: 3100, clock: () => clock });
    // 7 個請求：2 份清單＋2 份總計＋3 份快照，第一個之後每個都要等
    expect(sleep.mock.calls.filter(([ms]) => ms === 3100)).toHaveLength(6);
  });

  it('API 回傳錯誤代碼時，錯誤訊息不含 Key', async () => {
    const fetchImpl = api({ '/etfs': () => ({ ok: false, status: 401, json: async () => ({ code: 400101, message: 'API Key is invalid' }) }) });
    const err = await run(fetchImpl).catch((e) => e);
    expect(err.message).toContain('401');
    expect(err.message).not.toContain(KEY);
  });

  it('HTTP 成功但 code 不是 0 時視為失敗', async () => {
    const fetchImpl = api({ '/summary-history': () => ({ ok: true, status: 200, json: async () => ({ code: 400003, message: 'Invalid parameter: symbol' }) }) });
    await expect(run(fetchImpl)).rejects.toThrow('400003');
  });
});
