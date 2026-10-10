import * as THREE from 'three';
import { capPoints, tangentFrame, groundHeight } from '../sim/sphere.js';
import { createShopSim } from '../sim/crowd.js';
import { createRng } from '../sim/rng.js';
import { RANGES } from '../data/mapping.js';
import { TOP_N } from '../data/config.js';
import { createShop } from '../kit/shop.js';
import { createSignboard } from '../kit/signboard.js';
import { createCrowdMesh } from '../kit/crowd-mesh.js';
import { PALETTE, pastel } from '../kit/materials.js';
import { TREND_COLORS, coinColor, walkerColor } from '../kit/palette.js';
import { createPark } from '../kit/park.js';

/** 店面分布到整顆星球（y 從北極 1 到南極 -1），排名越前越靠近北極的公園 */
const CAP_MIN_Y = -1;
/** 廣場半徑：要蓋住整圈人行道（店外 2.8 × 3.6 的環形路線） */
export const PLAZA_RADIUS = 3.9;
const SIGN_GAP = 1.0;
const BOB_HEIGHT = 0.03;
const MAX_PER_SHOP = RANGES.pedestrians[1] + 2 * RANGES.queue[1] + 16;

/**
 * 小鎮在球面上的所有廣場位置（單位法向量）。有公園時第 0 個在北極、是爆倉公園，其後是店面；
 * 沒有公園時全部都是店面。點數固定，地形的廣場與店面不會因數量變動而錯開。
 */
export function townSpots({ park = true } = {}) {
  return capPoints(TOP_N + (park ? 1 : 0), CAP_MIN_Y);
}

const UP = new THREE.Vector3(0, 1, 0);
const toV3 = ({ x, y, z }) => new THREE.Vector3(x, y, z);

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

const tagShop = (object, index) => object.traverse((o) => { o.userData.shopIndex = index; });

/** 爆倉公園固定在北極，不隨幣種資料重建 */
function addPark(planetGroup, radius, spot) {
  const anchor = createAnchor(radius, spot);
  const park = createPark(radius);
  anchor.add(park.group);
  park.group.traverse((o) => { o.userData.park = true; });
  planetGroup.add(anchor);
  return { anchor, park };
}

/**
 * 在星球表面蓋小鎮：每個幣種（或 ETF）一棟依規模分級的建築、一面招牌、一組人潮模擬。
 * 所有物件都掛在 planetGroup 底下，星球移動時整座小鎮一起動。park：是否在北極放爆倉公園。
 */
export function createTown(planetGroup, radius, { park: withPark = true } = {}) {
  const root = new THREE.Group();
  planetGroup.add(root);
  let shops = [];
  let crowd = null;
  const spots = townSpots({ park: withPark });
  const parkSite = withPark ? addPark(planetGroup, radius, spots[0]) : null;
  const shopSpots = (count) => spots.slice(withPark ? 1 : 0).slice(0, count);

  const disposeAll = () => {
    shops.forEach((s) => { s.shop.dispose(); s.sign.dispose(); });
    crowd?.dispose();
    root.clear();
  };

  const build = (count) => {
    disposeAll();
    crowd = createCrowdMesh(count * MAX_PER_SHOP);
    root.add(crowd.group);
    shops = shopSpots(count).map((p) => {
      const anchor = createAnchor(radius, p);
      const shop = createShop(radius);
      const sign = createSignboard();
      anchor.add(shop.group, sign.sprite);
      root.add(anchor);
      return { anchor, shop, sign, sim: null, mapped: null, color: null };
    });
  };

  const setData = (mappedList) => {
    if (mappedList.length !== shops.length) build(mappedList.length);
    mappedList.forEach((mapped, i) => {
      const s = shops[i];
      const color = coinColor(mapped.coin.symbol);
      s.mapped = mapped;
      s.color = color;
      s.shop.setStyle({
        tier: mapped.tier,
        progress: mapped.tierProgress,
        brand: color,
        wall: mapped.tier <= 2 ? pastel(color, 0.62) : PALETTE.walls[i % PALETTE.walls.length],
        trendColor: TREND_COLORS[mapped.trend],
      });
      tagShop(s.shop.group, i);
      tagShop(s.sign.sprite, i);
      s.sign.sprite.position.y = s.shop.height + SIGN_GAP;
      s.sign.draw(mapped.sign, mapped.trend, color);
      if (s.sim) s.sim.update(mapped);
      else s.sim = createShopSim(mapped, createRng(i + 1));
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

  /**
   * 點擊判定：回傳 { kind: 'shop', index } 或 { kind: 'park' }，沒點到回傳 null。
   * 被星球擋住的背面物件不算。
   */
  const pick = (raycaster) => {
    const targets = [...(parkSite ? [parkSite.park.group] : []), ...shops.flatMap((s) => [s.shop.group, s.sign.sprite])];
    const hit = raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    planetGroup.getWorldPosition(sphere.center);
    if (raycaster.ray.intersectSphere(sphere, sphereHit)) {
      const planetDistance = raycaster.ray.origin.distanceTo(sphereHit);
      if (hit.distance > planetDistance + 0.5) return null;
    }
    if (hit.object.userData.park) return { kind: 'park' };
    const index = hit.object.userData.shopIndex;
    return index === undefined ? null : { kind: 'shop', index };
  };

  /** 錨點在世界座標的位置、切面方向與建築高度，給鏡頭飛到店門口或公園用 */
  const frameOf = (anchor, height) => {
    const world = new THREE.Matrix4().multiplyMatrices(planetGroup.matrixWorld, anchor.matrix);
    const position = new THREE.Vector3();
    const east = new THREE.Vector3();
    const up = new THREE.Vector3();
    const south = new THREE.Vector3();
    world.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    world.extractBasis(east, up, south);
    return { position, up: up.normalize(), south: south.normalize(), height };
  };
  const shopFrame = (index) => frameOf(shops[index].anchor, shops[index].shop.height);
  const parkFrame = () => (parkSite ? frameOf(parkSite.anchor, parkSite.park.height) : null);

  return {
    root,
    setData,
    step,
    render,
    pick,
    shopFrame,
    parkFrame,
    hasPark: withPark,
    setLiquidations(liqs, t) { parkSite?.park.setData(liqs, t); },
    redrawPark(t) { parkSite?.park.redraw(t); },
    /** 網頁字型載入完成後重畫招牌，避免先用備用字型畫好就一直停在那 */
    redrawSigns() {
      for (const s of shops) if (s.mapped) s.sign.draw(s.mapped.sign, s.mapped.trend, s.color);
    },
    mappedAt(index) { return shops[index]?.mapped ?? null; },
    indexOf(coinId) { return shops.findIndex((s) => s.mapped?.coin.id === coinId); },
    indexOfPair(pair) { return shops.findIndex((s) => s.mapped?.coin.pair === pair); },
    /** 遠景時只隱藏人潮（省效能），店面與招牌保持顯示 */
    setCrowdVisible(visible) { if (crowd) crowd.group.visible = visible; },
  };
}
