const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const normalize = (v) => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/**
 * 在球面北半部（y ≥ minY 的球帽）用費氏螺旋平均撒點，第一個點在北極。
 * 店面依排名放置：排名越前越靠近北極。
 */
export function capPoints(count, minY) {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 1, z: 0 }];
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * (1 - minY);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE;
    return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
  });
}

/** 球面某點的切面座標系：up＝法向量、south＝往南（遠離北極）、east＝往東 */
export function tangentFrame(normal) {
  const up = normal;
  const pole = { x: 0, y: 1, z: 0 };
  const nearPole = Math.abs(up.y) > 0.999;
  const east = normalize(nearPole ? { x: 1, y: 0, z: 0 } : cross(pole, up));
  const south = normalize(cross(east, up));
  return { up, east, south };
}

/** 切面上 (x, z) 處的球面高度；店面附近的人依此貼著地面走 */
export function groundHeight(radius, x, z) {
  const d2 = x * x + z * z;
  if (d2 >= radius * radius) return -radius;
  return Math.sqrt(radius * radius - d2) - radius;
}
