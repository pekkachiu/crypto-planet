import * as THREE from 'three';
import { tangentFrame } from '../sim/sphere.js';
import { createGauge } from '../kit/gauge.js';
import { createWeather } from '../kit/weather.js';
import { weatherOf } from '../data/fear-greed.js';

/**
 * 儀表的位置（單位法向量），也是地形整平的廣場。不放在北極：進入星球時鏡頭從南方斜上方看，
 * 往鏡頭方向偏一點，儀表才會出現在畫面上半部而不是被切到邊緣。
 */
const TILT = Math.hypot(0.65, 0.76);
export const MOOD_SPOTS = Object.freeze([Object.freeze({ x: 0, y: 0.65 / TILT, z: 0.76 / TILT })]);
/** 儀表比店面寬，特寫時至少當成這個高度的建築來拉遠鏡頭 */
const FRAME_HEIGHT = 8;
const toV3 = ({ x, y, z }) => new THREE.Vector3(x, y, z);

function createAnchor(radius, n) {
  const { up, east, south } = tangentFrame(n);
  const anchor = new THREE.Group();
  anchor.matrixAutoUpdate = false;
  anchor.matrix.makeBasis(toV3(east), toV3(up), toV3(south)).setPosition(toV3(n).multiplyScalar(radius));
  return anchor;
}

/**
 * 恐懼貪婪星：北極的大儀表＋整顆星球的天氣。
 * 介面與 createTown 相同（setData、pick、shopFrame…），main.js 可以用同一套視角流程；
 * 底部列只有一個項目（index 0），點它就飛到儀表前。
 */
export function createMoodPlanet(planetGroup, radius, t) {
  const anchor = createAnchor(radius, MOOD_SPOTS[0]);
  const gauge = createGauge(radius);
  anchor.add(gauge.group);
  gauge.group.traverse((o) => { o.userData.shopIndex = 0; });
  planetGroup.add(anchor);
  const weather = createWeather(radius, toV3(MOOD_SPOTS[0]));
  planetGroup.add(weather.group);

  let translate = t;
  let mapped = null;
  const sphere = new THREE.Sphere(new THREE.Vector3(), radius);
  const sphereHit = new THREE.Vector3();

  const pick = (raycaster) => {
    const hit = raycaster.intersectObject(gauge.group, true)[0];
    if (!hit) return null;
    planetGroup.getWorldPosition(sphere.center);
    if (raycaster.ray.intersectSphere(sphere, sphereHit) && hit.distance > raycaster.ray.origin.distanceTo(sphereHit) + 0.5) {
      return null;
    }
    return { kind: 'shop', index: 0 };
  };

  const shopFrame = () => {
    const world = new THREE.Matrix4().multiplyMatrices(planetGroup.matrixWorld, anchor.matrix);
    const position = new THREE.Vector3();
    const east = new THREE.Vector3();
    const up = new THREE.Vector3();
    const south = new THREE.Vector3();
    world.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
    world.extractBasis(east, up, south);
    return { position, up: up.normalize(), south: south.normalize(), height: Math.max(FRAME_HEIGHT, gauge.height) };
  };

  return {
    hasPark: false,
    /** mappedList：只有一個元素（mapMood 的結果） */
    setData(mappedList) {
      [mapped] = mappedList;
      if (!mapped) return;
      gauge.setData(mapped.data.today, translate);
      weather.setWeather(weatherOf(mapped.value));
    },
    setLanguage(nextT) {
      translate = nextT;
      gauge.redraw(translate);
    },
    step(dt) {
      gauge.step(dt);
      weather.step(dt);
    },
    render() {},
    /** 螢幕寬高比改變時（例如手機轉向）調整太陽位置 */
    setAspect(aspect) { weather.setAspect(aspect); },
    pick,
    shopFrame,
    parkFrame: () => null,
    redrawSigns() { gauge.redraw(translate); },
    redrawPark() {},
    mappedAt(index) { return index === 0 ? mapped : null; },
    indexOf(id) { return mapped?.coin.id === id ? 0 : -1; },
    /** 遠景時天氣照樣顯示（雲和太陽遠看也有意思），只是暫停動畫 */
    setCrowdVisible() {},
  };
}
