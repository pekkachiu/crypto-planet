import { describe, it, expect } from 'vitest';
import { isExcluded, pickCandidates, parseKlines, buildCoin, priceMatches } from '../src/data/normalize.js';

const market = (over = {}) => ({
  id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 82800,
  market_cap: 1.6e12, market_cap_rank: 1, total_volume: 3e10,
  price_change_percentage_24h: 1.25, image: 'https://x/btc.png', ...over,
});

describe('isExcluded', () => {
  it('排除黑名單裡的穩定幣', () => {
    expect(isExcluded(market({ id: 'tether', symbol: 'usdt', current_price: 1 }))).toBe(true);
  });
  it('排除包裝幣', () => {
    expect(isExcluded(market({ id: 'wrapped-bitcoin', symbol: 'wbtc' }))).toBe(true);
  });
  it('排除名單外但價格黏在 1 美元的疑似穩定幣', () => {
    expect(isExcluded(market({ id: 'new-usd', symbol: 'nusd', current_price: 1.001, price_change_percentage_24h: 0.02 }))).toBe(true);
  });
  it('保留一般幣種，即使價格剛好接近 1 但波動大', () => {
    expect(isExcluded(market({ id: 'cardano', symbol: 'ada', current_price: 0.99, price_change_percentage_24h: -4 }))).toBe(false);
  });
  it('保留比特幣', () => {
    expect(isExcluded(market())).toBe(false);
  });
});

describe('pickCandidates', () => {
  it('依市值排名排序並排除穩定幣，不改動原陣列', () => {
    const input = [
      market({ id: 'ethereum', symbol: 'eth', market_cap_rank: 2 }),
      market({ id: 'tether', symbol: 'usdt', market_cap_rank: 3, current_price: 1 }),
      market(),
    ];
    const snapshot = JSON.stringify(input);
    const out = pickCandidates(input);
    expect(out.map((c) => c.id)).toEqual(['bitcoin', 'ethereum']);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
  it('略過缺少必要欄位的資料', () => {
    expect(pickCandidates([market({ market_cap: null }), { foo: 1 }, null])).toEqual([]);
  });
  it('非陣列輸入回傳空陣列', () => {
    expect(pickCandidates(undefined)).toEqual([]);
  });
});

describe('parseKlines', () => {
  const row = (quote, takerBuy, trades) => [0, '1', '1', '1', '1', '1', 0, String(quote), trades, '1', String(takerBuy), '0'];
  it('加總 24 根 K 線的成交額、主動買入、主動賣出與筆數', () => {
    const flow = parseKlines([row(100, 60, 10), row(50, 10, 5)]);
    expect(flow).toEqual({ quoteVolume: 150, takerBuy: 70, takerSell: 80, trades: 15 });
  });
  it('空資料回傳零', () => {
    expect(parseKlines([])).toEqual({ quoteVolume: 0, takerBuy: 0, takerSell: 0, trades: 0 });
  });
  it('格式錯誤時丟出錯誤', () => {
    expect(() => parseKlines('oops')).toThrow(/K 線/);
    expect(() => parseKlines([['bad']])).toThrow(/K 線/);
  });
  it('null 或空字串不會被當成 0 混過去', () => {
    const row = [0, '1', '1', '1', '1', '1', 0, null, 10, '1', '', '0'];
    expect(() => parseKlines([row])).toThrow(/K 線/);
  });
});

describe('buildCoin', () => {
  it('合併市場資料與買賣量成統一格式', () => {
    const coin = buildCoin(market(), { quoteVolume: 150, takerBuy: 70, takerSell: 80, trades: 15 });
    expect(coin).toEqual({
      id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', price: 82800, marketCap: 1.6e12,
      rank: 1, change24h: 1.25, volume24h: 150, takerBuy: 70, takerSell: 80, trades: 15,
      pair: 'BTCUSDT',
    });
  });
});

describe('pickCandidates 的去重與排除', () => {
  const m = (id, symbol, rank) => ({ id, symbol, name: id, current_price: 5, market_cap: 1e9, market_cap_rank: rank });
  it('同一個代號只留市值排名最前面的（同名山寨幣會對到同一個 Binance 交易對）', () => {
    const picked = pickCandidates([m('doge-clone', 'doge', 900), m('dogecoin', 'doge', 9)]);
    expect(picked.map((x) => x.id)).toEqual(['dogecoin']);
  });
  it('排除指定的 id', () => {
    const picked = pickCandidates([m('bitcoin', 'btc', 1), m('tron', 'trx', 8)], { excludeIds: ['bitcoin'] });
    expect(picked.map((x) => x.id)).toEqual(['tron']);
  });
});

describe('priceMatches', () => {
  const rows = (close) => [[0, '1', '1', '1', close, '1', 0, '1', 1, '1', '1', '0']];
  it('最後一根 K 線收盤價跟市場價格接近時為 true', () => {
    expect(priceMatches(rows('100'), 104)).toBe(true);
  });
  it('差距過大（不同的幣）時為 false', () => {
    expect(priceMatches(rows('0.2'), 10)).toBe(false);
  });
  it('資料缺漏時為 false', () => {
    expect(priceMatches([], 10)).toBe(false);
    expect(priceMatches(rows('abc'), 10)).toBe(false);
    expect(priceMatches(rows('1'), 0)).toBe(false);
  });
});
