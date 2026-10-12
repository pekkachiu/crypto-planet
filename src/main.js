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
import { planetNameKey, findPlanet } from './data/planets.js';
import { detectLang, createTranslator, STORAGE_KEY } from './i18n/index.js';
import { loadLiquidations } from './data/okx-liquidations.js';
import { loadEtfDataset, rankAssets, mapEtfTown, ETF_ASSETS } from './data/etf.js';
import { loadFearGreed, mapMood } from './data/fear-greed.js';
import { createMoodPlanet, MOOD_SPOTS } from './scenes/mood-planet.js';
import { moodColor } from './sim/mood-layout.js';
import { detectTheme, THEME_STORAGE_KEY } from './ui/theme.js';
import { applyNight } from './kit/materials.js';
import { createCameraRig, HOME } from './scenes/camera-rig.js';
import { createUI } from './ui/panel.js';

const IS_MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 720;
/** skyWidth：星雲貼圖寬度（開頁時畫一次），手機用小一點 */
const QUALITY = IS_MOBILE ? { maxPixelRatio: 1.5, bloomScale: 0.5, skyWidth: 1024 } : { maxPixelRatio: 2, bloomScale: 1, skyWidth: 2048 };
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
const ETF_TERRAIN_SEED = 307;
const MOOD_TERRAIN_SEED = 512;
/** 恐懼貪婪指數每天只更新一次，每小時檢查一次就夠 */
const MOOD_REFRESH_MS = 60 * 60_000;
/** etf.json 由部署流程每天更新兩次，網頁每 30 分鐘重新讀一次就夠 */
const ETF_REFRESH_MS = 30 * 60_000;
/** OKX 爆倉歷史每 5 分鐘更新一次（每次要翻好幾頁，不必太頻繁） */
const LIQ_REFRESH_MS = 5 * 60_000;
/** 日夜切換的淡入淡出秒數 */
const THEME_FADE_SECONDS = 1;
/** 白天／夜晚的渲染參數：k＝0 白天、1 夜晚之間線性內插 */
const LOOK = {
  background: [new THREE.Color('#0a1226'), new THREE.Color('#03050b')],
  exposure: [0.95, 0.85],
  bloom: [0.55, 0.8],
  fill: [0.65, 0.22],
};
const SHOP_DISTANCE = { min: 2.2, max: 24 };
/** 繞店旋轉時，鏡頭最低只到接近地平線，不會鑽到地底 */
const SHOP_MAX_POLAR = 1.38;
/**
 * 進入星球時的鏡頭（以半徑為單位、相對星球中心）：從南方斜上方看整顆星球，
 * 北極的公園與天際線在上緣，店面分散在整顆星球上，可拖曳旋轉瀏覽。
 */
const PLANET_VIEW = Object.freeze({ camera: new THREE.Vector3(0, 1.3, 2.8), target: new THREE.Vector3(0, 0, 0) });

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
  towns.get(MOOD)?.town.setAspect(camera.aspect);
  refreshDistance();
});

// ---------- 狀態 ----------
const rig = createCameraRig(camera, controls);
/** view：solar（太陽系）→ planet（星球全景）→ shop（店門口特寫）；飛行中為 flying */
/** focusKey：店面特寫時是幣種 id，在公園時是 'park' */
const state = { view: 'solar', speed: 1, simTime: 0, focusKey: null, focused: null };
const PARK_KEY = 'park';
const MAJOR = 'major';
const ETF = 'etf';
const MOOD = 'mood';
let solar = null;
/** 有小鎮的星球：id → { town, data（換算後的店面清單）, radius } */
const towns = new Map();
const townOf = (planet) => towns.get(planet.config.id);

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
  towns.get(MAJOR)?.town.redrawPark(t);
  towns.get(MOOD)?.town.setLanguage(t);
}

// ---------- 白天／夜晚 ----------
const themeStorage = {
  get() { try { return localStorage.getItem(THEME_STORAGE_KEY); } catch { return null; } },
  set(value) { try { localStorage.setItem(THEME_STORAGE_KEY, value); } catch { /* 存不了不影響使用 */ } },
};
let theme = detectTheme({ stored: themeStorage.get(), hour: new Date().getHours() });
let nightK = theme === 'night' ? 1 : 0;

function toggleTheme() {
  theme = theme === 'night' ? 'day' : 'night';
  themeStorage.set(theme);
  ui.setTheme(theme);
}

const mix = ([day, night], k) => day + (night - day) * k;

/** 依 k（0 白天～1 夜晚）套用燈光、天空、泛光與自發光材質 */
function applyLook(k) {
  scene.background.lerpColors(LOOK.background[0], LOOK.background[1], k);
  renderer.toneMappingExposure = mix(LOOK.exposure, k);
  bloom.strength = mix(LOOK.bloom, k);
  fillLight.intensity = mix(LOOK.fill, k);
  solar?.setNight(k);
  applyNight(k);
}

const ui = createUI({
  t,
  lang,
  onToggleLang: () => toggleLang(),
  onBack: () => goBack(),
  onSpeed: (speed) => { state.speed = speed; },
  onToggleTheme: () => toggleTheme(),
  theme,
  onClose: () => { if (state.view === 'shop') goBack(); },
  onPickCoin: (index) => enterSpot({ kind: 'shop', index }),
  onPickPark: () => enterSpot({ kind: 'park' }),
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

/** 特寫鏡頭：站在店門口或公園入口的正前方（南側）斜上方，上方向是該處地面法線 */
/** 公園比店面寬：取景時至少當成這個高度的建築來拉遠鏡頭 */
const PARK_FRAME_HEIGHT = 8;

function spotShot(target) {
  const { town } = townOf(state.focused);
  const frame = target.kind === 'park' ? town.parkFrame() : town.shopFrame(target.index);
  const { position, up, south } = frame;
  const height = target.kind === 'park' ? Math.max(PARK_FRAME_HEIGHT, frame.height) : frame.height;
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
    const UNAVAILABLE = { [ETF]: 'toast.etfUnavailable', [MOOD]: 'toast.moodUnavailable' };
    const key = UNAVAILABLE[planet.config.id] ?? 'toast.locked';
    ui.toast(t(key, { planet: t(planetNameKey(planet.config)) }));
    return;
  }
  state.focused = planet;
  const entry = townOf(planet);
  ui.setCoins(entry.data, null, { park: entry.town.hasPark });
  await fly('planet', planetShot(planet), planetDistance(planet));
  planet.label.visible = false;
  ui.setView('planet', planet.config);
}

/** 飛到店門口（{ kind: 'shop', index }）或爆倉公園（{ kind: 'park' }） */
async function enterSpot(target) {
  if (state.view !== 'planet' && state.view !== 'shop') return;
  const entry = townOf(state.focused);
  const mapped = target.kind === 'shop' ? entry.town.mappedAt(target.index) : null;
  if (target.kind === 'park' && !entry.town.hasPark) return;
  state.focusKey = mapped ? mapped.coin.id : PARK_KEY;
  ui.setCoins(entry.data, state.focusKey, { park: entry.town.hasPark });
  ui.hideCards();
  await fly('shop', spotShot(target), SHOP_DISTANCE, SHOP_MAX_POLAR);
  if (mapped) {
    showShopCard(state.focused, mapped);
    ui.setView('shop', state.focused.config, mapped.coin);
  } else {
    ui.showPark();
    ui.setView('park', state.focused.config);
  }
}

/** 主流星顯示幣種資訊卡，ETF 星顯示 ETF 資訊卡，恐懼貪婪星顯示指數資訊卡 */
function showShopCard(planet, mapped) {
  if (planet.config.id === ETF) ui.showEtf(mapped);
  else if (planet.config.id === MOOD) ui.showMood(mapped);
  else ui.showCoin(mapped);
}

async function goBack() {
  if (state.view === 'shop') {
    state.focusKey = null;
    ui.hideCards();
    const entry = townOf(state.focused);
    ui.setCoins(entry.data, null, { park: entry.town.hasPark });
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
    const target = townOf(state.focused).town.pick(raycaster);
    if (target) enterSpot(target);
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
let lastLiveAt = null;
let refreshing = false;

/** 更新某顆星球的小鎮；正在看這顆星球時一併更新底部列與店面特寫 */
function applyTownData(id, mapped) {
  const entry = towns.get(id);
  const previousIndex = state.focusKey ? entry.town.indexOf(state.focusKey) : -1;
  entry.data = mapped;
  entry.town.setData(mapped);
  if (state.focused?.config.id !== id) return;
  ui.setCoins(mapped, state.focusKey, { park: entry.town.hasPark });
  if (state.view !== 'shop' || state.focusKey === PARK_KEY) return;
  // 店面特寫中：排名變動才跟著那間店飛到新位置（使用者正在繞店旋轉時不打斷）；跌出前十就回到星球
  const index = entry.town.indexOf(state.focusKey);
  if (index < 0) {
    goBack();
    return;
  }
  showShopCard(state.focused, entry.town.mappedAt(index));
  if (index !== previousIndex) fly('shop', spotShot({ kind: 'shop', index }), SHOP_DISTANCE, SHOP_MAX_POLAR);
}

const applyData = (coins) => applyTownData(MAJOR, mapTown(coins));

function applyEtf(dataset) {
  ui.setEtfMeta(dataset);
  applyTownData(ETF, mapEtfTown(rankAssets(dataset.assets)));
}

let refreshingEtf = false;

async function refreshEtf() {
  if (refreshingEtf || document.hidden || !towns.has(ETF) || state.view === 'flying') return;
  refreshingEtf = true;
  try {
    const dataset = await loadEtfDataset();
    // 讀不到新檔時保留目前的資料
    if (dataset) applyEtf(dataset);
  } finally {
    refreshingEtf = false;
  }
}

function applyMood(data) {
  ui.setMoodMeta(data);
  // 大氣光暈跟著指數變色：恐懼紅、中性黃、貪婪綠
  solar.setGlow(MOOD, moodColor(data.today.level));
  applyTownData(MOOD, [mapMood(data)]);
}

let refreshingMood = false;

async function refreshMood() {
  if (refreshingMood || document.hidden || !towns.has(MOOD) || state.view === 'flying') return;
  refreshingMood = true;
  try {
    const data = await loadFearGreed();
    // 抓不到時保留目前的資料
    if (data) applyMood(data);
  } finally {
    refreshingMood = false;
  }
}

let refreshingLiqs = false;
let hasRealLiqs = false;

async function refreshLiquidations() {
  const major = towns.get(MAJOR);
  if (refreshingLiqs || document.hidden || !major || major.data.length === 0) return;
  refreshingLiqs = true;
  try {
    const liqs = await loadLiquidations(major.data.map((m) => m.coin));
    // 已經有真實資料時，暫時失敗不要用範例資料蓋掉
    if (liqs.source !== 'okx' && hasRealLiqs) return;
    hasRealLiqs = hasRealLiqs || liqs.source === 'okx';
    major.town.setLiquidations(liqs, t);
    ui.setParkData(liqs);
  } catch (err) {
    console.error('[crypto-planet] 爆倉資料更新失敗', err);
  } finally {
    refreshingLiqs = false;
  }
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
      ui.setStatus({ ...result, updatedAt: lastLiveAt ?? result.updatedAt }, { keptPrevious: towns.get(MAJOR).data.length > 0 });
    }
  } catch (err) {
    console.error('[crypto-planet] 更新失敗', err);
  } finally {
    refreshing = false;
  }
}

/** 有小鎮的星球設定：主流星有爆倉公園、十間店；ETF 星一個幣種一棟 */
const TOWN_LAYOUT = { [MAJOR]: { park: true }, [ETF]: { park: false, count: ETF_ASSETS.length } };

/** 小鎮星球的地形：店面與公園位置整平成廣場 */
const townField = (seed, radius, layout) => createTerrainField({
  seed, spots: townSpots(layout), plazaAngle: PLAZA_RADIUS / radius,
});

async function start() {
  // ETF、恐懼貪婪資料讀不到時那顆星維持上鎖，主流星照常
  const [first, etfData, moodData] = await Promise.all([loadTopCoins(), loadEtfDataset(), loadFearGreed()]);
  const majorRadius = planetRadius(first.coins.reduce((sum, c) => sum + c.marketCap, 0));
  const radii = { [MAJOR]: majorRadius };
  const townFields = { [MAJOR]: townField(MAJOR_TERRAIN_SEED, majorRadius, TOWN_LAYOUT[MAJOR]) };
  const available = new Set([MAJOR]);
  if (etfData) {
    radii[ETF] = planetRadius(etfData.assets.reduce((sum, a) => sum + a.netAssets, 0));
    townFields[ETF] = townField(ETF_TERRAIN_SEED, radii[ETF], TOWN_LAYOUT[ETF]);
    available.add(ETF);
  }
  if (moodData) {
    radii[MOOD] = findPlanet(MOOD).radius;
    townFields[MOOD] = createTerrainField({ seed: MOOD_TERRAIN_SEED, spots: MOOD_SPOTS, plazaAngle: PLAZA_RADIUS / radii[MOOD] });
    available.add(MOOD);
  }
  solar = createSolarSystem(scene, { renderer, skyWidth: QUALITY.skyWidth, radii, townFields, available, t });
  for (const id of available) {
    const group = solar.planets.get(id).group;
    const town = id === MOOD ? createMoodPlanet(group, radii[id], t) : createTown(group, radii[id], TOWN_LAYOUT[id]);
    towns.set(id, { town, data: [], radius: radii[id] });
  }
  applyData(first.coins);
  if (etfData) applyEtf(etfData);
  if (moodData) applyMood(moodData);
  towns.get(MOOD)?.town.setAspect(camera.aspect);
  if (first.source === 'live') lastLiveAt = first.updatedAt;
  ui.setStatus(first);
  document.fonts?.ready.then(() => towns.forEach(({ town }) => town.redrawSigns()));
  ui.setView('solar');
  ui.doneLoading();
  setInterval(refresh, REFRESH_MS);
  applyLook(nightK);
  refreshLiquidations();
  setInterval(refreshLiquidations, LIQ_REFRESH_MS);
  setInterval(refreshEtf, ETF_REFRESH_MS);
  setInterval(refreshMood, MOOD_REFRESH_MS);
  // 背景分頁不更新；切回來時立刻補一次，不必等下一輪
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refresh();
    refreshLiquidations();
    refreshEtf();
    refreshMood();
  });
  renderer.setAnimationLoop(frame);
}

// ---------- 每幀 ----------
const clock = new THREE.Clock();

function frame() {
  // 鏡頭飛行與日夜淡入淡出用真實經過時間，慢裝置上也會準時結束；模擬時間才限制每幀上限，避免切回分頁時一次跳太多
  const realDt = clock.getDelta();
  const dt = Math.min(realDt, MAX_FRAME_DT);
  const targetK = theme === 'night' ? 1 : 0;
  if (nightK !== targetK) {
    const stepK = realDt / THEME_FADE_SECONDS;
    nightK = Math.abs(targetK - nightK) <= stepK ? targetK : nightK + Math.sign(targetK - nightK) * stepK;
    applyLook(nightK);
  }
  const simDt = dt * state.speed;
  if (state.view === 'solar') {
    state.simTime += simDt;
    solar.update(state.simTime);
  }
  if (rig.flying) rig.update(realDt);
  else controls.update();
  solar.animate(clock.elapsedTime, camera.position);

  for (const [id, { town, radius }] of towns) {
    const crowdRange = radius * CROWD_VISIBLE_FACTOR * fitFactor();
    const nearTown = camera.position.distanceTo(solar.planets.get(id).group.position) < crowdRange;
    town.setCrowdVisible(nearTown);
    // 看不到人潮時暫停模擬，省手機電量
    if (nearTown) {
      town.step(simDt);
      town.render();
    }
  }

  composer.render();
  labelRenderer.render(scene, camera);
}

start().catch((err) => {
  console.error('[crypto-planet] 啟動失敗', err);
  ui.failLoading(t('error.start'));
});
