import * as THREE from 'three';

const BODY = new THREE.BoxGeometry(0.12, 0.2, 0.09).translate(0, 0.1, 0);
const HEAD = new THREE.BoxGeometry(0.095, 0.095, 0.095).translate(0, 0.25, 0);

/**
 * 全星球的方塊小人共用兩個 InstancedMesh（身體、頭），一次 draw call 畫上千人。
 * 每幀 begin() → push() × N → end()。
 */
export function createCrowdMesh(max) {
  const bodies = new THREE.InstancedMesh(BODY, new THREE.MeshStandardMaterial({ roughness: 0.75 }), max);
  const heads = new THREE.InstancedMesh(HEAD, new THREE.MeshStandardMaterial({ color: '#f1d3b3', roughness: 0.7 }), max);
  for (const mesh of [bodies, heads]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  bodies.setColorAt(0, new THREE.Color());
  bodies.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const group = new THREE.Group();
  group.add(bodies, heads);
  let n = 0;

  return {
    group,
    begin() { n = 0; },
    push(matrix, color) {
      if (n >= max) return;
      bodies.setMatrixAt(n, matrix);
      heads.setMatrixAt(n, matrix);
      bodies.setColorAt(n, color);
      n += 1;
    },
    end() {
      bodies.count = n;
      heads.count = n;
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      bodies.instanceColor.needsUpdate = true;
    },
  };
}
