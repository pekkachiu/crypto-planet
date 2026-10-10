import { describe, it, expect, vi } from 'vitest';
import {
  toNumber, normalizeDate, parseSummary, parseTickers, buildEtfDataset, validateEtfDataset,
  rankAssets, mapEtfTown, ETF_ASSETS, REQUIRED_ASSETS, loadEtfDataset, ETF_DATA_URL,
} from '../src/data/etf.js';
import { RANGES } from '../src/data/mapping.js';

const NOW = Date.UTC(2026, 9, 10, 2);
const group = (over = {}) => ({
  asset: 'BTC', date: '2026-10-09', netInflow: 2.1e7, valueTraded: 1.44e9, netAssets: 1.058e11, cumInflow: 5.7e10,
  fundCount: 12, tickers: ['IBIT', 'FBTC', 'GBTC'], ...over,
});

describe('toNumber', () => {
  it('接受數字與數字字串，其他回傳 null', () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber('-55066297.0000000000000000')).toBe(-55066297);
    expect(toNumber(null)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
    expect(toNumber(Infinity)).toBeNull();
  });
});

describe('normalizeDate', () => {
  it('YYYY-MM-DD 字串原樣回傳', () => {
    expect(normalizeDate('2026-10-08')).toBe('2026-10-08');
  });
  it('毫秒或秒的時間戳記轉成 UTC 日期', () => {
    expect(normalizeDate(Date.UTC(2026, 9, 8))).toBe('2026-10-08');
    expect(normalizeDate(Date.UTC(2026, 9, 8) / 1000)).toBe('2026-10-08');
  });
  it('無法辨識的值回傳 null', () => {
    expect(normalizeDate('10/08/2026')).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(-1)).toBeNull();
  });
});

describe('ETF_ASSETS', () => {
  it('BTC、ETH、SOL、XRP 各一棟，BTC 與 ETH 一定要有', () => {
    expect(ETF_ASSETS).toEqual(['BTC', 'ETH', 'SOL', 'XRP']);
    expect(REQUIRED_ASSETS).toEqual(['BTC', 'ETH']);
  });
});

describe('parseSummary', () => {
  it('跳過尚未結算（流入為 null）的最新一天，取最近一筆已結算資料', () => {
    const rows = [
      { date: '2026-10-10', total_net_inflow: null, total_value_traded: '1', total_net_assets: null, cum_net_inflow: null },
      { date: '2026-10-09', total_net_inflow: '-55066297.00', total_value_traded: '4706120449.00', total_net_assets: '56216535367.00', cum_net_inflow: '13534833596.09' },
    ];
    expect(parseSummary(rows)).toEqual({
      date: '2026-10-09', netInflow: -55066297, valueTraded: 4706120449, netAssets: 56216535367, cumInflow: 13534833596.09,
    });
  });
  it('沒有可用資料或資產規模無效時回傳 null', () => {
    expect(parseSummary([])).toBeNull();
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary([{ date: '2026-10-09', total_net_inflow: 1, total_net_assets: 0 }])).toBeNull();
  });
});

describe('parseTickers', () => {
  it('只保留格式正確的代號（不收 . 或 .. 開頭），去重複', () => {
    expect(parseTickers([{ ticker: 'ibit' }, { ticker: 'IBIT' }, { ticker: '..' }, { ticker: '<b>' }, null, { ticker: 'BRK.B' }]))
      .toEqual(['IBIT', 'BRK.B']);
  });
  it('非陣列回傳空陣列', () => {
    expect(parseTickers(undefined)).toEqual([]);
  });
});

describe('buildEtfDataset', () => {
  it('依資產規模由大到小排序，資料日期取最新的一天', () => {
    const data = buildEtfDataset({ groups: [group({ asset: 'ETH', netAssets: 1.5e10, date: '2026-10-08' }), group()], now: NOW });
    expect(data.source).toBe('sosovalue');
    expect(data.updatedAt).toBe(new Date(NOW).toISOString());
    expect(data.asOf).toBe('2026-10-09');
    expect(data.assets.map((a) => a.asset)).toEqual(['BTC', 'ETH']);
  });
});

describe('validateEtfDataset', () => {
  const valid = () => buildEtfDataset({ groups: [group(), group({ asset: 'ETH', netAssets: 1.5e10 })], now: NOW });
  it('格式正確時回傳整理過的資料', () => {
    const result = validateEtfDataset(JSON.parse(JSON.stringify(valid())));
    expect(result.assets.map((a) => a.asset)).toEqual(['BTC', 'ETH']);
    expect(result.assets[0].tickers).toEqual(['IBIT', 'FBTC', 'GBTC']);
  });
  it('丟掉不支援或資產規模無效的幣種、重複的幣種', () => {
    const data = valid();
    data.assets.push(group({ asset: 'DOGE' }), group({ asset: 'SOL', netAssets: -1 }), group());
    expect(validateEtfDataset(data).assets.map((a) => a.asset)).toEqual(['BTC', 'ETH']);
  });
  it('數字欄位被竄改成非數字時改成 null；代號清單過濾掉惡意字串', () => {
    const data = valid();
    data.assets[0].netInflow = '<script>';
    data.assets[0].fundCount = 'x';
    data.assets[0].tickers = ['IBIT', '<img src=x>', 42];
    const [btc] = validateEtfDataset(data).assets;
    expect(btc.netInflow).toBeNull();
    expect(btc.fundCount).toBeNull();
    expect(btc.tickers).toEqual(['IBIT']);
  });
  it('來源不對、沒有幣種或不是物件時回傳 null', () => {
    expect(validateEtfDataset({ ...valid(), source: 'other' })).toBeNull();
    expect(validateEtfDataset({ ...valid(), assets: [] })).toBeNull();
    expect(validateEtfDataset('nope')).toBeNull();
    expect(validateEtfDataset(null)).toBeNull();
  });
});

describe('rankAssets', () => {
  it('依資產規模排序並補上排名', () => {
    const ranked = rankAssets([group({ asset: 'SOL', netAssets: 5e8 }), group()]);
    expect(ranked.map((a) => [a.asset, a.rank])).toEqual([['BTC', 1], ['SOL', 2]]);
  });
});

describe('mapEtfTown', () => {
  const town = mapEtfTown(rankAssets([
    group({ asset: 'BTC', netAssets: 1.06e11, netInflow: 2.1e7, valueTraded: 1.44e9 }),
    group({ asset: 'ETH', netAssets: 1.57e10, netInflow: -5.6e7, valueTraded: 5.9e8 }),
    group({ asset: 'XRP', netAssets: 4e8, netInflow: null, valueTraded: 1e7 }),
  ]));

  it('淨流入排右側綠色隊伍、淨流出排左側紅色隊伍，另一邊沒有人', () => {
    expect(town[0].buyQueue).toBeGreaterThan(0);
    expect(town[0].sellQueue).toBe(0);
    expect(town[1].buyQueue).toBe(0);
    expect(town[1].sellQueue).toBe(RANGES.queue[1]);
  });
  it('尚未結算時兩邊都沒有人，顯示持平', () => {
    expect([town[2].buyQueue, town[2].sellQueue, town[2].trend]).toEqual([0, 0, 'flat']);
  });
  it('漲跌色依資金方向：流入綠、流出紅', () => {
    expect(town.map((m) => m.trend)).toEqual(['up', 'down', 'flat']);
  });
  it('路人依成交額', () => {
    expect(town[0].pedestrians).toBe(RANGES.pedestrians[1]);
    expect(town[2].pedestrians).toBe(RANGES.pedestrians[0]);
  });
  it('建築依該幣種 ETF 總資產規模分級', () => {
    expect(town.map((m) => m.tier)).toEqual([1, 2, 4]);
  });
  it('每棟有唯一 id；招牌顯示幣種、總資產規模與淨流入', () => {
    expect(town[0].coin.id).toBe('etf:BTC');
    expect(town[0].coin.symbol).toBe('BTC');
    expect(town[0].sign).toEqual({ rank: 1, symbol: 'BTC', primary: '$106B', secondary: '+$21.0M' });
    expect(town[1].sign.secondary).toBe('-$56.0M');
    expect(town[2].sign.secondary).toBe('—');
  });
  it('空陣列回傳空陣列', () => {
    expect(mapEtfTown([])).toEqual([]);
  });
});

describe('loadEtfDataset', () => {
  const dataset = () => buildEtfDataset({ groups: [group()], now: NOW });
  it('讀取同網站的 etf.json，不帶快取並驗證格式', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => dataset() }));
    const data = await loadEtfDataset({ fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(ETF_DATA_URL, { cache: 'no-cache' });
    expect(ETF_DATA_URL).toBe('./data/etf.json');
    expect(data.assets[0].asset).toBe('BTC');
  });
  it('檔案不存在、格式錯誤或網路失敗時回傳 null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadEtfDataset({ fetchImpl: async () => ({ ok: false, status: 404 }) })).toBeNull();
    expect(await loadEtfDataset({ fetchImpl: async () => ({ ok: true, json: async () => ({ source: 'x' }) }) })).toBeNull();
    expect(await loadEtfDataset({ fetchImpl: async () => { throw new Error('offline'); } })).toBeNull();
    warn.mockRestore();
  });
});
