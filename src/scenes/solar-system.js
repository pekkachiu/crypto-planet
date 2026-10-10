import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, orbitPosition } from '../data/planets.js';
import { createRng } from '../sim/rng.js';

const SUN_RADIUS = 11;
const STAR_COUNT = 2200;
const STAR_SHELL = 900;

/** 用 canvas 畫一張有雲帶與斑點的星球貼圖，每顆星球依種子不同 */
function planetTexture(color, seed, { land = false } = {}) {
  const rng = createRng(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const base = new THREE.Color(color);
  ctx.fillStyle = land ? '#1d4f7a' : base.getStyle();
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) {
    const y = rng() * 256;
    const c = base.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.22);
    ctx.fillStyle = c.getStyle();
    ctx.globalAlpha = land ? 0 : 0.5;
    ctx.fillRect(0, y, 512, 4 + rng() * 18);
  }
  ctx.globalAlpha = 1;
  const blobs = land ? 70 : 24;
  for (let i = 0; i < blobs; i++) {
    const c = land
      ? new THREE.Color('#3f8f5a').offsetHSL((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.12)
      : base.clone().offsetHSL(0, 0, (rng() - 0.5) * 0.3);
    ctx.fillStyle = c.getStyle();
    ctx.beginPath();
    ctx.ellipse(rng() * 512, 30 + rng() * 196, 10 + rng() * (land ? 46 : 22), 6 + rng() * (land ? 30 : 10), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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
        gl_FragColor = vec4(glowColor, glow * 0.75);
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
    new THREE.LineBasicMaterial({ color: '#33415c', transparent: true, opacity: 0.55 }),
  );
}

function starfield() {
  const rng = createRng(2026);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const u = rng() * 2 - 1;
    const t = rng() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u) * STAR_SHELL;
    positions.set([Math.cos(t) * r, u * STAR_SHELL, Math.sin(t) * r], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.6, sizeAttenuation: false }));
}

function planetLabel(planet) {
  const el = document.createElement('div');
  el.className = `planet-label${planet.enabled ? '' : ' locked'}`;
  el.dataset.planet = planet.id;
  const name = document.createElement('strong');
  name.textContent = planet.enabled ? planet.name : `🔒 ${planet.name}`;
  const sub = document.createElement('span');
  sub.textContent = planet.subtitle;
  el.append(name, sub);
  return new CSS2DObject(el);
}

function createSun() {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(
    new THREE.SphereGeometry(SUN_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc861').multiplyScalar(2.2), toneMapped: false }),
  ));
  group.add(atmosphere(SUN_RADIUS * 1.25, '#ff9d3c'));
  group.add(new THREE.PointLight('#fff1d6', 2.6, 0, 0));
  return group;
}

/**
 * 太陽系：太陽、五顆星球、軌道線與星空。
 * radii 指定每顆星球的半徑（主流星依總市值計算）。
 */
export function createSolarSystem(scene, radii) {
  scene.add(new THREE.AmbientLight('#8fa6ff', 0.7));
  scene.add(new THREE.HemisphereLight('#bcd4ff', '#1a1f2e', 0.7));
  scene.add(starfield(), createSun());

  const planets = new Map(PLANETS.map((config, i) => {
    const radius = radii[config.id] ?? config.radius;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 96, 64),
      new THREE.MeshStandardMaterial({
        map: planetTexture(config.color, 101 + i * 17, { land: config.id === 'major' }),
        roughness: 0.92,
        emissive: new THREE.Color(config.color),
        emissiveIntensity: config.enabled ? 0.05 : 0.02,
      }),
    );
    if (!config.enabled) mesh.material.color.setScalar(0.55);
    mesh.userData.planetId = config.id;
    const label = planetLabel(config);
    label.position.set(0, radius + 4.5, 0);
    group.add(mesh, atmosphere(radius, config.color), label);
    scene.add(orbitLine(config.orbit), group);
    return [config.id, { config, group, mesh, label, radius }];
  }));

  const update = (t) => {
    for (const p of planets.values()) {
      const { x, z } = orbitPosition(p.config, t);
      p.group.position.set(x, 0, z);
    }
  };

  const pick = (raycaster) => {
    const hit = raycaster.intersectObjects([...planets.values()].map((p) => p.mesh), false)[0];
    return hit ? planets.get(hit.object.userData.planetId) : null;
  };

  update(0);
  return { planets, update, pick };
}
