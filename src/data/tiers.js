/**
 * 依「絕對」市值分級建築，以後加入迷因星時小幣自然就是小攤。
 * 每一級的 [min, max) 區間也用來算該級內的大小（對數內插）。
 */
export const TIERS = Object.freeze([
  { tier: 1, key: 'tier.1', min: 1e12, max: 4e12 },
  { tier: 2, key: 'tier.2', min: 1e11, max: 1e12 },
  { tier: 3, key: 'tier.3', min: 2e10, max: 1e11 },
  { tier: 4, key: 'tier.4', min: 1e8, max: 2e10 },
].map(Object.freeze));

/** ETF 依資產規模（AUM）分級：最大的現貨 ETF 約數百億美元，級距比幣種市值小兩個量級 */
export const ETF_TIERS = Object.freeze([
  { tier: 1, key: 'tier.1', min: 5e10, max: 2e11 },
  { tier: 2, key: 'tier.2', min: 1e10, max: 5e10 },
  { tier: 3, key: 'tier.3', min: 1e9, max: 1e10 },
  { tier: 4, key: 'tier.4', min: 1e7, max: 1e9 },
].map(Object.freeze));

const tierEntry = (marketCap, tiers) => {
  const cap = Number.isFinite(marketCap) ? marketCap : 0;
  return tiers.find((t) => cap >= t.min) ?? tiers[tiers.length - 1];
};

export function tierOf(marketCap, tiers = TIERS) {
  return tierEntry(marketCap, tiers).tier;
}

/** 在所屬級距內的位置，0＝下緣、1＝上緣 */
export function tierProgress(marketCap, tiers = TIERS) {
  const { min, max } = tierEntry(marketCap, tiers);
  if (!(marketCap > 0)) return 0;
  const t = (Math.log(marketCap) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.min(1, Math.max(0, t));
}
