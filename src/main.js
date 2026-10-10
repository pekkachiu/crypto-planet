import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { loadTopCoins } from './data/api.js';
import { mapTown, planetRadius } from './data/mapping.js';
import { REFRESH_MS } from './data/config.js';
import { createSolarSystem } from './scenes/solar-system.js';
import { createTown } from './scenes/planet-town.js';
import { createCameraRig, HOME } from './scenes/camera-rig.js';
import { createUI } from './ui/panel.js';

const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
const QUALITY = IS_MOBILE ? { maxPixelRatio: 1.5, bloomScale: 0.5 } : { maxPixelRatio: 2, bloomScale: 1 };
const TAP = { maxMove: 8, maxMs: 450 };
const MAX_FRAME_DT = 0.1;
/** 鏡頭離星球幾倍半徑內才畫人潮 */
const CROWD_VISIBLE_FACTOR = 5;
const SOLAR_DISTANCE = { min: 40, max: 700 };
/** 星球全景的縮放範圍（以半徑為單位）：最近停在地表上空，避免一路衝到地面 */
const PLANET_DISTANCE = { min: 1.6, max: 6 };
/** 店門口特寫：鏡頭在店前方 back、上方 up，注視店面 lookHeight 高度 */
const SHOP_VIEW = { up: 3.4, back: 6.2, lookHeight: 0.7 };
const SHOP_DISTANCE = { min: 2.2, max: 24 };
/** 繞店旋轉時，鏡頭最低只到接近地平線，不會鑽到地底 */
const SHOP_MAX_POLAR = 1.38;
/** 進入星球時的鏡頭位置（相對星球中心，以半徑為單位）：從南方斜上看北半球的小鎮 */
const PLANET_VIEW = new THREE.Vector3(0, 2.9, 2.2);

// ---------- 渲染器與場景 ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'labels-layer';
document.body.insertBefore(labelRenderer.domElement, stage.nextSibling);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070b14');
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 4000);
camera.position.copy(HOME.position);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = SOLAR_DISTANCE.min;
controls.maxDistance = SOLAR_DISTANCE.max;
controls.target.copy(HOME.target);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(innerWidth * QUALITY.bloomScale, innerHeight * QUALITY.bloomScale), 0.85, 0.5, 0.82,
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.resolution.set(innerWidth * QUALITY.bloomScale, innerHeight * QUALITY.bloomScale);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- 狀態 ----------
const rig = createCameraRig(camera, controls);
/** view：solar（太陽系）→ planet（星球全景）→ shop（店門口特寫）；飛行中為 flying */
const state = { view: 'solar', speed: 1, simTime: 0, shopIndex: -1, focused: null };
let solar = null;
let town = null;
let majorRadius = 0;

const ui = createUI({
  onBack: () => goBack(),
  onSpeed: (speed) => { state.speed = speed; },
  onClose: () => { if (state.view === 'shop') goBack(); else ui.hideCoin(); },
  onPickCoin: (index) => enterShop(index),
});

// ---------- 視角切換 ----------
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function setDistance({ min, max }, maxPolar = Math.PI) {
  controls.minDistance = min;
  controls.maxDistance = max;
  controls.maxPolarAngle = maxPolar;
}

/** 直式螢幕水平視角較窄，鏡頭要依寬高比拉遠，畫面才放得下 */
const PORTRAIT_FIT_ASPECT = 1.1;
const fitFactor = () => Math.max(1, PORTRAIT_FIT_ASPECT / camera.aspect);

async function fly(view, shot, distance, maxPolar) {
  state.view = 'flying';
  document.body.dataset.view = 'flying';
  setDistance({ min: 0, max: Infinity });
  await rig.flyTo(shot);
  setDistance(distance, maxPolar);
  state.view = view;
}

function planetDistance(planet) {
  return { min: planet.radius * PLANET_DISTANCE.min, max: planet.radius * PLANET_DISTANCE.max * fitFactor() };
}

function planetShot(planet) {
  const center = planet.group.position.clone();
  const offset = PLANET_VIEW.clone().multiplyScalar(planet.radius * fitFactor());
  return { position: center.clone().add(offset), target: center, up: WORLD_UP };
}

/** 店門口特寫：站在店的正前方（南側）斜上方，上方向是該處地面法線 */
function shopShot(index) {
  const { position, up, south, scale } = town.shopFrame(index);
  const s = Math.max(1, scale) * fitFactor();
  return {
    position: position.clone().addScaledVector(up, SHOP_VIEW.up * s).addScaledVector(south, SHOP_VIEW.back * s),
    target: position.clone().addScaledVector(up, SHOP_VIEW.lookHeight),
    up,
  };
}

async function enterPlanet(planet) {
  if (state.view !== 'solar') return;
  if (!planet.config.enabled) {
    ui.toast(`${planet.config.name}即將開放`);
    return;
  }
  state.focused = planet;
  await fly('planet', planetShot(planet), planetDistance(planet));
  planet.label.visible = false;
  ui.setView('planet', planet.config);
}

async function enterShop(index) {
  if (state.view !== 'planet' && state.view !== 'shop') return;
  const mapped = town.mappedAt(index);
  state.shopIndex = index;
  ui.showCoin(mapped);
  ui.setCoins(townData, mapped.coin.id);
  await fly('shop', shopShot(index), SHOP_DISTANCE, SHOP_MAX_POLAR);
  ui.setView('shop', state.focused.config, mapped.coin);
}

async function goBack() {
  if (state.view === 'shop') {
    state.shopIndex = -1;
    ui.hideCoin();
    ui.setCoins(townData, null);
    const planet = state.focused;
    await fly('planet', planetShot(planet), planetDistance(planet));
    ui.setView('planet', planet.config);
    return;
  }
  if (state.view === 'planet') {
    const planet = state.focused;
    await fly('solar', { ...HOME, up: WORLD_UP }, SOLAR_DISTANCE);
    planet.label.visible = true;
    state.focused = null;
    ui.setView('solar');
  }
}

// ---------- 點擊（區分點擊與拖曳） ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;

renderer.domElement.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || !solar) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const quick = performance.now() - down.t < TAP.maxMs;
  down = null;
  if (moved > TAP.maxMove || !quick) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  handleTap();
});

function handleTap() {
  if (state.view === 'planet' || state.view === 'shop') {
    const index = town.pick(raycaster);
    if (index >= 0) enterShop(index);
    return;
  }
  if (state.view === 'solar') {
    const planet = solar.pick(raycaster);
    if (planet) enterPlanet(planet);
  }
}

labelRenderer.domElement.addEventListener('click', (e) => {
  const id = e.target.closest('[data-planet]')?.dataset.planet;
  if (id && state.view === 'solar') enterPlanet(solar.planets.get(id));
});

// ---------- 資料 ----------
let townData = [];

function applyData(coins) {
  townData = mapTown(coins);
  town.setData(townData);
  // 排名變動時，資訊卡跟著鏡頭正在看的那間店
  const current = town.mappedAt(state.shopIndex);
  if (current) ui.showCoin(current);
  ui.setCoins(townData, current?.coin.id ?? null);
}

async function refresh() {
  const result = await loadTopCoins();
  if (result.source === 'live') {
    applyData(result.coins);
    ui.setStatus(result);
  } else {
    ui.setStatus(result, { keptPrevious: townData.length > 0 });
  }
}

async function start() {
  const first = await loadTopCoins();
  const totalCap = first.coins.reduce((sum, c) => sum + c.marketCap, 0);
  majorRadius = planetRadius(totalCap);
  solar = createSolarSystem(scene, { major: majorRadius });
  town = createTown(solar.planets.get('major').group, majorRadius);
  applyData(first.coins);
  ui.setStatus(first);
  ui.setView('solar');
  ui.doneLoading();
  setInterval(refresh, REFRESH_MS);
  renderer.setAnimationLoop(frame);
}

// ---------- 每幀 ----------
const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(clock.getDelta(), MAX_FRAME_DT);
  const simDt = dt * state.speed;
  if (state.view === 'solar') {
    state.simTime += simDt;
    solar.update(state.simTime);
  }
  if (rig.flying) rig.update(dt);
  else controls.update();

  town.step(simDt);
  const major = solar.planets.get('major');
  const crowdRange = majorRadius * CROWD_VISIBLE_FACTOR * fitFactor();
  const nearTown = camera.position.distanceTo(major.group.position) < crowdRange;
  town.setCrowdVisible(nearTown);
  if (nearTown) town.render();

  composer.render();
  labelRenderer.render(scene, camera);
}

start().catch((err) => {
  console.error('[crypto-planet] 啟動失敗', err);
  ui.toast('啟動失敗，請重新整理頁面');
});
