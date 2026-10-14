/**
 * 分類星資料的本機快取（localStorage）：CoinGecko 免 Key 的限流很嚴，連續打幾次就回 429，
 * 重新整理頁面時先用幾分鐘內的快取，不必每次都重抓。讀回來的內容要重新檢查，不信任儲存的資料。
 */
const KEY_PREFIX = 'crypto-planet:category:';

const COIN_STRINGS = ['id', 'symbol', 'name', 'pair'];
const COIN_NUMBERS = ['price', 'marketCap', 'rank', 'change24h', 'volume24h', 'takerBuy', 'takerSell', 'trades'];

export const cacheKey = (planetId) => `${KEY_PREFIX}${planetId}`;

export const encodeCache = ({ coins, updatedAt }) => JSON.stringify({ coins, updatedAt });

function isCoin(c) {
  return c != null
    && COIN_STRINGS.every((k) => typeof c[k] === 'string')
    && COIN_NUMBERS.every((k) => Number.isFinite(c[k]));
}

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 讀回快取；過期、格式不對或任何一個幣的欄位不對時回傳 null */
export function decodeCache(raw, { now, maxAgeMs }) {
  if (typeof raw !== 'string') return null;
  const data = parse(raw);
  if (!Array.isArray(data?.coins) || data.coins.length === 0 || !data.coins.every(isCoin)) return null;
  const age = now - Date.parse(data.updatedAt);
  if (!(age >= 0 && age <= maxAgeMs)) return null;
  return { coins: data.coins, updatedAt: data.updatedAt };
}
