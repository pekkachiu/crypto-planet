import { createNoise3 } from './noise.js';

/** 店面廣場的角半徑（弧度），預設對應半徑約 15 的星球上 4.6 單位 */
export const PLAZA_ANGLE = 0.3;
const BLEND = 0.6;
const MAX_HEIGHT = 0.55;
const WATER_DEPTH = -0.14;
const SAND_BAND = 0.08;
const ROCK_LEVEL = 0.42;
const FREQ = 1.7;

const angleBetween = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)));
const smoothstep = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/**
 * 星球表面的地形場：輸入單位法向量，回傳 { height, kind }。
 * 店面廣場（spots）內完全平坦，邊緣平滑銜接，人潮才能貼著地面走。
 */
export function createTerrainField({ seed, spots = [], waterLevel = -0.1, plazaAngle = PLAZA_ANGLE }) {
  const noise = createNoise3(seed);
  const treeNoise = createNoise3(seed + 99);

  const raw = ({ x, y, z }) => {
    const e = 0.7 * noise(x * FREQ, y * FREQ, z * FREQ) + 0.3 * noise(x * FREQ * 2.3, y * FREQ * 2.3, z * FREQ * 2.3);
    if (e < waterLevel) return { e, height: WATER_DEPTH, kind: 'water' };
    const height = Math.min(MAX_HEIGHT, Math.max(0, (e - waterLevel) * 0.9));
    if (e < waterLevel + SAND_BAND) return { e, height, kind: 'sand' };
    if (e > ROCK_LEVEL) return { e, height, kind: 'rock' };
    return { e, height, kind: 'grass' };
  };

  const nearestSpot = (n) => spots.reduce((min, s) => Math.min(min, angleBetween(n, s)), Infinity);

  const field = (n) => {
    const d = nearestSpot(n);
    if (d <= plazaAngle) return { height: 0, kind: 'plaza' };
    const r = raw(n);
    const blend = smoothstep((d - plazaAngle) / (plazaAngle * BLEND));
    return { height: r.height * blend, kind: r.kind };
  };

  /** 樹只種在草地上、離廣場有段距離，並用另一層雜訊讓樹成片出現 */
  field.canPlant = (n) => field(n).kind === 'grass'
    && nearestSpot(n) > plazaAngle * 1.35
    && treeNoise(n.x * 3, n.y * 3, n.z * 3) > 0.05;

  return field;
}
