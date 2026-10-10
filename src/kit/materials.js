import * as THREE from 'three';

/** 低多邊形風格共用材質：平面著色（flat shading），同色共用一份 */
const cache = new Map();

export function flat(color) {
  const key = `flat:${color}`;
  if (!cache.has(key)) cache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return cache.get(key);
}

/** 會被 Bloom 帶出柔光的發光材質（窗戶、信號燈） */
export function glow(color, intensity = 1) {
  const key = `glow:${color}:${intensity}`;
  if (!cache.has(key)) {
    cache.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }));
  }
  return cache.get(key);
}

/**
 * 日夜會變亮度的發光材質（窗戶、路燈）：白天低於 Bloom 門檻只是淺色，晚上亮起來泛光。
 * 由 applyNight(k) 統一調整，k＝0 白天、1 夜晚。
 */
const nightables = [];

export function nightGlow(color, dayIntensity, nightIntensity) {
  const key = `night:${color}:${dayIntensity}:${nightIntensity}`;
  if (!cache.has(key)) {
    const base = new THREE.Color(color);
    const material = new THREE.MeshBasicMaterial({ color: base.clone().multiplyScalar(dayIntensity), toneMapped: false });
    nightables.push({ material, base, dayIntensity, nightIntensity });
    cache.set(key, material);
  }
  return cache.get(key);
}

export function applyNight(k) {
  for (const { material, base, dayIntensity, nightIntensity } of nightables) {
    material.color.copy(base).multiplyScalar(dayIntensity + (nightIntensity - dayIntensity) * k);
  }
}

/** 品牌色調成粉彩：往白色混一點，跟整體柔和色調搭配 */
export function pastel(color, amount = 0.22) {
  return `#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), amount).getHexString()}`;
}

export const PALETTE = Object.freeze({
  walls: ['#f6efe6', '#efe4d6', '#e8eef3', '#f3e7ea', '#eaf1e6'],
  trim: '#d8cdbf',
  door: '#8a5a3c',
  window: '#ffe6a0',
  glass: '#9fd3ea',
  metal: '#c9cfd6',
  rail: '#b8bfc8',
  /** 條紋遮雨棚的米白：純白在 Bloom 下會糊成光團 */
  stripe: '#e9e1d4',
  lampPost: '#5b6470',
  lampLight: '#ffd88a',
  wood: '#a87b55',
  lawn: '#7fc47c',
  path: '#efe3cc',
  stone: '#d9d2c5',
});
