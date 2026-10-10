const DASH = '—';
const UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** 三位有效數字的金額縮寫，例如 $1.62T、$34.0B */
export function formatUsd(value) {
  if (!Number.isFinite(value)) return DASH;
  const unit = UNITS.find(([size]) => Math.abs(value) >= size);
  if (!unit) return `$${Math.round(value)}`;
  return `$${(value / unit[0]).toPrecision(3)}${unit[1]}`;
}

export function formatPrice(value) {
  if (!Number.isFinite(value)) return DASH;
  if (value >= 1000) return `$${Math.round(value).toLocaleString('en-US')}`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toPrecision(4)}`;
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return DASH;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
