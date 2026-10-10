import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, orbitPosition, planetNameKey, planetSubtitleKey } from '../data/planets.js';
import { createRng } from '../sim/rng.js';
import { createTerrainField } from '../sim/terrain-field.js';
import { createTerrainMesh, createTrees, tintedPalette, EARTHY } from '../kit/terrain.js';

const SUN_RADIUS = 11;
const STAR_COUNT = 2200;
const STAR_SHELL = 900;
/** 地形細分程度：主流星要能站人，細一點；其他星球遠看即可 */
const DETAIL = { town: 26, other: 10 };
const MAJOR_GREENS = ['#5fb36a', '#6fc07a', '#4fa35e', '#86c96f'];

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
  group.add(new THREE.PointLight('#fff4e0', 1.5, 0, 0));
  return group;
}

function createPlanetBody(config, index, radius, townField) {
  const seed = 101 + index * 17;
  if (townField) {
    const group = new THREE.Group();
    const mesh = createTerrainMesh({ radius, field: townField, palette: EARTHY, detail: DETAIL.town, seed });
    group.add(mesh, createTrees({ radius, field: townField, seed, greens: MAJOR_GREENS }));
    return { body: group, mesh };
  }
  const field = createTerrainField({ seed, waterLevel: -0.05 });
  const palette = tintedPalette(config.color);
  const mesh = createTerrainMesh({ radius, field, palette, detail: DETAIL.other, seed });
  if (!config.enabled) mesh.material.color.setScalar(0.72);
  return { body: mesh, mesh };
}

/**
 * 太陽系：太陽、五顆低多邊形星球、軌道線與星空。
 * @param {THREE.Scene} scene
 * @param {{radii: Record<string, number>, townFields: Record<string, Function>, t: Function}} opts
 */
export function createSolarSystem(scene, { radii, townFields, t }) {
  scene.add(new THREE.AmbientLight('#fffaf2', 0.55));
  scene.add(new THREE.HemisphereLight('#fff6ea', '#7d6d60', 0.6));
  scene.add(starfield(), createSun());

  const planets = new Map(PLANETS.map((config, i) => {
    const radius = radii[config.id] ?? config.radius;
    const group = new THREE.Group();
    const { body, mesh } = createPlanetBody(config, i, radius, townFields[config.id]);
    mesh.userData.planetId = config.id;
    const label = planetLabel(config);
    label.position.set(0, radius + 4.5, 0);
    group.add(body, atmosphere(radius, config.color), label);
    scene.add(orbitLine(config.orbit), group);
    return [config.id, { config, group, mesh, label, radius }];
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

  setLanguage(t);
  update(0);
  return { planets, update, pick, setLanguage };
}
