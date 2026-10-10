import * as THREE from 'three';

// 所有店面共用幾何，只換材質顏色
const GEO = {
  body: new THREE.BoxGeometry(2.4, 1.8, 2.0).translate(0, 0.6, 0),
  roof: new THREE.BoxGeometry(2.62, 0.18, 2.22).translate(0, 1.59, 0),
  door: new THREE.PlaneGeometry(0.52, 0.82).translate(0, 0.41, 1.004),
  windowStrip: new THREE.PlaneGeometry(2.0, 0.26).translate(0, 1.18, 1.004),
  awning: new THREE.BoxGeometry(2.3, 0.06, 0.42).translate(0, 0.98, 1.2),
  rail: new THREE.BoxGeometry(0.03, 0.03, 1.9).translate(0, 0.2, 2.1),
};

const WALL_MAT = new THREE.MeshStandardMaterial({ color: '#2a3140', roughness: 0.85 });
const DOOR_MAT = new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb04a', emissiveIntensity: 0.9 });
const RAIL_MAT = new THREE.MeshStandardMaterial({ color: '#c8d0da', metalness: 0.6, roughness: 0.35 });

/** 一間店：主色屋頂與發光招牌條、依漲跌變色的遮雨棚、門口兩側的排隊欄杆 */
export function createShop() {
  const group = new THREE.Group();
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const glowMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const awningMat = new THREE.MeshStandardMaterial({ roughness: 0.5 });

  group.add(
    new THREE.Mesh(GEO.body, WALL_MAT),
    new THREE.Mesh(GEO.roof, roofMat),
    new THREE.Mesh(GEO.door, DOOR_MAT),
    new THREE.Mesh(GEO.windowStrip, glowMat),
    new THREE.Mesh(GEO.awning, awningMat),
  );
  // 中間走道兩側的欄杆，把買方、賣方隊伍與出口隔開
  for (const x of [-0.33, 0.33]) {
    const rail = new THREE.Mesh(GEO.rail, RAIL_MAT);
    rail.position.x = x;
    group.add(rail);
  }

  return {
    group,
    setStyle({ color, trendColor }) {
      roofMat.color.set(color);
      glowMat.color.set(color).multiplyScalar(1.6);
      awningMat.color.set(trendColor);
    },
    dispose() {
      roofMat.dispose();
      glowMat.dispose();
      awningMat.dispose();
    },
  };
}
