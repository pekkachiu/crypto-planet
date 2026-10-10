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
import { createTown, townSpots, PLAZA_RADIUS } from './scenes/planet-town.js';
import { createTerrainField } from './sim/terrain-field.js';
import { planetNameKey } from './data/planets.js';
import { detectLang, createTranslator, STORAGE_KEY } from './i18n/index.js';
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
/** 店門口特寫：鏡頭在店前方 back、上方 up，注視店面 lookHeight 高度；高樓依 refHeight 等比拉遠 */
/** 注視點在門口隊伍中間（往南 lookAhead）、高度隨建築拉高一點，隊伍與樓頂都入鏡 */
const SHOP_VIEW = { up: 4.2, back: 7.4, lookRatio: 0.24, minLook: 0.8, lookAhead: 1.4, refHeight: 4.5 };
const MAJOR_TERRAIN_SEED = 118;
const SHOP_DISTANCE = { min: 2.2, max: 24 };
/** 繞店旋轉時，鏡頭最低只到接近地平線，不會鑽到地底 */
const SHOP_MAX_POLAR = 1.38;
/**
 * 進入星球時的鏡頭（以半徑為單位、相對星球中心）：從南方低角度斜看北半球的小鎮，
 * 注視點抬到小鎮所在的高度，看到的是店面正面與天際線，而不是一片屋頂。
 */
const PLANET_VIEW = Object.freeze({ camera: new THREE.Vector3(0, 1.3, 2.8), target: new THREE.Vector3(0, 0.6, 0) });

// ---------- 渲染器與場景 ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, QUALITY.maxPixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.className = 'labels-layer';
document.body.insertBefore(labelRenderer.domElement, stage.nextSibling);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#070b14');
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 4000);
camera.position.copy(HOME.position);
// 跟著鏡頭的補光：不論星球公轉到哪，看小鎮時都有柔和的面光，低多邊形的面才看得出來
const fillLight = new THREE.DirectionalLight('#fff6ea', 0.65);
fillLight.position.set(2, 4, 3);
camera.add(fillLight);
scene.add(camera);

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
  // 門檻 0.95：只有自發光（窗戶、信號燈、隕石、太陽）會泛光，被照亮的白牆不會糊成一片
  new THREE.Vector2(innerWidth * QUALITY.bloomScale, innerHeight * QUALITY.bloomScale), 0.7, 0.45, 0.95,
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
  refreshDistance();
});

// ---------- 狀態 ----------
const rig = createCameraRig(camera, controls);
/** view：solar（太陽系）→ planet（星球全景）→ shop（店門口特寫）；飛行中為 flying */
const state = { view: 'solar', speed: 1, simTime: 0, shopCoinId: null, focused: null };
let solar = null;
let town = null;
let majorRadius = 0;

// ---------- 語言 ----------
const storage = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(value) { try { localStorage.setItem(STORAGE_KEY, value); } catch { /* 無痕模式等情況存不了，不影響使用 */ } },
};
let lang = detectLang({ search: location.search, stored: storage.get(), languages: navigator.languages ?? [] });
let t = createTranslator(lang);

function toggleLang() {
  lang = lang === 'en' ? 'zh-TW' : 'en';
  t = createTranslator(lang);
  storage.set(lang);
  // 網址帶上語言，分享出去的連結會用同一種語言開啟
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  history.replaceState(null, '', url);
  ui.setLanguage(t, lang);
  solar?.setLanguage(t);
}

const ui = createUI({
  t,
  lang,
  onToggleLang: () => toggleLang(),
  onBack: () => goBack(),
  onSpeed: (speed) => { state.speed = speed; },
  onClose: () => { if (state.view === 'shop') goBack(); },
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

/** 星球附近的飛行路徑：至少離地表 AROUND_MIN 倍半徑，中段再拉高 AROUND_LIFT 倍半徑 */
const AROUND = { min: 1.25, lift: 0.5 };

function aroundPlanet(planet, shot) {
  const center = planet.group.position;
  const minDistance = Math.min(
    planet.radius * AROUND.min,
    camera.position.distanceTo(center),
    shot.position.distanceTo(center),
  );
  return { center, minDistance, lift: planet.radius * AROUND.lift };
}

async function fly(view, shot, distance, maxPolar) {
  state.view = 'flying';
  document.body.dataset.view = 'flying';
  setDistance({ min: 0, max: Infinity });
  // 在星球上切換店面或返回星球全景時，繞著星球飛，不穿過地面
  const nearPlanet = state.focused && view !== 'solar';
  await rig.flyTo(nearPlanet ? { ...shot, around: aroundPlanet(state.focused, shot) } : shot);
  setDistance(distance, maxPolar);
  state.view = view;
}

/** 手機轉向後重新套用目前視角的縮放範圍 */
function refreshDistance() {
  if (state.view === 'planet') setDistance(planetDistance(state.focused));
  else if (state.view === 'shop') setDistance(SHOP_DISTANCE, SHOP_MAX_POLAR);
}

function planetDistance(planet) {
  return { min: planet.radius * PLANET_DISTANCE.min, max: planet.radius * PLANET_DISTANCE.max * fitFactor() };
}

function planetShot(planet) {
  const center = planet.group.position.clone();
  const target = center.clone().addScaledVector(PLANET_VIEW.target, planet.radius);
  const offset = PLANET_VIEW.camera.clone().sub(PLANET_VIEW.target).multiplyScalar(planet.radius * fitFactor());
  return { position: target.clone().add(offset), target, up: WORLD_UP };
}

/** 店門口特寫：站在店的正前方（南側）斜上方，上方向是該處地面法線 */
function shopShot(index) {
  const { position, up, south, height } = town.shopFrame(index);
  const s = Math.max(1, height / SHOP_VIEW.refHeight) * fitFactor();
  return {
    position: position.clone().addScaledVector(up, SHOP_VIEW.up * s).addScaledVector(south, SHOP_VIEW.back * s),
    target: position.clone()
      .addScaledVector(up, Math.max(SHOP_VIEW.minLook, height * SHOP_VIEW.lookRatio))
      .addScaledVector(south, SHOP_VIEW.lookAhead),
    up,
  };
}

async function enterPlanet(planet) {
  if (state.view !== 'solar') return;
  if (!planet.config.enabled) {
    ui.toast(t('toast.locked', { planet: t(planetNameKey(planet.config)) }));
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
  state.shopCoinId = mapped.coin.id;
  ui.setCoins(townData, mapped.coin.id);
  await fly('shop', shopShot(index), SHOP_DISTANCE, SHOP_MAX_POLAR);
  ui.showCoin(mapped);
  ui.setView('shop', state.focused.config, mapped.coin);
}

async function goBack() {
  if (state.view === 'shop') {
    state.shopCoinId = null;
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

// 只認主要手指；雙指縮放時放開的那根手指不算點擊
renderer.domElement.addEventListener('pointerdown', (e) => {
  down = e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
renderer.domElement.addEventListener('pointercancel', () => { down = null; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || down.id !== e.pointerId || !solar) return;
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

let lastLiveAt = null;
let refreshing = false;

function applyData(coins) {
  townData = mapTown(coins);
  town.setData(townData);
  ui.setCoins(townData, state.shopCoinId);
  if (state.view !== 'shop') return;
  // 店面特寫中：排名變動就跟著那個幣飛到新位置；幣跌出前十就回到星球
  const index = town.indexOf(state.shopCoinId);
  if (index < 0) {
    goBack();
    return;
  }
  ui.showCoin(town.mappedAt(index));
  fly('shop', shopShot(index), SHOP_DISTANCE, SHOP_MAX_POLAR);
}

async function refresh() {
  // 背景分頁不更新；上一輪還沒完成就跳過，避免請求重疊被 API 限流
  if (refreshing || document.hidden || state.view === 'flying') return;
  refreshing = true;
  try {
    const result = await loadTopCoins();
    if (result.source === 'live') {
      applyData(result.coins);
      lastLiveAt = result.updatedAt;
      ui.setStatus(result);
    } else {
      ui.setStatus({ ...result, updatedAt: lastLiveAt ?? result.updatedAt }, { keptPrevious: townData.length > 0 });
    }
  } catch (err) {
    console.error('[crypto-planet] 更新失敗', err);
  } finally {
    refreshing = false;
  }
}

async function start() {
  const first = await loadTopCoins();
  const totalCap = first.coins.reduce((sum, c) => sum + c.marketCap, 0);
  majorRadius = planetRadius(totalCap);
  const majorField = createTerrainField({
    seed: MAJOR_TERRAIN_SEED, spots: townSpots(), plazaAngle: PLAZA_RADIUS / majorRadius,
  });
  solar = createSolarSystem(scene, { radii: { major: majorRadius }, townFields: { major: majorField }, t });
  town = createTown(solar.planets.get('major').group, majorRadius);
  applyData(first.coins);
  if (first.source === 'live') lastLiveAt = first.updatedAt;
  ui.setStatus(first);
  document.fonts?.ready.then(() => town.redrawSigns());
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

  const major = solar.planets.get('major');
  const crowdRange = majorRadius * CROWD_VISIBLE_FACTOR * fitFactor();
  const nearTown = camera.position.distanceTo(major.group.position) < crowdRange;
  town.setCrowdVisible(nearTown);
  // 看不到人潮時暫停模擬，省手機電量
  if (nearTown) {
    town.step(simDt);
    town.render();
  }

  composer.render();
  labelRenderer.render(scene, camera);
}

start().catch((err) => {
  console.error('[crypto-planet] 啟動失敗', err);
  ui.failLoading(t('error.start'));
});
