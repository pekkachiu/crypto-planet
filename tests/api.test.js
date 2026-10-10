import { describe, it, expect, vi } from 'vitest';
import { fetchJson, loadTopCoins } from '../src/data/api.js';
import sample from '../src/data/sample.json';

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });
const market = (id, symbol, rank, over = {}) => ({
  id, symbol, name: id, current_price: 10, market_cap: 1e9 / rank, market_cap_rank: rank,
  total_volume: 1e6, price_change_percentage_24h: 1, ...over,
});
const kline = [[0, '1', '1', '1', '1', '1', 0, '100', 10, '1', '60', '0']];

function fakeFetch({ markets, missing = [], delisted = [], failMarkets = false }) {
  return vi.fn(async (url) => {
    if (url.includes('coingecko')) {
      if (failMarkets) return { ok: false, status: 429, json: async () => ({}) };
      return okResponse(markets);
    }
    const symbol = new URL(url).searchParams.get('symbol');
    if (missing.includes(symbol)) return { ok: false, status: 400, json: async () => ({}) };
    if (delisted.includes(symbol)) return okResponse([]);
    return okResponse(kline);
  });
}

describe('fetchJson', () => {
  it('HTTP 錯誤時丟出含狀態碼的錯誤', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(fetchJson('https://x', { fetchImpl: f })).rejects.toThrow(/500/);
  });
  it('逾時時中止請求', async () => {
    const f = vi.fn((_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await expect(fetchJson('https://x', { fetchImpl: f, timeoutMs: 10 })).rejects.toThrow();
  });
});

describe('loadTopCoins', () => {
  it('跳過穩定幣與 Binance 沒有交易對的幣，取前 N 名', async () => {
    const markets = [
      market('bitcoin', 'btc', 1),
      market('tether', 'usdt', 2, { current_price: 1, price_change_percentage_24h: 0 }),
      market('figure-heloc', 'figr_heloc', 3),
      market('ethereum', 'eth', 4),
      market('solana', 'sol', 5),
    ];
    const fetchImpl = fakeFetch({ markets, missing: ['FIGR_HELOCUSDT'] });
    const result = await loadTopCoins({ fetchImpl, topN: 2 });
    expect(result.source).toBe('live');
    expect(result.coins.map((c) => c.symbol)).toEqual(['BTC', 'ETH']);
    expect(result.coins[0]).toMatchObject({ volume24h: 100, takerBuy: 60, takerSell: 40, trades: 10 });
    expect(typeof result.updatedAt).toBe('string');
  });
  it('只抓最近 24 小時的 K 線，已下架（回傳空陣列）的幣不列入', async () => {
    const markets = [market('monero', 'xmr', 1), market('bitcoin', 'btc', 2)];
    const fetchImpl = fakeFetch({ markets, delisted: ['XMRUSDT'] });
    const now = Date.UTC(2026, 9, 10);
    const result = await loadTopCoins({ fetchImpl, topN: 2, now });
    expect(result.coins.map((c) => c.symbol)).toEqual(['BTC']);
    const klineUrl = new URL(fetchImpl.mock.calls.find(([u]) => u.includes('BTCUSDT'))[0]);
    expect(klineUrl.searchParams.get('startTime')).toBe(String(now - 24 * 3600 * 1000));
  });
  it('CoinGecko 失敗時改用範例資料並附上錯誤訊息', async () => {
    const fetchImpl = fakeFetch({ failMarkets: true });
    const result = await loadTopCoins({ fetchImpl });
    expect(result.source).toBe('sample');
    expect(result.error).toMatch(/429/);
    expect(result.coins).toEqual(sample.coins);
  });
  it('有效幣種為零時也改用範例資料', async () => {
    const fetchImpl = fakeFetch({ markets: [market('btc', 'btc', 1)], missing: ['BTCUSDT'] });
    const result = await loadTopCoins({ fetchImpl });
    expect(result.source).toBe('sample');
  });
});
