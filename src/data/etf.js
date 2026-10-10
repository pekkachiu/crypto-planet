import { RANGES, scaleSqrt } from './mapping.js';
import { ETF_TIERS, tierOf, tierProgress } from './tiers.js';
import { formatUsd, formatSignedUsd } from '../ui/format.js';

/**
 * ETF 星的資料：SoSoValue 的美國現貨加密貨幣 ETF，依幣種加總，一個幣種一棟。
 * GitHub Actions 每天用 API Key 抓一次（scripts/fetch-etf.mjs），整理成 etf.json 跟網站一起部署；
 * 瀏覽器只讀這份 JSON，看不到 Key。這裡都是純函式，抓取端與網頁端共用。
 */
export const ETF_ASSETS = Object.freeze(['BTC', 'ETH', 'SOL', 'XRP']);
/** 這兩種抓不到就整體失敗（沿用上一次的資料）；其他幣種抓不到只略過那一棟 */
export const REQUIRED_ASSETS = Object.freeze(['BTC', 'ETH']);
export const ETF_SOURCE = 'sosovalue';
/** 代號開頭必須是英數字，'.'、'..' 不會被當成代號 */
export const TICKER_RE = /^[A-Z0-9][A-Z0-9.]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TICKERS = 30;
/** 時間戳記小於這個值就當成秒 */
const SECONDS_LIMIT = 1e11;

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** SoSoValue 的日期有時是 YYYY-MM-DD 字串、有時是時間戳記，統一成 UTC 的 YYYY-MM-DD */
export function normalizeDate(value) {
  if (typeof value === 'string' && DATE_RE.test(value)) return value;
  const n = toNumber(value);
  if (n === null || n <= 0) return null;
  return new Date(n < SECONDS_LIMIT ? n * 1000 : n).toISOString().slice(0, 10);
}

/**
 * 一個幣種所有 ETF 的每日總計：最新一天可能還沒結算（流入為 null），取最近一筆已結算的。
 * 資產規模無效時回傳 null。
 */
export function parseSummary(rows) {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => toNumber(r?.total_net_inflow) !== null);
  const netAssets = toNumber(row?.total_net_assets);
  if (!row || !(netAssets > 0)) return null;
  return {
    date: normalizeDate(row.date),
    netInflow: toNumber(row.total_net_inflow),
    valueTraded: toNumber(row.total_value_traded),
    netAssets,
    cumInflow: toNumber(row.cum_net_inflow),
  };
}

/** ETF 清單 → 格式正確、不重複的代號（只用來在資訊卡上列出有哪幾檔） */
export function parseTickers(list) {
  if (!Array.isArray(list)) return [];
  const tickers = list
    .map((item) => (typeof item?.ticker === 'string' ? item.ticker.trim().toUpperCase() : ''))
    .filter((ticker) => TICKER_RE.test(ticker));
  return [...new Set(tickers)].slice(0, MAX_TICKERS);
}

const byAssetsDesc = (a, b) => b.netAssets - a.netAssets;

export function buildEtfDataset({ groups, now = Date.now() }) {
  const assets = [...groups].sort(byAssetsDesc);
  const dates = assets.map((a) => a.date).filter(Boolean).sort();
  return { source: ETF_SOURCE, updatedAt: new Date(now).toISOString(), asOf: dates.at(-1) ?? null, assets };
}

const NUMBER_FIELDS = ['netInflow', 'valueTraded', 'cumInflow', 'fundCount'];

function sanitizeGroup(raw) {
  if (!raw || typeof raw !== 'object' || !ETF_ASSETS.includes(raw.asset)) return null;
  const netAssets = typeof raw.netAssets === 'number' ? toNumber(raw.netAssets) : null;
  if (!(netAssets > 0)) return null;
  const numbers = Object.fromEntries(NUMBER_FIELDS.map((k) => [k, typeof raw[k] === 'number' ? toNumber(raw[k]) : null]));
  const tickers = Array.isArray(raw.tickers) ? raw.tickers.filter((x) => typeof x === 'string' && TICKER_RE.test(x)).slice(0, MAX_TICKERS) : [];
  return { asset: raw.asset, date: normalizeDate(raw.date), netAssets, ...numbers, tickers };
}

/** 網頁讀到的 etf.json 不信任：逐欄檢查型別，格式不對或重複的幣種直接丟掉 */
export function validateEtfDataset(json) {
  if (!json || typeof json !== 'object' || json.source !== ETF_SOURCE || !Array.isArray(json.assets)) return null;
  const seen = new Set();
  const assets = json.assets
    .map(sanitizeGroup)
    .filter((g) => g && !seen.has(g.asset) && seen.add(g.asset))
    .sort(byAssetsDesc);
  if (assets.length === 0) return null;
  const updatedAt = typeof json.updatedAt === 'string' && !Number.isNaN(Date.parse(json.updatedAt)) ? json.updatedAt : null;
  return { source: ETF_SOURCE, updatedAt, asOf: normalizeDate(json.asOf), assets };
}

export function rankAssets(groups) {
  return [...groups].sort(byAssetsDesc).map((g, i) => ({ ...g, rank: i + 1 }));
}

function flowTrend(netInflow) {
  if (netInflow > 0) return 'up';
  if (netInflow < 0) return 'down';
  return 'flat';
}

/**
 * ETF 小鎮的畫面參數（一個幣種一棟）：
 * 右側綠色隊伍＝淨流入、左側紅色隊伍＝淨流出（只有一邊有人），路人與叫號速度＝成交額，建築＝總資產規模。
 */
export function mapEtfTown(groups) {
  if (groups.length === 0) return [];
  const traded = groups.map((g) => g.valueTraded ?? 0);
  const [vMin, vMax] = [Math.min(...traded), Math.max(...traded)];
  const flowMax = Math.max(...groups.map((g) => Math.abs(g.netInflow ?? 0)));
  const queue = (v) => (v > 0 && flowMax > 0 ? Math.round(scaleSqrt(v, 0, flowMax, ...RANGES.queue)) : 0);

  return groups.map((g) => {
    const flow = g.netInflow ?? 0;
    const volume = g.valueTraded ?? 0;
    return {
      coin: { ...g, id: `etf:${g.asset}`, symbol: g.asset },
      pedestrians: Math.round(scaleSqrt(volume, vMin, vMax, ...RANGES.pedestrians)),
      buyQueue: queue(flow),
      sellQueue: queue(-flow),
      callInterval: scaleSqrt(volume, vMin, vMax, ...RANGES.callInterval),
      tier: tierOf(g.netAssets, ETF_TIERS),
      tierProgress: tierProgress(g.netAssets, ETF_TIERS),
      trend: flowTrend(g.netInflow),
      sign: { rank: g.rank, symbol: g.asset, primary: formatUsd(g.netAssets), secondary: formatSignedUsd(g.netInflow) },
    };
  });
}

/** 部署時產生的 etf.json，跟網頁放在同一個網站（相對路徑，GitHub Pages 子路徑也能用） */
export const ETF_DATA_URL = './data/etf.json';

/** 讀取並驗證 etf.json；沒有檔案或格式不對時回傳 null，ETF 星維持上鎖 */
export async function loadEtfDataset({ fetchImpl = fetch, url = ETF_DATA_URL } = {}) {
  try {
    const res = await fetchImpl(url, { cache: 'no-cache' });
    if (!res.ok) {
      console.warn(`[crypto-planet] ETF 資料無法取得（HTTP ${res.status}）`);
      return null;
    }
    const data = validateEtfDataset(await res.json());
    if (!data) console.warn('[crypto-planet] ETF 資料格式不正確');
    return data;
  } catch (err) {
    console.warn('[crypto-planet] ETF 資料讀取失敗', err);
    return null;
  }
}
