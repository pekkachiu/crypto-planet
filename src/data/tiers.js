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

const tierEntry = (marketCap) => {
  const cap = Number.isFinite(marketCap) ? marketCap : 0;
  return TIERS.find((t) => cap >= t.min) ?? TIERS[TIERS.length - 1];
};

export function tierOf(marketCap) {
  return tierEntry(marketCap).tier;
}

/** 在所屬級距內的位置，0＝下緣、1＝上緣 */
export function tierProgress(marketCap) {
  const { min, max } = tierEntry(marketCap);
  if (!(marketCap > 0)) return 0;
  const t = (Math.log(marketCap) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.min(1, Math.max(0, t));
}
