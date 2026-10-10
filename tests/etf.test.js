import { describe, it, expect } from 'vitest';
import {
  toNumber, normalizeDate, parseSnapshot, parseSummary, buildEtfDataset, validateEtfDataset,
  pickTopEtfs, mapEtfTown, ETF_ASSETS,
} from '../src/data/etf.js';
import { RANGES } from '../src/data/mapping.js';

const NOW = Date.UTC(2026, 9, 10, 2);
const snapshot = (over = {}) => ({
  date: '2026-10-08', ticker: 'IBIT', sponsor_fee: 0.0025, net_inflow: 50195600, cum_inflow: 61171454223.66,
  net_assets: 47337319120, mkt_price: 52.31, prem_dsc: -0.0004, value_traded: 2.1e9, volume: 4.0e7, ...over,
});
const meta = { asset: 'BTC', name: 'iShares Bitcoin Trust', exchange: 'NASDAQ' };
const fund = (over = {}) => ({ ...parseSnapshot(snapshot(), meta), ...over });

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

describe('parseSnapshot', () => {
  it('把 SoSoValue 快照轉成內部欄位', () => {
    expect(parseSnapshot(snapshot(), meta)).toEqual({
      ticker: 'IBIT', name: 'iShares Bitcoin Trust', exchange: 'NASDAQ', asset: 'BTC', date: '2026-10-08',
      netInflow: 50195600, cumInflow: 61171454223.66, netAssets: 47337319120, valueTraded: 2.1e9,
      price: 52.31, premium: -0.0004, fee: 0.0025,
    });
  });
  it('尚未結算的流入是 null 時保留 null，不當成 0', () => {
    expect(parseSnapshot(snapshot({ net_inflow: null }), meta).netInflow).toBeNull();
  });
  it('代號格式不對、資產規模無效時捨棄', () => {
    expect(parseSnapshot(snapshot({ ticker: '<img>' }), meta)).toBeNull();
    expect(parseSnapshot(snapshot({ net_assets: 0 }), meta)).toBeNull();
    expect(parseSnapshot(null, meta)).toBeNull();
  });
  it('名稱過長時截斷，非字串時改用代號', () => {
    expect(parseSnapshot(snapshot(), { ...meta, name: 'x'.repeat(200) }).name).toHaveLength(80);
    expect(parseSnapshot(snapshot(), { ...meta, name: 42 }).name).toBe('IBIT');
  });
});

describe('parseSummary', () => {
  it('跳過尚未結算（流入為 null）的最新一天，取最近一筆已結算資料', () => {
    const rows = [
      { date: '2026-10-09', total_net_inflow: null, total_value_traded: '1', total_net_assets: null, cum_net_inflow: null },
      { date: '2026-10-08', total_net_inflow: '-55066297.00', total_value_traded: '4706120449.00', total_net_assets: '56216535367.00', cum_net_inflow: '13534833596.09' },
    ];
    expect(parseSummary(rows)).toEqual({
      date: '2026-10-08', netInflow: -55066297, valueTraded: 4706120449, netAssets: 56216535367, cumInflow: 13534833596.09,
    });
  });
  it('沒有可用資料時回傳 null', () => {
    expect(parseSummary([])).toBeNull();
    expect(parseSummary(null)).toBeNull();
  });
});

describe('buildEtfDataset', () => {
  it('依資產規模由大到小排序，資料日期取最新的一天', () => {
    const small = fund({ ticker: 'ARKB', netAssets: 3e9, date: '2026-10-07' });
    const data = buildEtfDataset({ funds: [small, fund()], totals: { BTC: null }, now: NOW });
    expect(data.source).toBe('sosovalue');
    expect(data.updatedAt).toBe(new Date(NOW).toISOString());
    expect(data.asOf).toBe('2026-10-08');
    expect(data.etfs.map((e) => e.ticker)).toEqual(['IBIT', 'ARKB']);
  });
  it('同一代號只保留一筆', () => {
    const data = buildEtfDataset({ funds: [fund(), fund()], totals: {}, now: NOW });
    expect(data.etfs).toHaveLength(1);
  });
});

describe('validateEtfDataset', () => {
  const valid = () => buildEtfDataset({ funds: [fund(), fund({ ticker: 'ETHA', asset: 'ETH', netAssets: 9e9 })], totals: {}, now: NOW });
  it('格式正確時回傳整理過的資料', () => {
    const result = validateEtfDataset(JSON.parse(JSON.stringify(valid())));
    expect(result.etfs.map((e) => e.ticker)).toEqual(['IBIT', 'ETHA']);
  });
  it('丟掉格式不對的單筆基金，其他照常使用', () => {
    const data = valid();
    data.etfs.push({ ...data.etfs[0], ticker: 'bad ticker!' }, { ...data.etfs[0], ticker: 'XYZ', asset: 'DOGE' });
    expect(validateEtfDataset(data).etfs).toHaveLength(2);
  });
  it('數字欄位被竄改成非數字時改成 null', () => {
    const data = valid();
    data.etfs[0].netInflow = '<script>';
    expect(validateEtfDataset(data).etfs[0].netInflow).toBeNull();
  });
  it('來源不對、沒有基金或不是物件時回傳 null', () => {
    expect(validateEtfDataset({ ...valid(), source: 'other' })).toBeNull();
    expect(validateEtfDataset({ ...valid(), etfs: [] })).toBeNull();
    expect(validateEtfDataset('nope')).toBeNull();
    expect(validateEtfDataset(null)).toBeNull();
  });
  it('只接受支援的資產', () => {
    expect(ETF_ASSETS).toEqual(['BTC', 'ETH']);
  });
});

describe('pickTopEtfs', () => {
  it('取資產規模前 N 名並補上排名', () => {
    const etfs = [fund({ ticker: 'A', netAssets: 1e9 }), fund({ ticker: 'B', netAssets: 5e9 }), fund({ ticker: 'C', netAssets: 3e9 })];
    expect(pickTopEtfs(etfs, 2).map((e) => [e.ticker, e.rank])).toEqual([['B', 1], ['C', 2]]);
  });
});

describe('mapEtfTown', () => {
  const etfs = pickTopEtfs([
    fund({ ticker: 'IBIT', netAssets: 8e10, netInflow: 4e8, valueTraded: 3e9 }),
    fund({ ticker: 'GBTC', netAssets: 1.5e10, netInflow: -1e8, valueTraded: 4e8 }),
    fund({ ticker: 'BTCW', netAssets: 1.5e8, netInflow: null, valueTraded: 1e6 }),
  ]);
  const town = mapEtfTown(etfs);

  it('淨流入排在右側綠色隊伍、淨流出排在左側紅色隊伍，另一邊沒有人', () => {
    expect(town[0].buyQueue).toBe(RANGES.queue[1]);
    expect(town[0].sellQueue).toBe(0);
    expect(town[1].buyQueue).toBe(0);
    expect(town[1].sellQueue).toBeGreaterThan(0);
  });
  it('尚未結算時兩邊都沒有人，招牌顯示持平', () => {
    expect(town[2].buyQueue).toBe(0);
    expect(town[2].sellQueue).toBe(0);
    expect(town[2].trend).toBe('flat');
  });
  it('漲跌色依資金方向：流入綠、流出紅', () => {
    expect(town.map((m) => m.trend)).toEqual(['up', 'down', 'flat']);
  });
  it('路人依成交額，最大的最多', () => {
    expect(town[0].pedestrians).toBe(RANGES.pedestrians[1]);
    expect(town[2].pedestrians).toBe(RANGES.pedestrians[0]);
  });
  it('建築依 ETF 資產規模分級', () => {
    expect(town.map((m) => m.tier)).toEqual([1, 2, 4]);
  });
  it('每間店有唯一 id 與招牌文字', () => {
    expect(town[0].coin.id).toBe('etf:IBIT');
    expect(town[0].coin.symbol).toBe('IBIT');
    expect(town[0].sign).toEqual({ rank: 1, symbol: 'IBIT', primary: '$52.31', secondary: '+$400M' });
    expect(town[1].sign.secondary).toBe('-$100M');
    expect(town[2].sign.secondary).toBe('—');
  });
  it('空陣列回傳空陣列', () => {
    expect(mapEtfTown([])).toEqual([]);
  });
});
