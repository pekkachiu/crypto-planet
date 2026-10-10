/**
 * 繞著星球的鏡頭路徑：方向用球面插值（slerp）、距離線性插值再加上中段拉高，
 * 並保證離星球中心至少 minDistance。直線飛行在兩間店位於星球兩側時會穿過星球。
 */
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const scale = (v, s) => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const normalize = (v) => scale(v, 1 / (len(v) || 1));

/** 任一與 v 垂直的單位向量（兩方向完全相反時用來決定繞行平面） */
function perpendicular(v) {
  const axis = Math.abs(v.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const d = dot(axis, v);
  return normalize({ x: axis.x - v.x * d, y: axis.y - v.y * d, z: axis.z - v.z * d });
}

function slerp(a, b, t) {
  const cos = Math.min(1, Math.max(-1, dot(a, b)));
  const omega = Math.acos(cos);
  if (omega < 1e-6) return a;
  if (Math.PI - omega < 1e-6) {
    // 正對面：經過與 a 垂直的方向繞半圈
    const p = perpendicular(a);
    const angle = Math.PI * t;
    return normalize({
      x: a.x * Math.cos(angle) + p.x * Math.sin(angle),
      y: a.y * Math.cos(angle) + p.y * Math.sin(angle),
      z: a.z * Math.cos(angle) + p.z * Math.sin(angle),
    });
  }
  const sin = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / sin;
  const wb = Math.sin(t * omega) / sin;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}

/**
 * @param {{x,y,z}} from 起點
 * @param {{x,y,z}} to 終點
 * @param {number} t 0～1
 * @param {{center:{x,y,z}, minDistance:number, lift:number}} opts
 */
export function arcPoint(from, to, t, { center, minDistance, lift }) {
  if (t <= 0) return { ...from };
  const a = sub(from, center);
  const b = sub(to, center);
  const dir = slerp(normalize(a), normalize(b), t);
  const distance = len(a) + (len(b) - len(a)) * t + Math.sin(Math.PI * t) * lift;
  const p = scale(dir, Math.max(minDistance, distance));
  return { x: center.x + p.x, y: center.y + p.y, z: center.z + p.z };
}
