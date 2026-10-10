import * as THREE from 'three';
import { createBuilding } from './buildings.js';
import { flat, PALETTE } from './materials.js';

const RAIL = new THREE.BoxGeometry(0.035, 0.035, 1.9).translate(0, 0.22, 2.1);
const POST = new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6).translate(0, 0.13, 0);

/**
 * 一間店＝依市值分級的建築＋門口兩側的排隊欄杆。
 * 等級或品牌色改變才重建建築；只有漲跌改變時只換遮雨棚顏色。
 */
export function createShop() {
  const group = new THREE.Group();
  for (const x of [-0.33, 0.33]) {
    const rail = new THREE.Mesh(RAIL, flat(PALETTE.rail));
    rail.position.x = x;
    group.add(rail);
    for (const z of [1.2, 3.0]) {
      const post = new THREE.Mesh(POST, flat(PALETTE.rail));
      post.position.set(x, 0, z);
      group.add(post);
    }
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
