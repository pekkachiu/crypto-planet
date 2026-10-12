import { createRng } from './rng.js';

/** 星色（線性 RGB）：依真實恆星的溫度由藍到橘，白色最多 */
export const STAR_TINTS = Object.freeze([
  Object.freeze({ rgb: [0.7, 0.8, 1.0], weight: 0.22 }),
  Object.freeze({ rgb: [0.92, 0.95, 1.0], weight: 0.45 }),
  Object.freeze({ rgb: [1.0, 0.95, 0.82], weight: 0.2 }),
  Object.freeze({ rgb: [1.0, 0.82, 0.62], weight: 0.13 }),
]);

function pickTint(r) {
  let acc = 0;
  for (const tint of STAR_TINTS) {
    acc += tint.weight;
    if (r < acc) return tint.rgb;
  }
  return STAR_TINTS.at(-1).rgb;
}

/**
 * 星空資料（純邏輯）：均勻撒在半徑 shell 的球殼上。
 * 大小用冪次分布，大多是 1～2 像素的小星星，少數 3 像素以上的亮星；phases 給閃爍用。
 */
export function createStarData({ count, shell, seed }) {
  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u) * shell;
    positions.set([Math.cos(t) * r, u * shell, Math.sin(t) * r], i * 3);
    colors.set(pickTint(rng()), i * 3);
    sizes[i] = 1 + 3.5 * rng() ** 16;
    phases[i] = rng() * Math.PI * 2;
  }
  return { positions, colors, sizes, phases };
}
