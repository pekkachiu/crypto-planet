export const TOP_N = 10;
/** 從 CoinGecko 多抓一些候選，扣掉穩定幣與 Binance 沒上架的幣後仍湊得滿前十 */
export const CANDIDATE_COUNT = 40;
export const REFRESH_MS = 60_000;
/** 分類星（迷因、AI、公鏈）每 5 分鐘更新一次，避免 CoinGecko 免費 API 限流 */
export const CATEGORY_REFRESH_MS = 5 * 60_000;
/** 分類星依序抓，每次間隔幾毫秒，避免一次用光 CoinGecko 的額度 */
export const CATEGORY_GAP_MS = 4_000;
export const REQUEST_TIMEOUT_MS = 10_000;

export const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
export const BINANCE_KLINES_URL = 'https://data-api.binance.vision/api/v3/klines';
export const QUOTE_ASSET = 'USDT';
/** Binance 收盤價跟 CoinGecko 價格差超過這個比例，就當成是同代號的另一個幣 */
export const PRICE_MATCH_TOLERANCE = 0.15;

export const STABLECOIN_IDS = new Set([
  'tether', 'usd-coin', 'usds', 'dai', 'ethena-usde', 'first-digital-usd', 'paypal-usd',
  'true-usd', 'usd1-wlfi', 'ripple-usd', 'frax', 'gemini-dollar', 'paxos-standard',
  'binance-usd', 'global-dollar', 'falcon-finance', 'usdd', 'tether-gold', 'pax-gold',
]);

export const WRAPPED_IDS = new Set([
  'wrapped-bitcoin', 'staked-ether', 'wrapped-steth', 'wrapped-eeth', 'weth',
  'coinbase-wrapped-btc', 'binance-staked-sol', 'jito-staked-sol', 'rocket-pool-eth',
  'wrapped-beacon-eth', 'lombard-staked-btc', 'solv-btc', 'binance-bridged-usdt-bnb-smart-chain',
]);

/** 價格離 1 美元多近、24h 波動多小，就視為疑似穩定幣 */
export const STABLE_PRICE_TOLERANCE = 0.02;
export const STABLE_CHANGE_TOLERANCE = 0.5;
