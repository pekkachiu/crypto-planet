import * as THREE from 'three';
import { createMeteorField, METEOR } from '../sim/meteors.js';
import { groundHeight } from '../sim/sphere.js';
import { createRng } from '../sim/rng.js';
import { TREND_COLORS } from '../kit/palette.js';

/** 多單爆倉＝被迫賣出＝紅；空單爆倉＝被迫買入＝綠（與門口隊伍、K 線同色） */
const SIDE_COLOR = { long: TREND_COLORS.down, short: TREND_COLORS.up };
const FALL_HEIGHT = 14;
const FALL_DRIFT = 6;
const STREAK = { orbit: 1.6, span: 1.5, length: 2.6 };

const GEO = {
  head: new THREE.IcosahedronGeometry(0.32, 0),
  trail: new THREE.ConeGeometry(0.26, 3.2, 6, 1, true).translate(0, 1.6, 0),
  ring: new THREE.RingGeometry(0.75, 1, 28).rotateX(-Math.PI / 2),
  crater: new THREE.CircleGeometry(1, 9).rotateX(-Math.PI / 2),
  streak: new THREE.CylinderGeometry(0.04, 0.12, STREAK.length, 5, 1, true).rotateZ(Math.PI / 2),
};

const headMaterial = (side) => new THREE.MeshBasicMaterial({
  color: new THREE.Color(SIDE_COLOR[side]).multiplyScalar(2.4), toneMapped: false,
});
const fadeMaterial = (color, opacity, additive = true) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, toneMapped: false,
  blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
});

const UP = new THREE.Vector3(0, 1, 0);
const easeIn = (t) => t * t;

/** 一顆隕石的 3D 物件：落下時有頭與尾焰，落地後換成衝擊波與坑 */
function createMeteorObject(m) {
  const group = new THREE.Group();
  const color = SIDE_COLOR[m.side];
  if (m.phase === 'streak') {
    const streak = new THREE.Mesh(GEO.streak, fadeMaterial(new THREE.Color(color).multiplyScalar(1.8), 0.9));
    group.add(streak);
    return { group, streak };
  }
  const head = new THREE.Mesh(GEO.head, headMaterial(m.side));
  const trail = new THREE.Mesh(GEO.trail, fadeMaterial(new THREE.Color(color).multiplyScalar(1.5), 0.55));
  const ring = new THREE.Mesh(GEO.ring, fadeMaterial(new THREE.Color(color).multiplyScalar(1.6), 0.9));
  const crater = new THREE.Mesh(GEO.crater, fadeMaterial('#5b4636', 0.75, false));
  ring.visible = false;
  crater.visible = false;
  group.add(head, trail, ring, crater);
  return { group, head, trail, ring, crater };
}

function disposeObject(obj) {
  obj.group.traverse((o) => o.material?.dispose());
}

/**
 * 爆倉隕石圖層：掛在星球底下，依店面錨點把隕石放到對應店門口。
 * @param {THREE.Group} planetGroup
 * @param {number} radius
 * @param {(index:number) => THREE.Matrix4 | null} anchorMatrix 店面錨點（星球座標）
 */
export function createMeteorLayer(planetGroup, radius, anchorMatrix) {
  const root = new THREE.Group();
  planetGroup.add(root);
  const field = createMeteorField(createRng(77));
  const objects = new Map();
  const v = new THREE.Vector3();
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const placeFalling = (m, obj, anchor) => {
    const ground = groundHeight(radius, m.x, m.z);
    end.set(m.x, ground, m.z).applyMatrix4(anchor);
    start.set(m.x + Math.cos(m.angle) * FALL_DRIFT * m.tilt, FALL_HEIGHT, m.z + Math.sin(m.angle) * FALL_DRIFT * m.tilt)
      .applyMatrix4(anchor);
    obj.head.position.lerpVectors(start, end, easeIn(m.progress));
    obj.head.scale.setScalar(m.size);
    dir.subVectors(start, end).normalize();
    obj.trail.position.copy(obj.head.position);
    obj.trail.quaternion.setFromUnitVectors(UP, dir);
    obj.trail.scale.set(m.size, m.size * (0.6 + m.progress), m.size);
  };

  const placeGround = (m, obj, anchor) => {
    obj.head.visible = false;
    obj.trail.visible = false;
    v.set(m.x, groundHeight(radius, m.x, m.z) + 0.03, m.z);
    const local = new THREE.Matrix4().makeTranslation(v.x, v.y, v.z);
    const world = new THREE.Matrix4().multiplyMatrices(anchor, local);
    for (const mesh of [obj.ring, obj.crater]) {
      world.decompose(mesh.position, mesh.quaternion, new THREE.Vector3());
    }
    if (m.phase === 'impact') {
      obj.ring.visible = true;
      obj.crater.visible = true;
      obj.ring.scale.setScalar(0.6 + m.progress * (2 + m.size * 3));
      obj.ring.material.opacity = 0.9 * (1 - m.progress);
      obj.crater.scale.setScalar(m.size * 1.3 * Math.min(1, m.progress * 3));
    } else {
      obj.ring.visible = false;
      obj.crater.scale.setScalar(m.size * 1.3);
      obj.crater.material.opacity = 0.75 * (1 - m.progress);
    }
  };

  /** 流星：在星球上空的一段圓弧上劃過，前十大以外的爆倉 */
  const placeStreak = (m, obj) => {
    const n = v.set(Math.cos(m.angle), 0.3 + m.altitude * 0.7, Math.sin(m.angle)).normalize();
    const tangent = dir.crossVectors(n, UP).normalize();
    obj.group.position.copy(n).multiplyScalar(radius * STREAK.orbit)
      .addScaledVector(tangent, (m.progress - 0.5) * radius * STREAK.span);
    q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
    obj.group.quaternion.copy(q);
    obj.group.scale.setScalar(0.6 + m.size);
    obj.streak.material.opacity = 0.9 * Math.sin(Math.PI * m.progress);
  };

  const sync = () => {
    const alive = new Set();
    for (const m of field.meteors) {
      alive.add(m.id);
      if (!objects.has(m.id)) {
        const obj = createMeteorObject(m);
        objects.set(m.id, obj);
        root.add(obj.group);
      }
      const obj = objects.get(m.id);
      if (m.phase === 'streak') {
        placeStreak(m, obj);
        continue;
      }
      const anchor = anchorMatrix(m.shopIndex);
      if (!anchor) continue;
      if (m.phase === 'falling') placeFalling(m, obj, anchor);
      else placeGround(m, obj, anchor);
    }
    for (const [id, obj] of objects) {
      if (alive.has(id)) continue;
      root.remove(obj.group);
      disposeObject(obj);
      objects.delete(id);
    }
  };

  return {
    spawn: field.spawn,
    /** 推進動畫並更新 3D 物件；回傳這一步落地的隕石 */
    update(dt) {
      const impacts = field.step(dt);
      sync();
      return impacts;
    },
    get count() { return field.meteors.length; },
    maxCount: METEOR.max,
  };
}
