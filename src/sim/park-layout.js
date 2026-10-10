import { scaleLog } from '../data/mapping.js';

/**
 * 爆倉公園的配置（純邏輯）。座標為公園中心的切面座標，入口朝 +z。
 * 跟店門口隊伍一樣：左半邊（-x）坐紅衣的多單爆倉者、右半邊（+x）坐綠衣的空單爆倉者。
 */
export const PARK = Object.freeze({
  benchesPerSide: 6,
  seatsPerBench: 3,
  seatsPerSide: 18,
  ringRadius: 2.6,
  seatSpacing: 0.24,
  sitters: [2, 36],
  usd: [1e5, 5e8],
  monumentHeight: [1.2, 4],
});

const SIGN = { long: -1, short: 1 };

export function sitterCounts({ long, short }) {
  const total = long + short;
  if (!(total > 0)) return { long: 0, short: 0 };
  const n = Math.round(scaleLog(total, ...PARK.usd, ...PARK.sitters));
  const clamp = (v, amount) => Math.min(PARK.seatsPerSide, Math.max(amount > 0 ? 1 : 0, v));
  const longN = Math.round((n * long) / total);
  return { long: clamp(longN, long), short: clamp(n - longN, short) };
}

/** 長椅中心的角度：避開正前方（入口）與正後方的步道 */
function benchAngles(side) {
  return Array.from({ length: PARK.benchesPerSide }, (_, i) => {
    const t = (i + 0.5) / PARK.benchesPerSide;
    return side === 'long' ? Math.PI + t * Math.PI : t * Math.PI;
  });
}

export function benches(side) {
  return benchAngles(side).map((theta) => ({
    x: Math.sin(theta) * PARK.ringRadius,
    z: Math.cos(theta) * PARK.ringRadius,
    heading: Math.atan2(-Math.sin(theta), -Math.cos(theta)),
  }));
}

/** 前 n 個座位的位置與朝向（面向公園中央） */
export function seatPositions(side, n) {
  const seats = benchAngles(side).flatMap((theta) => {
    const tangent = { x: Math.cos(theta), z: -Math.sin(theta) };
    return [-1, 0, 1].map((k) => {
      const x = Math.sin(theta) * PARK.ringRadius + tangent.x * k * PARK.seatSpacing;
      const z = Math.cos(theta) * PARK.ringRadius + tangent.z * k * PARK.seatSpacing;
      return { x, z, heading: Math.atan2(-x, -z) };
    });
  });
  return seats.filter((s) => Math.sign(s.x) === SIGN[side]).slice(0, Math.max(0, n));
}

/** 中央紀念碑：高度隨 24h 總額，紅色段比例＝多單佔比 */
export function monument({ long, short }) {
  const total = long + short;
  return {
    height: scaleLog(total, ...PARK.usd, ...PARK.monumentHeight),
    longShare: total > 0 ? long / total : 0.5,
  };
}
