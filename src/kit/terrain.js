import * as THREE from 'three';
import { createRng } from '../sim/rng.js';

/** 主流星的地形配色（柔和粉彩） */
export const EARTHY = Object.freeze({
  water: '#6cc6e3', sand: '#f1dfa8', grass: '#93d38c', rock: '#b9a493', plaza: '#e8d6b9',
});

/** 其他星球用自己的主色調出一組配色 */
export function tintedPalette(color) {
  const base = new THREE.Color(color);
  const shade = (l, s = 0) => `#${base.clone().offsetHSL(0, s, l).getHexString()}`;
  return { water: shade(-0.18, -0.05), sand: shade(0.16, -0.1), grass: shade(0), rock: shade(0.1, -0.25), plaza: shade(0.2, -0.2) };
}

const TREE_SAMPLES = 1800;
const TREE_CHANCE = 0.42;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 低多邊形星球：細分的二十面體，每個頂點依地形場抬高，每個三角面一個顏色。
 * @param {{radius:number, field:Function, palette:object, detail:number, seed:number}} opts
 */
export function createTerrainMesh({ radius, field, palette, detail, seed }) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const rng = createRng(seed);
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  const kindColors = Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, new THREE.Color(v)]));

  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const { height } = field(n);
    pos.setXYZ(i, n.x * (radius + height), n.y * (radius + height), n.z * (radius + height));
  }
  // 每個三角面取重心決定顏色，再加一點明暗抖動，做出低多邊形的面感
  for (let i = 0; i < pos.count; i += 3) {
    n.set(0, 0, 0);
    for (let j = 0; j < 3; j++) n.add(new THREE.Vector3().fromBufferAttribute(pos, i + j));
    n.normalize();
    const { kind } = field(n);
    c.copy(kindColors[kind]).offsetHSL(0, 0, (rng() - 0.5) * (kind === 'plaza' ? 0.02 : 0.06));
    for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

/** 在草地上撒低多邊形樹（兩種：圓錐松樹、圓球闊葉樹），全部用 InstancedMesh */
export function createTrees({ radius, field, seed, greens }) {
  const rng = createRng(seed);
  const spots = [];
  for (let i = 0; i < TREE_SAMPLES; i++) {
    const y = 1 - (i / (TREE_SAMPLES - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const n = new THREE.Vector3(Math.cos(i * GOLDEN_ANGLE) * r, y, Math.sin(i * GOLDEN_ANGLE) * r);
    if (field.canPlant(n) && rng() < TREE_CHANCE) spots.push(n);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.06, 0.09, 0.4, 5).translate(0, 0.2, 0);
  const pineGeo = new THREE.ConeGeometry(0.42, 1.1, 6).translate(0, 0.9, 0);
  const roundGeo = new THREE.IcosahedronGeometry(0.42, 0).translate(0, 0.72, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: '#9b7653', flatShading: true }), spots.length);
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
  const rounds = new THREE.InstancedMesh(roundGeo, new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  let pineCount = 0;
  let roundCount = 0;

  spots.forEach((n, i) => {
    const { height } = field(n);
    p.copy(n).multiplyScalar(radius + height - 0.02);
    q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, rng() * Math.PI * 2));
    s.setScalar(0.7 + rng() * 0.6);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    color.set(greens[Math.floor(rng() * greens.length)]);
    if (rng() < 0.55) {
      pines.setMatrixAt(pineCount, m);
      pines.setColorAt(pineCount++, color);
    } else {
      rounds.setMatrixAt(roundCount, m);
      rounds.setColorAt(roundCount++, color);
    }
  });
  pines.count = pineCount;
  rounds.count = roundCount;

  const group = new THREE.Group();
  group.add(trunks, pines, rounds);
  return group;
}
