import * as THREE from 'three';
import { capPoints, tangentFrame, groundHeight } from '../sim/sphere.js';
import { createShopSim } from '../sim/crowd.js';
import { createRng } from '../sim/rng.js';
import { RANGES } from '../data/mapping.js';
import { createShop } from '../kit/shop.js';
import { createSignboard } from '../kit/signboard.js';
import { createCrowdMesh } from '../kit/crowd-mesh.js';
import { TREND_COLORS, coinColor, walkerColor } from '../kit/palette.js';

/** 店面分布的球帽下緣（y 座標），排名越前越靠近北極 */
const CAP_MIN_Y = 0.05;
const PLAZA_RADIUS = 3.4;
const BOB_HEIGHT = 0.03;
const MAX_PER_SHOP = RANGES.pedestrians[1] + 2 * RANGES.queue[1] + 16;

const UP = new THREE.Vector3(0, 1, 0);
const toV3 = ({ x, y, z }) => new THREE.Vector3(x, y, z);

function createPlaza(radius, normal) {
  const theta = PLAZA_RADIUS / radius;
  const geo = new THREE.SphereGeometry(radius + 0.015, 40, 6, 0, Math.PI * 2, 0, theta);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#6b7587', roughness: 0.95 }));
  mesh.quaternion.setFromUnitVectors(UP, normal);
  return mesh;
}

/** 店面錨點：位於球面上，區域座標 x＝東、y＝法向量、z＝南（門朝南） */
function createAnchor(radius, n) {
  const { up, east, south } = tangentFrame(n);
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  anchor.matrix.makeBasis(toV3(east), toV3(up), toV3(south)).setPosition(toV3(n).multiplyScalar(radius));
  return anchor;
}

const scratch = {
  local: new THREE.Matrix4(),
  world: new THREE.Matrix4(),
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(1, 1, 1),
};

// 預先建好顏色物件，每幀上千人不必重複解析色碼字串
const BUY_COLOR = new THREE.Color(TREND_COLORS.up);
const SELL_COLOR = new THREE.Color(TREND_COLORS.down);
const walkerColors = new Map();

function agentColor(agent) {
  if (agent.kind === 'buy') return BUY_COLOR;
  if (agent.kind === 'sell') return SELL_COLOR;
  const hex = walkerColor(agent.tint);
  if (!walkerColors.has(hex)) walkerColors.set(hex, new THREE.Color(hex));
  return walkerColors.get(hex);
}

/**
 * 在星球表面蓋小鎮：每個幣種一間店、一面招牌、一組人潮模擬。
 * 所有物件都掛在 planetGroup 底下，星球移動或自轉時整座小鎮一起動。
 */
export function createTown(planetGroup, radius) {
  const root = new THREE.Group();
  planetGroup.add(root);
  let shops = [];
  let crowd = null;

  const disposeAll = () => {
    shops.forEach((s) => { s.shop.dispose(); s.sign.dispose(); s.plaza.geometry.dispose(); s.plaza.material.dispose(); });
    crowd?.dispose();
    root.clear();
  };

  const build = (count) => {
    disposeAll();
    crowd = createCrowdMesh(count * MAX_PER_SHOP);
    root.add(crowd.group);
    shops = capPoints(count, CAP_MIN_Y).map((p, i) => {
      const normal = toV3(p);
      const anchor = createAnchor(radius, p);
      const shop = createShop();
      const sign = createSignboard();
      shop.group.userData.shopIndex = i;
      const plaza = createPlaza(radius, normal);
      anchor.add(shop.group, sign.sprite);
      root.add(plaza, anchor);
      return { anchor, shop, sign, plaza, sim: null, mapped: null };
    });
  };

  const setData = (mappedList) => {
    if (mappedList.length !== shops.length) build(mappedList.length);
    mappedList.forEach((mapped, i) => {
      const s = shops[i];
      const color = coinColor(mapped.coin.symbol);
      s.mapped = mapped;
      s.shop.setStyle({ color, trendColor: TREND_COLORS[mapped.trend] });
      s.sign.draw(mapped.coin, mapped.trend, color);
      s.color = color;
      if (s.sim) s.sim.update(mapped);
      else s.sim = createShopSim(mapped, createRng(i + 1));
      s.shop.group.scale.setScalar(mapped.shopScale);
    });
  };

  const step = (dt) => {
    for (const s of shops) s.sim?.step(dt);
  };

  /** 把每個人的切面座標換成星球座標，寫入 InstancedMesh */
  const render = () => {
    if (!crowd) return;
    crowd.begin();
    for (const s of shops) {
      if (!s.sim) continue;
      for (const a of s.sim.agents) {
        const bob = a.moving ? Math.abs(Math.sin(a.phase)) * BOB_HEIGHT : 0;
        scratch.pos.set(a.x, groundHeight(radius, a.x, a.z) + bob, a.z);
        scratch.quat.setFromAxisAngle(UP, a.heading);
        scratch.local.compose(scratch.pos, scratch.quat, scratch.scale);
        scratch.world.multiplyMatrices(s.anchor.matrix, scratch.local);
        crowd.push(scratch.world, agentColor(a));
      }
    }
    crowd.end();
  };

  const sphere = new THREE.Sphere(new THREE.Vector3(), radius);
  const sphereHit = new THREE.Vector3();

  /** 點擊判定：回傳被點到的店面索引，沒點到回傳 -1；被星球擋住的背面店面不算 */
  const pick = (raycaster) => {
    const targets = shops.flatMap((s) => [s.shop.group, s.sign.sprite]);
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return -1;
    planetGroup.getWorldPosition(sphere.center);
    if (raycaster.ray.intersectSphere(sphere, sphereHit)) {
      const planetDistance = raycaster.ray.origin.distanceTo(sphereHit);
      if (hit.distance > planetDistance + 0.5) return -1;
    }
    return shops.findIndex((s) => s.shop.group === hit.object.parent || s.sign.sprite === hit.object);
  };

  /** 店面在世界座標的位置與切面方向，給鏡頭飛到店門口用 */
  const shopFrame = (index) => {
    const world = new THREE.Matrix4().multiplyMatrices(planetGroup.matrixWorld, shops[index].anchor.matrix);
    const position = new THREE.Vector3();
    const east = new THREE.Vector3();
    const up = new THREE.Vector3();
    const south = new THREE.Vector3();
    world.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    world.extractBasis(east, up, south);
    return { position, up: up.normalize(), south: south.normalize(), scale: shops[index].mapped.shopScale };
  };

  return {
    root,
    setData,
    step,
    render,
    pick,
    shopFrame,
    /** 網頁字型載入完成後重畫招牌，避免先用備用字型畫好就一直停在那 */
    redrawSigns() {
      for (const s of shops) if (s.mapped) s.sign.draw(s.mapped.coin, s.mapped.trend, s.color);
    },
    mappedAt(index) { return shops[index]?.mapped ?? null; },
    indexOf(coinId) { return shops.findIndex((s) => s.mapped?.coin.id === coinId); },
    /** 遠景時只隱藏人潮（省效能），店面與招牌保持顯示 */
    setCrowdVisible(visible) { if (crowd) crowd.group.visible = visible; },
  };
}
