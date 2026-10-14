import {
  TOP_N, CANDIDATE_COUNT, REQUEST_TIMEOUT_MS, COINGECKO_MARKETS_URL, BINANCE_KLINES_URL,
} from './config.js';
import { pickCandidates, parseKlines, buildCoin, binancePair, priceMatches } from './normalize.js';
import sample from './sample.json' with { type: 'json' };

export async function fetchJson(url, { fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}：${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function marketsUrl(count, category) {
  const url = new URL(COINGECKO_MARKETS_URL);
  url.search = new URLSearchParams({
    vs_currency: 'usd', order: 'market_cap_desc', per_page: String(count), page: '1',
    ...(category ? { category } : {}),
  }).toString();
  return url.toString();
}

const DAY_MS = 24 * 3600 * 1000;

/** 帶 startTime：已下架的交易對會回傳空陣列，而不是下架前的舊資料 */
function klinesUrl(pair, now) {
  const url = new URL(BINANCE_KLINES_URL);
  url.search = new URLSearchParams({
    symbol: pair, interval: '1h', limit: '24', startTime: String(now - DAY_MS),
  }).toString();
  return url.toString();
}

/** Binance 沒有交易對、已下架或價格對不上（同代號的另一個幣）時回傳 null，讓呼叫端略過這個幣 */
async function fetchFlow(market, options) {
  try {
    const rows = await fetchJson(klinesUrl(binancePair(market), options.now), options);
    if (!Array.isArray(rows) || rows.length === 0 || !priceMatches(rows, market.current_price)) return null;
    return parseKlines(rows);
  } catch {
    return null;
  }
}

/** 依排名逐批抓買賣量，湊滿 topN 個有 Binance 交易對的幣 */
async function collectCoins(candidates, topN, options) {
  const coins = [];
  for (let i = 0; i < candidates.length && coins.length < topN; i += topN) {
    const batch = candidates.slice(i, i + topN);
    const flows = await Promise.all(batch.map((m) => fetchFlow(m, options)));
    const built = batch.flatMap((m, j) => (flows[j] ? [buildCoin(m, flows[j])] : []));
    coins.push(...built);
  }
  return coins.slice(0, topN);
}

/**
 * 抓前 N 大非穩定幣的即時資料；任何環節失敗就改用內建範例資料，畫面不會空白。
 * @returns {Promise<{source:'live'|'sample', coins:object[], updatedAt:string, error?:string}>}
 */
async function loadLive({ category, excludeIds = [], fetchImpl, topN, now }) {
  const options = { fetchImpl, now };
  const markets = await fetchJson(marketsUrl(CANDIDATE_COUNT, category), options);
  const coins = await collectCoins(pickCandidates(markets, { excludeIds }), topN, options);
  if (coins.length === 0) throw new Error('沒有任何幣種取得 Binance 買賣量');
  return { coins, updatedAt: new Date().toISOString() };
}

export async function loadTopCoins({ fetchImpl = fetch, topN = TOP_N, now = Date.now() } = {}) {
  try {
    return { source: 'live', ...await loadLive({ fetchImpl, topN, now }) };
  } catch (err) {
    return { source: 'sample', coins: sample.coins, updatedAt: sample.updatedAt, error: err.message };
  }
}

/**
 * 抓 CoinGecko 某個分類（例如 meme-token）的前 N 大，買賣量同樣來自 Binance。
 * 抓不到時回傳 null，那顆星球維持上鎖，不用範例資料。
 * @returns {Promise<{coins:object[], updatedAt:string}|null>}
 */
export async function loadCategoryCoins({
  category, excludeIds = [], fetchImpl = fetch, topN = TOP_N, now = Date.now(),
}) {
  try {
    return await loadLive({ category, excludeIds, fetchImpl, topN, now });
  } catch {
    return null;
  }
}
