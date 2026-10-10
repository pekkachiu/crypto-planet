/**
 * 爆倉隕石的生命週期（純邏輯）：
 * falling（從天而降）→ impact（落地衝擊波）→ crater（地上的坑慢慢淡掉）。
 * shopIndex 為 null 的是前十大以外的爆倉，畫成天空中劃過的流星（streak）。
 * 座標與 crowd.js 相同：店面切面座標，門朝 +z。
 */
export const METEOR = Object.freeze({
  fallSeconds: 1.6,
  impactSeconds: 0.9,
  craterSeconds: 7,
  streakSeconds: 1.4,
  max: 40,
  /** 落點範圍：店門口前方的廣場 */
  landing: Object.freeze({ halfWidth: 2.4, zMin: 1.5, zMax: 2.7 }),
});

const NEXT = { falling: 'impact', impact: 'crater', crater: null, streak: null };
const DURATION = {
  falling: METEOR.fallSeconds,
  impact: METEOR.impactSeconds,
  crater: METEOR.craterSeconds,
  streak: METEOR.streakSeconds,
};

export function createMeteorField(rng) {
  let meteors = [];
  let nextId = 0;

  const spawn = ({ shopIndex, side, size }) => {
    const { halfWidth, zMin, zMax } = METEOR.landing;
    meteors.push({
      id: nextId++,
      shopIndex,
      side,
      size,
      phase: shopIndex === null ? 'streak' : 'falling',
      t: 0,
      progress: 0,
      x: (rng() * 2 - 1) * halfWidth,
      z: zMin + rng() * (zMax - zMin),
      // 流星的方向與高度、隕石進場的傾斜角，給渲染層用
      angle: rng() * Math.PI * 2,
      tilt: 0.3 + rng() * 0.5,
      altitude: rng(),
    });
    if (meteors.length > METEOR.max) meteors = meteors.slice(meteors.length - METEOR.max);
  };

  /** 推進時間，回傳這一步剛落地的隕石（給模擬層觸發衝擊效果） */
  const step = (dt) => {
    if (!(dt > 0)) return [];
    const impacts = [];
    meteors = meteors.filter((m) => {
      m.t += dt;
      while (m.t >= DURATION[m.phase]) {
        m.t -= DURATION[m.phase];
        if (m.phase === 'falling') impacts.push(m);
        m.phase = NEXT[m.phase];
        if (!m.phase) return false;
      }
      m.progress = m.t / DURATION[m.phase];
      return true;
    });
    return impacts;
  };

  return {
    get meteors() { return meteors; },
    spawn,
    step,
  };
}
