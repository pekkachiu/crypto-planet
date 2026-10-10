import { ETF_ASSETS, REQUIRED_ASSETS, parseTickers, parseSummary, buildEtfDataset } from './etf.js';

/**
 * 從 SoSoValue 官方 API 抓 ETF 資料。只在 GitHub Actions（scripts/fetch-etf.mjs）執行，
 * API Key 由呼叫端從環境變數傳入；網頁端不會載入這個模組。
 * 限制：每個 Key 每分鐘 20 次、每月 10 萬次，所以請求之間固定間隔。
 */
export const SOSO_BASE = 'https://openapi.sosovalue.com/openapi/v1';
const COUNTRY = 'US';
const MAX_RETRIES = 3;
const DEFAULT_RETRY_MS = 60_000;
/** 被限流時最多等這麼久，避免 API 回傳異常大的值讓工作卡住 */
const MAX_RETRY_MS = 120_000;
const TIMEOUT_MS = 20_000;
const SUMMARY_LIMIT = 5;
/** 每分鐘 20 次 → 至少間隔 3 秒，多留一點餘裕 */
export const MIN_INTERVAL_MS = 3_200;

const realSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** 429 時要等多久：優先看回應內容的 retry_after，其次是 Retry-After header（秒） */
function retryDelay(res, body) {
  const seconds = Number(body?.details?.retry_after ?? res.headers?.get?.('retry-after'));
  return seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_MS) : DEFAULT_RETRY_MS;
}

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
        // 不跟隨重新導向：自訂 header 在跨網域導向時不會被移除，Key 可能被轉送到別的網站
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await sleep(retryDelay(res, body));
        continue;
      }
      if (!res.ok) throw new Error(`SoSoValue ${path} HTTP ${res.status}${body?.code ? ` (code ${body.code})` : ''}`);
      if (body?.code !== 0) throw new Error(`SoSoValue ${path} code ${body?.code}: ${String(body?.message ?? '').slice(0, 120)}`);
      return body.data;
    }
  };
}

/**
 * 每個幣種抓兩個請求：ETF 清單（有幾檔、代號）與所有 ETF 的每日總計。
 * BTC、ETH 抓不到就整體失敗，讓部署沿用上一次的資料；其他幣種抓不到只略過那一棟。
 */
export async function fetchEtfDataset({
  apiKey, fetchImpl = fetch, sleep = realSleep, now = Date.now(),
  minIntervalMs = MIN_INTERVAL_MS, clock = Date.now, assets = ETF_ASSETS,
}) {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') throw new Error('SOSOVALUE_API_KEY 未設定');
  const request = createClient({ apiKey: apiKey.trim(), fetchImpl, sleep, minIntervalMs, clock });

  const groups = [];
  for (const asset of assets) {
    try {
      const params = { symbol: asset, country_code: COUNTRY };
      const tickers = parseTickers(await request('/etfs', params));
      const summary = parseSummary(await request('/etfs/summary-history', { ...params, limit: SUMMARY_LIMIT }));
      if (tickers.length === 0) throw new Error('沒有 ETF');
      if (!summary) throw new Error('沒有已結算的總計');
      groups.push({ asset, ...summary, fundCount: tickers.length, tickers });
    } catch (err) {
      if (REQUIRED_ASSETS.includes(asset)) throw new Error(`${asset} ETF 資料抓取失敗：${err.message}`);
      console.warn(`[etf] ${asset} 略過：${err.message}`);
    }
  }
  return buildEtfDataset({ groups, now });
}
