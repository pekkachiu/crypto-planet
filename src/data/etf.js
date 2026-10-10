import { RANGES, scaleSqrt } from './mapping.js';
import { ETF_TIERS, tierOf, tierProgress } from './tiers.js';
import { TOP_N } from './config.js';
import { formatPrice, formatSignedUsd } from '../ui/format.js';

/**
 * ETF 星的資料：SoSoValue 的美國現貨 BTC／ETH ETF。
 * GitHub Actions 每天用 API Key 抓一次（scripts/fetch-etf.mjs），整理成 etf.json 跟網站一起部署；
 * 瀏覽器只讀這份 JSON，看不到 Key。這裡都是純函式，抓取端與網頁端共用。
 */
export const ETF_ASSETS = Object.freeze(['BTC', 'ETH']);
export const ETF_SOURCE = 'sosovalue';
const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME = 80;
const MAX_EXCHANGE = 20;
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

const text = (value, max, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback);

/** 一檔 ETF 的最新已結算快照 → 內部欄位；代號或資產規模無效時回傳 null */
export function parseSnapshot(raw, { asset, name, exchange }) {
  if (!raw || typeof raw !== 'object') return null;
  const ticker = typeof raw.ticker === 'string' ? raw.ticker.trim().toUpperCase() : '';
  const netAssets = toNumber(raw.net_assets);
  if (!TICKER_RE.test(ticker) || !(netAssets > 0)) return null;
  return {
    ticker,
    name: text(name, MAX_NAME, ticker),
    exchange: text(exchange, MAX_EXCHANGE, ''),
    asset,
    date: normalizeDate(raw.date),
    netInflow: toNumber(raw.net_inflow),
    cumInflow: toNumber(raw.cum_inflow),
    netAssets,
    valueTraded: toNumber(raw.value_traded),
    price: toNumber(raw.mkt_price),
    premium: toNumber(raw.prem_dsc),
    fee: toNumber(raw.sponsor_fee),
  };
}

/** 整個類別的每日總計：最新一天可能還沒結算（流入為 null），取最近一筆已結算的 */
export function parseSummary(rows) {
  if (!Array.isArray(rows)) return null;
  const row = rows.find((r) => toNumber(r?.total_net_inflow) !== null);
  if (!row) return null;
  return {
    date: normalizeDate(row.date),
    netInflow: toNumber(row.total_net_inflow),
    valueTraded: toNumber(row.total_value_traded),
    netAssets: toNumber(row.total_net_assets),
    cumInflow: toNumber(row.cum_net_inflow),
  };
}

const byAssetsDesc = (a, b) => b.netAssets - a.netAssets;

export function buildEtfDataset({ funds, totals, now = Date.now() }) {
  const seen = new Set();
  const etfs = funds.filter((f) => f && !seen.has(f.ticker) && seen.add(f.ticker)).sort(byAssetsDesc);
  const dates = etfs.map((e) => e.date).filter(Boolean).sort();
  return {
    source: ETF_SOURCE,
    updatedAt: new Date(now).toISOString(),
    asOf: dates.at(-1) ?? null,
    totals,
    etfs,
  };
}

const NUMBER_FIELDS = ['netInflow', 'cumInflow', 'valueTraded', 'price', 'premium', 'fee'];

function sanitizeFund(raw) {
  if (!raw || typeof raw !== 'object' || !ETF_ASSETS.includes(raw.asset)) return null;
  const ticker = typeof raw.ticker === 'string' ? raw.ticker : '';
  const netAssets = toNumber(raw.netAssets);
  if (!TICKER_RE.test(ticker) || !(netAssets > 0)) return null;
  const numbers = Object.fromEntries(NUMBER_FIELDS.map((k) => [k, typeof raw[k] === 'number' ? toNumber(raw[k]) : null]));
  return {
    ticker,
    name: text(raw.name, MAX_NAME, ticker),
    exchange: text(raw.exchange, MAX_EXCHANGE, ''),
    asset: raw.asset,
    date: normalizeDate(raw.date),
    netAssets,
    ...numbers,
  };
}

function sanitizeTotal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pick = (k) => (typeof raw[k] === 'number' ? toNumber(raw[k]) : null);
  return { date: normalizeDate(raw.date), netInflow: pick('netInflow'), valueTraded: pick('valueTraded'), netAssets: pick('netAssets'), cumInflow: pick('cumInflow') };
}

/** 網頁讀到的 etf.json 不信任：逐欄檢查型別，格式不對的基金直接丟掉 */
export function validateEtfDataset(json) {
  if (!json || typeof json !== 'object' || json.source !== ETF_SOURCE || !Array.isArray(json.etfs)) return null;
  const etfs = json.etfs.map(sanitizeFund).filter(Boolean).sort(byAssetsDesc);
  if (etfs.length === 0) return null;
  const totals = Object.fromEntries(ETF_ASSETS.map((a) => [a, sanitizeTotal(json.totals?.[a])]));
  const updatedAt = typeof json.updatedAt === 'string' && !Number.isNaN(Date.parse(json.updatedAt)) ? json.updatedAt : null;
  return { source: ETF_SOURCE, updatedAt, asOf: normalizeDate(json.asOf), totals, etfs };
}

export function pickTopEtfs(etfs, n = TOP_N) {
  return [...etfs].sort(byAssetsDesc).slice(0, n).map((e, i) => ({ ...e, rank: i + 1 }));
}

function flowTrend(netInflow) {
  if (netInflow > 0) return 'up';
  if (netInflow < 0) return 'down';
  return 'flat';
}

/**
 * ETF 小鎮的畫面參數：
 * 右側綠色隊伍＝淨流入、左側紅色隊伍＝淨流出（只有一邊有人），路人與叫號速度＝成交額，建築＝資產規模。
 */
export function mapEtfTown(etfs) {
  if (etfs.length === 0) return [];
  const traded = etfs.map((e) => e.valueTraded ?? 0);
  const [vMin, vMax] = [Math.min(...traded), Math.max(...traded)];
  const flowMax = Math.max(...etfs.map((e) => Math.abs(e.netInflow ?? 0)));
  const queue = (v) => (v > 0 && flowMax > 0 ? Math.round(scaleSqrt(v, 0, flowMax, ...RANGES.queue)) : 0);

  return etfs.map((etf) => {
    const flow = etf.netInflow ?? 0;
    const volume = etf.valueTraded ?? 0;
    return {
      coin: { ...etf, id: `etf:${etf.ticker}`, symbol: etf.ticker },
      pedestrians: Math.round(scaleSqrt(volume, vMin, vMax, ...RANGES.pedestrians)),
      buyQueue: queue(flow),
      sellQueue: queue(-flow),
      callInterval: scaleSqrt(volume, vMin, vMax, ...RANGES.callInterval),
      tier: tierOf(etf.netAssets, ETF_TIERS),
      tierProgress: tierProgress(etf.netAssets, ETF_TIERS),
      trend: flowTrend(etf.netInflow),
      sign: { rank: etf.rank, symbol: etf.ticker, primary: formatPrice(etf.price), secondary: formatSignedUsd(etf.netInflow) },
    };
  });
}
