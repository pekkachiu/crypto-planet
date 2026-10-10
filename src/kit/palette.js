/** 國際慣例：綠漲紅跌 */
export const TREND_COLORS = Object.freeze({ up: '#16c784', down: '#ea3943', flat: '#9aa4ae' });

const BRAND_COLORS = Object.freeze({
  BTC: '#f7931a', ETH: '#627eea', BNB: '#f3ba2f', XRP: '#25a7e0', SOL: '#9945ff',
  TRX: '#ff3b30', DOGE: '#c2a633', ZEC: '#f4b728', HYPE: '#97fce4', LINK: '#2a5ada',
  ADA: '#3468d1', XLM: '#7d8a99', AVAX: '#e84142', SUI: '#4da2ff', TON: '#0098ea',
});

const WALKER_COLORS = ['#c9d3dd', '#8fa3b8', '#d7b98e', '#a48fc2', '#7fb5b0', '#e0a39a'];

/** 店面主色：知名幣種用品牌色，其他依代號雜湊出穩定的色相 */
export function coinColor(symbol) {
  if (BRAND_COLORS[symbol]) return BRAND_COLORS[symbol];
  const hash = [...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return `hsl(${hash % 360} 65% 58%)`;
}

export function walkerColor(tint) {
  return WALKER_COLORS[Math.floor(tint * WALKER_COLORS.length) % WALKER_COLORS.length];
}
