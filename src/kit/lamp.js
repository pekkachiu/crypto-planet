import * as THREE from 'three';
import { flat, nightGlow, PALETTE } from './materials.js';

const POST = new THREE.CylinderGeometry(0.035, 0.05, 1.3, 6).translate(0, 0.65, 0);
const ARM = new THREE.BoxGeometry(0.05, 0.05, 0.28).translate(0, 1.3, 0.1);
const HEAD = new THREE.IcosahedronGeometry(0.11, 0).translate(0, 1.24, 0.22);

/** 低多邊形路燈：白天燈罩是淡黃色，夜晚亮起並泛光（由 applyNight 控制） */
export function createLamp(x, z, heading = 0) {
  const lamp = new THREE.Group();
  lamp.add(
    new THREE.Mesh(POST, flat(PALETTE.lampPost)),
    new THREE.Mesh(ARM, flat(PALETTE.lampPost)),
    new THREE.Mesh(HEAD, nightGlow(PALETTE.lampLight, 0.85, 1.8)),
  );
  lamp.position.set(x, 0, z);
  lamp.rotation.y = heading;
  return lamp;
}
