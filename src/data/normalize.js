import {
  STABLECOIN_IDS, WRAPPED_IDS, STABLE_PRICE_TOLERANCE, STABLE_CHANGE_TOLERANCE, QUOTE_ASSET, PRICE_MATCH_TOLERANCE,
} from './config.js';

const KLINE = { close: 4, quoteVolume: 7, trades: 8, takerBuyQuote: 10 };

function looksStable(m) {
  return Math.abs(m.current_price - 1) <= STABLE_PRICE_TOLERANCE
    && Math.abs(m.price_change_percentage_24h ?? 0) <= STABLE_CHANGE_TOLERANCE;
}

/** 穩定幣與包裝幣沒有獨立行情，不放進小鎮 */
export function isExcluded(m) {
  return STABLECOIN_IDS.has(m.id) || WRAPPED_IDS.has(m.id) || looksStable(m);
}

function isValidMarket(m) {
  return m != null
    && typeof m.id === 'string'
    && typeof m.symbol === 'string'
    && Number.isFinite(m.current_price)
    && Number.isFinite(m.market_cap)
    && Number.isFinite(m.market_cap_rank);
}

/** 同一個代號只留排名最前面的：Binance 交易對只看代號，同名的山寨幣會對到同一個交易對 */
function firstPerSymbol(sorted) {
  const seen = new Set();
  return sorted.filter((m) => {
    const symbol = m.symbol.toLowerCase();
    if (seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
}

/** excludeIds：不列入的幣（例如公鏈星排除主流星已有的幣） */
export function pickCandidates(markets, { excludeIds = [] } = {}) {
  if (!Array.isArray(markets)) return [];
  const excluded = new Set(excludeIds);
  return firstPerSymbol(markets
    .filter(isValidMarket)
    .filter((m) => !isExcluded(m) && !excluded.has(m.id))
    .toSorted((a, b) => a.market_cap_rank - b.market_cap_rank));
}

/** Number(null) 與 Number('') 都是 0，要先擋掉 */
function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

export function parseKlines(rows) {
  if (!Array.isArray(rows)) throw new Error('K 線資料格式錯誤：不是陣列');
  return rows.reduce((acc, row) => {
    const quote = toNumber(row?.[KLINE.quoteVolume]);
    const buy = toNumber(row?.[KLINE.takerBuyQuote]);
    const trades = toNumber(row?.[KLINE.trades]);
    if (![quote, buy, trades].every(Number.isFinite)) {
      throw new Error('K 線資料格式錯誤：欄位不是數字');
    }
    return {
      quoteVolume: acc.quoteVolume + quote,
      takerBuy: acc.takerBuy + buy,
      takerSell: acc.takerSell + (quote - buy),
      trades: acc.trades + trades,
    };
  }, { quoteVolume: 0, takerBuy: 0, takerSell: 0, trades: 0 });
}

/** Binance 最後一根 K 線的收盤價跟 CoinGecko 價格接近，才是同一個幣 */
export function priceMatches(rows, price) {
  const close = toNumber(rows?.at(-1)?.[KLINE.close]);
  if (!Number.isFinite(close) || !(price > 0)) return false;
  return Math.abs(close - price) / price <= PRICE_MATCH_TOLERANCE;
}

export function binancePair(m) {
  return `${m.symbol.toUpperCase()}${QUOTE_ASSET}`;
}

export function buildCoin(m, flow) {
  return {
    id: m.id,
    symbol: m.symbol.toUpperCase(),
    name: m.name,
    price: m.current_price,
    marketCap: m.market_cap,
    rank: m.market_cap_rank,
    change24h: m.price_change_percentage_24h ?? 0,
    volume24h: flow.quoteVolume,
    takerBuy: flow.takerBuy,
    takerSell: flow.takerSell,
    trades: flow.trades,
    pair: binancePair(m),
  };
}
