import * as THREE from 'three';
import { createBuilding } from './buildings.js';
import { flat, PALETTE } from './materials.js';
import { createLamp } from './lamp.js';
import { groundHeight } from '../sim/sphere.js';

const RAIL_FROM_Z = 1.15;
const RAIL_TO_Z = 3.05;
const RAIL_HEIGHT = 0.22;
const RAIL_X = [-0.33, 0.33];
/** 店前廣場兩側的路燈：在人行道環線外、廣場範圍內 */
const LAMPS = [[-3.2, 2.2], [3.2, 2.2]];

const RAIL = new THREE.BoxGeometry(0.035, 0.035, 1);
const POST = new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6).translate(0, 0.13, 0);

/** 隊伍欄杆：兩端立柱貼著球面，橫桿跟著坡度傾斜 */
function createRail(radius, x) {
  const group = new THREE.Group();
  const y1 = groundHeight(radius, x, RAIL_FROM_Z);
  const y2 = groundHeight(radius, x, RAIL_TO_Z);
  const length = Math.hypot(RAIL_TO_Z - RAIL_FROM_Z, y2 - y1);
  const rail = new THREE.Mesh(RAIL, flat(PALETTE.rail));
  rail.scale.z = length;
  rail.position.set(x, (y1 + y2) / 2 + RAIL_HEIGHT, (RAIL_FROM_Z + RAIL_TO_Z) / 2);
  rail.rotation.x = Math.atan2(y1 - y2, RAIL_TO_Z - RAIL_FROM_Z);
  group.add(rail);
  for (const [z, y] of [[RAIL_FROM_Z, y1], [RAIL_TO_Z, y2]]) {
    const post = new THREE.Mesh(POST, flat(PALETTE.rail));
    post.position.set(x, y, z);
    group.add(post);
  }
  return group;
}

/**
 * 一間店＝依市值分級的建築＋門口兩側的排隊欄杆＋兩盞路燈。
 * 等級或品牌色改變才重建建築；只有漲跌改變時只換遮雨棚顏色。
 * @param {number} radius 星球半徑（讓欄杆、路燈貼著彎曲的地面）
 */
export function createShop(radius) {
  const group = new THREE.Group();
  for (const x of RAIL_X) group.add(createRail(radius, x));
  for (const [x, z] of LAMPS) {
    const lamp = createLamp(x, z, Math.sign(x) * Math.PI / 2 * -1);
    lamp.position.y = groundHeight(radius, x, z);
    group.add(lamp);
  }

  let building = null;
  let key = '';

  return {
    group,
    get height() { return building?.height ?? 0; },
    setStyle({ tier, progress, brand, wall, trendColor }) {
      const nextKey = `${tier}:${progress.toFixed(2)}:${brand}:${wall}`;
      if (nextKey !== key) {
        if (building) {
          group.remove(building.group);
          building.dispose();
        }
        building = createBuilding({ tier, progress, brand, wall, trendColor });
        group.add(building.group);
        key = nextKey;
      }
      building.awning.color.set(trendColor);
    },
    dispose() {
      building?.dispose();
    },
  };
}
