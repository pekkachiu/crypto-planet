import * as THREE from 'three';
import { capPoints } from '../sim/sphere.js';
import { createRng } from '../sim/rng.js';
import { cloudPlan, MAX_CLOUDS } from '../sim/mood-layout.js';

/** 雲飄在地表上方幾倍半徑；雨從雲底落到地面 */
const CLOUD_LIFT = 0.24;
const RAIN_DROPS = 900;
const RAIN_SPEED = 0.55;
const STREAK = 0.035;
/** 雨絲在雲底的散布範圍（切面方向，以半徑為單位） */
const RAIN_SPREAD = 0.09;
const CLOUD_DRIFT = 0.03;
const WHITE = new THREE.Color('#f7f8fc');
const STORM = new THREE.Color('#7c8496');
/** 雲不飄到儀表上方（與儀表方向夾角小於這個值的位置不放雲），免得擋住儀表 */
const CLEAR_ANGLE = 0.6;
const SUN_COLOR = new THREE.Color('#ffd36b');

/** 雲朵共用的幾顆二十面體，大小用 scale 調整 */
const PUFF = new THREE.IcosahedronGeometry(1, 1);

/** 低多邊形雲：幾顆二十面體疊在一起，底部壓平 */
function createCloud(rng, material) {
  const cloud = new THREE.Group();
  const puffs = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < puffs; i++) {
    const r = 0.4 + rng() * 0.3;
    const puff = new THREE.Mesh(PUFF, material);
    puff.position.set((i - (puffs - 1) / 2) * 0.5, rng() * 0.2, (rng() - 0.5) * 0.45);
    puff.scale.set(r, r * 0.6, r);
    cloud.add(puff);
  }
  return cloud;
}

/** 讓物件的 +y 朝向球面法向量 n */
const UP = new THREE.Vector3(0, 1, 0);
function orient(object, n) {
  object.quaternion.setFromUnitVectors(UP, n);
}

/** 太陽：淺黃色圓盤加一圈光芒（亮度刻意低於 Bloom 門檻，白天不會糊成光團） */
function createSun() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: SUN_COLOR.clone().multiplyScalar(1.2), toneMapped: false });
  group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), material));
  const rays = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const ray = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 4).translate(0, 1.6, 0), material);
    ray.rotation.z = (i / 10) * Math.PI * 2;
    rays.add(ray);
  }
  group.add(rays);
  return { group, rays, material };
}

/**
 * 恐懼貪婪星的天氣：恐懼時烏雲下雨、貪婪時太陽高照，中性時幾朵白雲。
 * 掛在星球群組底下跟著星球移動；雲和雨繞著儀表方向 focus 慢慢飄，不會飄過儀表；太陽固定在儀表右上方。
 * setWeather({ rain, sun }) 設定強度（0～1）。
 */
export function createWeather(radius, focus) {
  const group = new THREE.Group();
  const drift = new THREE.Group();
  group.add(drift);
  const rng = createRng(4242);
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: WHITE.clone(), flatShading: true });
  const cloudHeight = radius * (1 + CLOUD_LIFT);
  // 雲撒在整顆星球上，避開儀表上方；離儀表近的排前面，雲少的時候也看得到
  const dirs = capPoints(MAX_CLOUDS * 3, -1)
    .map(({ x, y, z }) => new THREE.Vector3(x, y, z))
    .filter((n) => n.angleTo(focus) > CLEAR_ANGLE)
    .sort((a, b) => a.angleTo(focus) - b.angleTo(focus))
    .filter((_, i) => i % 2 === 0)
    .slice(0, MAX_CLOUDS);
  const clouds = dirs.map((n) => {
    const cloud = createCloud(rng, cloudMaterial);
    cloud.position.copy(n).multiplyScalar(cloudHeight);
    orient(cloud, n);
    cloud.rotateY(rng() * Math.PI * 2);
    cloud.visible = false;
    drift.add(cloud);
    return cloud;
  });

  // 雨：每滴是一小段線，沿法向量往星球中心落下
  const drops = Array.from({ length: RAIN_DROPS }, () => ({
    dir: new THREE.Vector3(), r: radius + rng() * (cloudHeight - radius), jitter: [rng() - 0.5, rng() - 0.5],
  }));
  const positions = new Float32Array(RAIN_DROPS * 6);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#9cc7ff', transparent: true, opacity: 0.75 }));
  rain.frustumCulled = false;
  drift.add(rain);

  const sun = createSun();
  /**
   * 太陽的位置要避開畫面四角的介面：橫式螢幕星球填滿高度，太陽放右側；
   * 直式螢幕星球填滿寬度，太陽放左上方的空白處。
   */
  const setAspect = (aspect) => {
    if (aspect >= 1) sun.group.position.set(radius * 1.25, radius * 0.7, radius * 0.2);
    else sun.group.position.set(-radius * 0.85, radius * 1.15, radius * 0.2);
  };
  setAspect(1);
  group.add(sun.group);

  let state = { rain: 0, sun: 0 };
  let cloudCount = 0;
  let activeDrops = 0;

  /** 雨滴分配到目前看得到的雲底下，在雲的切面上隨機散開 */
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const assignDrops = () => {
    const tangent = new THREE.Vector3();
    const bitangent = new THREE.Vector3();
    drops.forEach((d, i) => {
      const n = dirs[i % Math.max(1, cloudCount)];
      tangent.crossVectors(n, Math.abs(n.y) < 0.9 ? UP : X_AXIS).normalize();
      bitangent.crossVectors(n, tangent);
      d.dir.copy(n).addScaledVector(tangent, d.jitter[0] * 2 * RAIN_SPREAD).addScaledVector(bitangent, d.jitter[1] * 2 * RAIN_SPREAD).normalize();
    });
  };

  const setWeather = (next) => {
    state = next;
    const plan = cloudPlan(next);
    cloudCount = plan.count;
    clouds.forEach((c, i) => { c.visible = i < cloudCount; });
    cloudMaterial.color.lerpColors(WHITE, STORM, plan.darkness);
    activeDrops = cloudCount > 0 ? Math.round(RAIN_DROPS * next.rain) : 0;
    rain.visible = activeDrops > 0;
    rainGeo.setDrawRange(0, activeDrops * 2);
    sun.group.visible = next.sun > 0;
    sun.group.scale.setScalar(radius * (0.06 + 0.06 * next.sun));
    assignDrops();
  };

  const step = (dt) => {
    if (sun.group.visible) sun.rays.rotation.z += dt * 0.25;
    drift.rotateOnAxis(focus, dt * CLOUD_DRIFT);
    if (!rain.visible) return;
    const fall = radius * RAIN_SPEED * dt;
    const len = radius * STREAK;
    for (let i = 0; i < activeDrops; i++) {
      const d = drops[i];
      d.r -= fall;
      if (d.r < radius) d.r = cloudHeight - (radius - d.r);
      const o = i * 6;
      positions[o] = d.dir.x * d.r;
      positions[o + 1] = d.dir.y * d.r;
      positions[o + 2] = d.dir.z * d.r;
      positions[o + 3] = d.dir.x * (d.r - len);
      positions[o + 4] = d.dir.y * (d.r - len);
      positions[o + 5] = d.dir.z * (d.r - len);
    }
    rainGeo.attributes.position.needsUpdate = true;
  };

  return { group, setWeather, setAspect, step, get state() { return state; } };
}
