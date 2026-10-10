import {
  STABLECOIN_IDS, WRAPPED_IDS, STABLE_PRICE_TOLERANCE, STABLE_CHANGE_TOLERANCE, QUOTE_ASSET,
} from './config.js';

const KLINE = { quoteVolume: 7, trades: 8, takerBuyQuote: 10 };

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

export function pickCandidates(markets) {
  if (!Array.isArray(markets)) return [];
  return markets
    .filter(isValidMarket)
    .filter((m) => !isExcluded(m))
    .toSorted((a, b) => a.market_cap_rank - b.market_cap_rank);
}

export function parseKlines(rows) {
  if (!Array.isArray(rows)) throw new Error('K 線資料格式錯誤：不是陣列');
  return rows.reduce((acc, row) => {
    const quote = Number(row?.[KLINE.quoteVolume]);
    const buy = Number(row?.[KLINE.takerBuyQuote]);
    const trades = Number(row?.[KLINE.trades]);
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
