import { ETF_ASSETS, parseSnapshot, parseSummary, buildEtfDataset } from './etf.js';

/**
 * 從 SoSoValue 官方 API 抓 ETF 資料。只在 GitHub Actions（scripts/fetch-etf.mjs）執行，
 * API Key 由呼叫端從環境變數傳入；網頁端不會載入這個模組。
 * 限制：每個 Key 每分鐘 20 次、每月 10 萬次，所以請求之間固定間隔。
 */
export const SOSO_BASE = 'https://openapi.sosovalue.com/openapi/v1';
const COUNTRY = 'US';
const TICKER_RE = /^[A-Z0-9.]{1,10}$/;
const MAX_RETRIES = 3;
const DEFAULT_RETRY_MS = 60_000;
const TIMEOUT_MS = 20_000;
const SUMMARY_LIMIT = 5;
/** 每分鐘 20 次 → 至少間隔 3 秒，多留一點餘裕 */
export const MIN_INTERVAL_MS = 3_200;

const realSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function createClient({ apiKey, fetchImpl, sleep, minIntervalMs, clock }) {
  let lastAt = null;

  const throttle = async () => {
    if (lastAt !== null) {
      const wait = lastAt + minIntervalMs - clock();
      if (wait > 0) await sleep(wait);
    }
    lastAt = clock();
  };

  /** 錯誤訊息只帶路徑、狀態碼與 API 的錯誤代碼，不會帶到 Key */
  return async function request(path, params = {}) {
    const url = new URL(`${SOSO_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      await throttle();
      const res = await fetchImpl(url.toString(), {
        headers: { 'x-soso-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(body?.details?.retry_after);
        await sleep(retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_MS);
        continue;
      }
      if (!res.ok) throw new Error(`SoSoValue ${path} HTTP ${res.status}${body?.code ? ` (code ${body.code})` : ''}`);
      if (body?.code !== 0) throw new Error(`SoSoValue ${path} code ${body?.code}: ${String(body?.message ?? '').slice(0, 120)}`);
      return body.data;
    }
  };
}

/**
 * 依序抓：每個資產的 ETF 清單與每日總計，再抓每檔 ETF 的最新已結算快照。
 * 單一基金失敗就略過；超過一半失敗代表 API 有狀況，整體失敗讓部署沿用上一次的資料。
 */
export async function fetchEtfDataset({
  apiKey, fetchImpl = fetch, sleep = realSleep, now = Date.now(),
  minIntervalMs = MIN_INTERVAL_MS, clock = Date.now, assets = ETF_ASSETS,
}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new Error('SOSOVALUE_API_KEY 未設定');
  const request = createClient({ apiKey: apiKey.trim(), fetchImpl, sleep, minIntervalMs, clock });

  const totals = {};
  const listings = [];
  for (const asset of assets) {
    const list = await request('/etfs', { symbol: asset, country_code: COUNTRY });
    totals[asset] = parseSummary(await request('/etfs/summary-history', { symbol: asset, country_code: COUNTRY, limit: SUMMARY_LIMIT }));
    for (const item of Array.isArray(list) ? list : []) {
      const ticker = typeof item?.ticker === 'string' ? item.ticker.trim().toUpperCase() : '';
      if (TICKER_RE.test(ticker)) listings.push({ ticker, asset, name: item.name, exchange: item.exchange });
    }
  }

  const funds = [];
  let failed = 0;
  for (const { ticker, ...meta } of listings) {
    try {
      const fund = parseSnapshot(await request(`/etfs/${ticker}/market-snapshot`), meta);
      if (fund) funds.push(fund);
    } catch (err) {
      failed += 1;
      console.warn(`[etf] ${ticker} 略過：${err.message}`);
    }
  }
  if (listings.length === 0 || failed * 2 > listings.length) {
    throw new Error(`ETF 快照失敗 ${failed}/${listings.length}`);
  }
  return buildEtfDataset({ funds, totals, now });
}
