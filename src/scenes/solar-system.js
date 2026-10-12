import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, orbitPosition, planetNameKey, planetSubtitleKey } from '../data/planets.js';
import { createTerrainField } from '../sim/terrain-field.js';
import { createTerrainMesh, createTrees, tintedPalette, EARTHY } from '../kit/terrain.js';
import { createSky, createStars } from '../kit/space.js';

const SUN_RADIUS = 11;
const STAR_COUNT = 3200;
const STAR_SHELL = 900;
/** 地形細分程度：主流星要能站人，細一點；其他星球遠看即可 */
const DETAIL = { town: 26, other: 10 };
/** 有小鎮的星球：主流星是綠地，ETF 星是金黃色的秋天，恐懼貪婪星是灰綠色 */
const TOWN_STYLES = {
  major: { palette: EARTHY, greens: ['#5fb36a', '#6fc07a', '#4fa35e', '#86c96f'] },
  etf: {
    palette: { ...EARTHY, grass: '#d8c477', sand: '#f3e3b0', plaza: '#ece0c4' },
    greens: ['#e0a63a', '#d98b2b', '#c9b14a', '#e8c25a'],
  },
  // 恐懼貪婪星：帶點灰的薄荷綠，晴天雨天都看得清楚
  mood: {
    palette: { ...EARTHY, grass: '#a9c9a0', sand: '#e9dfc4', plaza: '#e4dccb' },
    greens: ['#7fae86', '#6f9f7a', '#94bb8c', '#86b3a0'],
  },
};

function atmosphere(radius, color) {
  const material = new THREE.ShaderMaterial({
    uniforms: { glowColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // 只畫背面：星球本體擋住中央，只剩輪廓外的一圈光暈，靠近星球最亮、往外淡出
        float glow = smoothstep(0.0, 0.45, abs(dot(vNormal, vView)));
        gl_FragColor = vec4(glowColor, glow * 0.55);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.14, 48, 32), material);
}

function orbitLine(radius) {
  const points = Array.from({ length: 257 }, (_, i) => {
    const a = (i / 256) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
  });
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: '#3a4a6b', transparent: true, opacity: 0.55 }),
  );
}

function planetLabel(planet) {
  const el = document.createElement('div');
  el.className = `planet-label${planet.enabled ? '' : ' locked'}`;
  el.dataset.planet = planet.id;
  const name = document.createElement('strong');
  const sub = document.createElement('span');
  el.append(name, sub);
  const object = new CSS2DObject(el);
  object.setText = (t) => {
    name.textContent = planet.enabled ? t(planetNameKey(planet)) : `🔒 ${t(planetNameKey(planet))}`;
    sub.textContent = t(planetSubtitleKey(planet));
  };
  return object;
}

function createSun() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.IcosahedronGeometry(SUN_RADIUS, 3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc766').multiplyScalar(1.1), toneMapped: false }),
  ));
  group.add(atmosphere(SUN_RADIUS * 1.1, '#ff9f45'));
  const light = new THREE.PointLight('#fff4e0', 1.5, 0, 0);
  group.add(light);
  return { group, light };
}

function createPlanetBody(config, index, radius, townField) {
  const seed = 101 + index * 17;
  if (townField) {
    const group = new THREE.Group();
    const style = TOWN_STYLES[config.id] ?? TOWN_STYLES.major;
    const mesh = createTerrainMesh({ radius, field: townField, palette: style.palette, detail: DETAIL.town, seed });
    group.add(mesh, createTrees({ radius, field: townField, seed, greens: style.greens }));
    return { body: group, mesh };
  }
  const field = createTerrainField({ seed, waterLevel: -0.05 });
  const palette = tintedPalette(config.color);
  const mesh = createTerrainMesh({ radius, field, palette, detail: DETAIL.other, seed });
  if (!config.enabled) mesh.material.color.setScalar(0.72);
  return { body: mesh, mesh };
}

/**
 * 太陽系：太陽、低多邊形星球、軌道線、星雲與星空。
 * available：這次實際能進入的星球（例如 ETF 資料沒載入就維持上鎖）。
 * @param {THREE.Scene} scene
 * @param {{renderer: THREE.WebGLRenderer, skyWidth: number, radii: Record<string, number>, townFields: Record<string, Function>, available: Set<string>, t: Function}} opts
 */
export function createSolarSystem(scene, { renderer, skyWidth, radii, townFields, available, t }) {
  const ambient = new THREE.AmbientLight('#fffaf2', 0.55);
  const hemi = new THREE.HemisphereLight('#fff6ea', '#7d6d60', 0.6);
  const sky = createSky(renderer, { width: skyWidth });
  const stars = createStars({ count: STAR_COUNT, shell: STAR_SHELL, seed: 2026, pixelRatio: renderer.getPixelRatio() });
  const sun = createSun();
  scene.add(ambient, hemi, sky.mesh, stars.points, sun.group);

  const planets = new Map(PLANETS.map((base, i) => {
    const config = { ...base, enabled: base.enabled && available.has(base.id) };
    const radius = radii[config.id] ?? config.radius;
    const group = new THREE.Group();
    const { body, mesh } = createPlanetBody(config, i, radius, townFields[config.id]);
    mesh.userData.planetId = config.id;
    const label = planetLabel(config);
    label.position.set(0, radius + 4.5, 0);
    const glow = atmosphere(radius, config.color);
    group.add(body, glow, label);
    scene.add(orbitLine(config.orbit), group);
    return [config.id, { config, group, mesh, label, radius, glow }];
  }));

  const update = (time) => {
    for (const p of planets.values()) {
      const { x, z } = orbitPosition(p.config, time);
      p.group.position.set(x, 0, z);
    }
  };

  const pick = (raycaster) => {
    const hit = raycaster.intersectObjects([...planets.values()].map((p) => p.mesh), false)[0];
    return hit ? planets.get(hit.object.userData.planetId) : null;
  };

  const setLanguage = (translate) => {
    for (const p of planets.values()) p.label.setText(translate);
  };

  /** 夜晚：環境光轉為冷色並變暗、陽光減弱、星星變大；白天反之（k：0 白天～1 夜晚） */
  const DAY_AMBIENT = new THREE.Color('#fffaf2');
  const NIGHT_AMBIENT = new THREE.Color('#7f93c9');
  const setNight = (k) => {
    ambient.color.lerpColors(DAY_AMBIENT, NIGHT_AMBIENT, k);
    ambient.intensity = 0.55 - 0.33 * k;
    hemi.intensity = 0.6 - 0.45 * k;
    sun.light.intensity = 1.5 - 0.9 * k;
    stars.setNight(k);
    sky.setNight(k);
  };

  /** 每幀：星星閃爍用真實時間，星空與天空球都跟著鏡頭 */
  const animate = (seconds, cameraPosition) => {
    stars.tick(seconds, cameraPosition, renderer.getPixelRatio());
    sky.follow(cameraPosition);
  };

  /** 改變某顆星球的大氣光暈顏色（恐懼貪婪星依指數變色） */
  const setGlow = (id, color) => {
    planets.get(id)?.glow.material.uniforms.glowColor.value.set(color);
  };

  setLanguage(t);
  update(0);
  return { planets, update, pick, setLanguage, setNight, animate, setGlow };
}
