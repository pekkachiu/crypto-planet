import { fetchJson } from './api.js';
import sample from './sample-liquidations.json' with { type: 'json' };

export const DAY_MS = 24 * 3600 * 1000;
export const OKX_LIQ_URL = 'https://www.okx.com/api/v5/public/liquidation-orders';
export const OKX_INSTRUMENTS_URL = 'https://www.okx.com/api/v5/public/instruments?instType=SWAP';
/** BTC 這種爆倉多的幣，一頁 100 筆不到 24 小時；最多往前翻幾頁 */
const MAX_PAGES = 12;
const PAGE_LIMIT = 100;

const num = (v) => (typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN);
const underlying = (symbol) => `${symbol}-USDT`;

/** USDT 本位永續合約：uly → 每張合約代表幾顆幣（ctVal） */
export function parseCtVals(instruments) {
  if (!Array.isArray(instruments)) return new Map();
  return new Map(instruments
    .filter((i) => i?.uly?.endsWith('-USDT') && i.ctValCcy === i.uly.split('-')[0] && num(i.ctVal) > 0)
    .map((i) => [i.uly, num(i.ctVal)]));
}

/** 爆倉金額（美元）＝張數 × 每張幣數 × 破產價 */
export function detailUsd(d, ctVal) {
  const usd = num(d.sz) * ctVal * num(d.bkPx);
  return Number.isFinite(usd) && usd > 0 ? usd : 0;
}

/** 多單爆倉＝被迫賣出；單向持倉模式沒有 posSide，改看 side */
export function detailSide(d) {
  if (d.posSide === 'long' || d.posSide === 'short') return d.posSide;
  return { sell: 'long', buy: 'short' }[d.side] ?? null;
}

/** 把每個幣的爆倉明細加總成 24 小時多空金額，依總額由大到小排序 */
export function summarize(perCoin, now) {
  const since = now - DAY_MS;
  const byCoin = perCoin.map(({ symbol, ctVal, details }) => details
    .filter((d) => num(d.ts) >= since)
    .reduce((acc, d) => {
      const side = detailSide(d);
      return side ? { ...acc, [side]: acc[side] + detailUsd(d, ctVal) } : acc;
    }, { symbol, long: 0, short: 0 }))
    .toSorted((a, b) => (b.long + b.short) - (a.long + a.short));
  return {
    long: byCoin.reduce((s, c) => s + c.long, 0),
    short: byCoin.reduce((s, c) => s + c.short, 0),
    byCoin,
  };
}

async function okxData(url, options) {
  const body = await fetchJson(url, options);
  if (body?.code !== '0') throw new Error(`OKX ${body?.code}：${body?.msg ?? ''}`);
  return body.data ?? [];
}

/** 一個標的往前翻頁，直到涵蓋 24 小時或沒有更早的資料 */
export async function fetchUnderlying(uly, { fetchImpl = fetch, now = Date.now() } = {}) {
  const all = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(OKX_LIQ_URL);
    url.search = new URLSearchParams({
      instType: 'SWAP', uly, state: 'filled', limit: String(PAGE_LIMIT), ...(after ? { after } : {}),
    }).toString();
    const details = (await okxData(url.toString(), { fetchImpl }))[0]?.details ?? [];
    if (details.length === 0) break;
    all.push(...details);
    const oldest = Math.min(...details.map((d) => num(d.ts)));
    if (oldest < now - DAY_MS) break;
    after = String(oldest);
  }
  return all;
}

/**
 * OKX 上這些幣的 USDT 永續合約，過去 24 小時的多空爆倉總額。
 * 失敗時改用內建範例資料。
 */
export async function loadLiquidations(coins, { fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    const ctVals = parseCtVals(await okxData(OKX_INSTRUMENTS_URL, { fetchImpl }));
    const listed = coins.filter((c) => ctVals.has(underlying(c.symbol)));
    const perCoin = [];
    // 依序抓，避免撞到 OKX 每 2 秒 40 次的限流
    for (const coin of listed) {
      const uly = underlying(coin.symbol);
      perCoin.push({ symbol: coin.symbol, ctVal: ctVals.get(uly), details: await fetchUnderlying(uly, { fetchImpl, now }) });
    }
    return { source: 'okx', updatedAt: new Date(now).toISOString(), ...summarize(perCoin, now) };
  } catch (err) {
    return { ...sample, source: 'sample', error: err.message };
  }
}
