import * as THREE from 'three';
import { flat, glow, nightGlow, pastel, PALETTE } from './materials.js';

/**
 * 四級建築，市值越大越高。所有建築一樓正面都在 z＝1（門口），
 * 占地不超過 2.4 × 2.0，才不會擋到門口兩側的隊伍與中間走道。
 */

const FRONT_Z = 1.0;

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

/** 三角柱屋頂（山牆），沿 x 方向延伸 */
function gableRoof(w, h, d, material, y) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  geo.translate(0, 0, -w / 2);
  geo.rotateY(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  return mesh;
}

/** 樓層窗帶：比牆面稍微凸出的一圈發光細條 */
function windowBands(w, d, fromY, toY, gap, z = 0) {
  const group = new THREE.Group();
  for (let y = fromY + gap * 0.5; y < toY - 0.15; y += gap) {
    group.add(box(w + 0.03, 0.13, d + 0.03, nightGlow(PALETTE.window, 0.9, 1.2), 0, y, z));
  }
  return group;
}

/** 一樓店面：門、兩側展示窗、依漲跌變色的遮雨棚 */
function storefront({ w, h, d, wall, awning, z = 0 }) {
  const group = new THREE.Group();
  group.add(box(w, h, d, flat(wall), 0, 0, z));
  const front = z + d / 2 + 0.01;
  group.add(box(0.5, 0.78, 0.04, flat(PALETTE.door), 0, 0, front));
  for (const x of [-0.75, 0.75]) group.add(box(0.55, 0.42, 0.04, nightGlow(PALETTE.glass, 0.85, 1.25), x, 0.32, front));
  const awn = box(w - 0.1, 0.07, 0.42, awning, 0, h - 0.18, front + 0.2);
  awn.rotation.x = 0.18;
  group.add(awn);
  return group;
}

function kiosk({ k, roof, wall, awning }) {
  const g = new THREE.Group();
  const h = 0.95 * k;
  const z = FRONT_Z - 0.55;
  g.add(box(1.5, h, 1.1, flat(wall), 0, 0, z));
  g.add(box(1.0, 0.36, 0.04, nightGlow(PALETTE.window, 0.9, 1.2), 0, h * 0.42, FRONT_Z + 0.01));
  g.add(box(1.4, 0.08, 0.04, flat(PALETTE.trim), 0, h * 0.38, FRONT_Z + 0.03));
  // 條紋遮雨棚：品牌色與白色交錯
  for (let i = 0; i < 5; i++) {
    const stripe = box(0.32, 0.06, 0.5, i % 2 ? flat(PALETTE.stripe) : awning, -0.64 + i * 0.32, h + 0.02, FRONT_Z + 0.08);
    stripe.rotation.x = 0.22;
    g.add(stripe);
  }
  g.add(box(1.6, 0.12, 1.2, flat(roof), 0, h + 0.12, z));
  const pole = box(0.04, 0.9, 0.04, flat(PALETTE.metal), 0.62, h + 0.24, z - 0.4);
  const flag = box(0.36, 0.22, 0.02, flat(roof), 0.81, h + 0.88, z - 0.4);
  g.add(pole, flag);
  return { group: g, height: h + 1.14 };
}

function shopHouse({ k, roof, wall, awning }) {
  const g = new THREE.Group();
  const ground = 1.1;
  const upper = 1.0 * k;
  g.add(storefront({ w: 2.4, h: ground, d: 2.0, wall, awning }));
  g.add(box(2.3, upper, 1.9, flat(pastel(wall, 0.0)), 0, ground, 0));
  for (const x of [-0.7, 0, 0.7]) {
    g.add(box(0.36, 0.42, 0.04, nightGlow(PALETTE.window, 0.9, 1.2), x, ground + upper * 0.3, 0.96));
    g.add(box(0.46, 0.06, 0.12, flat(PALETTE.trim), x, ground + upper * 0.3 - 0.06, 1.0));
  }
  const roofH = 0.75;
  g.add(gableRoof(2.55, roofH, 2.15, flat(roof), ground + upper));
  g.add(box(0.24, 0.5, 0.24, flat(PALETTE.trim), 0.75, ground + upper + 0.2, -0.45));
  return { group: g, height: ground + upper + roofH };
}

function officeTower({ k, roof, wall, awning }) {
  const g = new THREE.Group();
  const podium = 1.2;
  const tower = 2.6 * k;
  g.add(storefront({ w: 2.4, h: podium, d: 2.0, wall, awning }));
  g.add(box(2.0, tower, 1.7, flat(wall), 0, podium, -0.1));
  g.add(windowBands(2.0, 1.7, podium, podium + tower, 0.5, -0.1));
  const top = podium + tower;
  g.add(box(2.1, 0.22, 1.8, flat(roof), 0, top, -0.1));
  g.add(box(0.7, 0.35, 0.6, flat(PALETTE.metal), -0.4, top + 0.22, -0.3));
  return { group: g, height: top + 0.57 };
}

function skyscraper({ k, roof, wall, awning, brand }) {
  const g = new THREE.Group();
  const podium = 1.3;
  const t1 = 3.2 * k;
  const t2 = 1.4 * k;
  g.add(storefront({ w: 2.4, h: podium, d: 2.0, wall, awning }));
  g.add(box(2.0, t1, 1.7, flat(wall), 0, podium, -0.1));
  g.add(windowBands(2.0, 1.7, podium, podium + t1, 0.5, -0.1));
  const y2 = podium + t1;
  g.add(box(2.1, 0.16, 1.8, flat(roof), 0, y2, -0.1));
  g.add(box(1.45, t2, 1.25, flat(pastel(wall, 0)), 0, y2 + 0.16, -0.1));
  g.add(windowBands(1.45, 1.25, y2 + 0.16, y2 + 0.16 + t2, 0.5, -0.1));
  const y3 = y2 + 0.16 + t2;
  g.add(box(1.6, 0.34, 1.4, flat(roof), 0, y3, -0.1));
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.4, 6), flat(PALETTE.metal));
  spire.position.set(0, y3 + 0.34 + 0.7, -0.1);
  const beacon = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), glow(brand, 1.6));
  beacon.position.set(0, y3 + 0.34 + 1.45, -0.1);
  g.add(spire, beacon);
  return { group: g, height: y3 + 0.34 + 1.6 };
}

const BUILDERS = { 1: skyscraper, 2: officeTower, 3: shopHouse, 4: kiosk };

/**
 * @param {{tier:1|2|3|4, progress:number, brand:string, wall:string, trendColor:string}} opts
 * @returns {{group: THREE.Group, height: number, awning: THREE.Material, dispose: () => void}}
 */
export function createBuilding({ tier, progress, brand, wall, trendColor }) {
  const awning = new THREE.MeshLambertMaterial({ color: trendColor, flatShading: true });
  const k = 0.88 + 0.24 * progress;
  const { group, height } = BUILDERS[tier]({ k, roof: pastel(brand), wall, awning, brand });
  return {
    group,
    height,
    awning,
    dispose() {
      // 幾何每棟各自建立要釋放；材質大多是共用快取，只釋放這棟自己的遮雨棚材質
      group.traverse((o) => o.geometry?.dispose());
      awning.dispose();
    },
  };
}
