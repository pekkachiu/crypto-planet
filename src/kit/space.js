import * as THREE from 'three';
import { createStarData } from '../sim/stars.js';

const SKY_RADIUS = 1600;
const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // 星雲本來就是低頻的雲，5 個八度就夠；扭曲用的 fbm3 只要 3 個八度，烘焙成本降很多
  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v;
  }
  float fbm3(vec3 p) {
    return 0.5 * noise(p) + 0.25 * noise(p * 2.03 + vec3(1.7, 9.2, 3.1)) + 0.125 * noise(p * 4.12 + vec3(4.1, 2.6, 7.3));
  }`;

/**
 * 星雲貼圖（等距長方投影）：用方向向量取 3D 雜訊，左右接縫不會斷開。
 * 顏色都很暗（線性值 < 0.35），低於 Bloom 門檻，不會糊成一片光。
 */
const NEBULA_FRAGMENT = /* glsl */`
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float lon = vUv.x * 6.2831853;
    float lat = (vUv.y - 0.5) * 3.1415927;
    vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));

    // 星雲：扭曲過的雜訊，形狀比較像雲而不是斑點
    vec3 q = d * 2.2 + vec3(4.0);
    float w = fbm(q + 2.3 * vec3(fbm3(q + 5.2), fbm3(q + 1.3), fbm3(q + 8.1)));
    float clouds = smoothstep(0.42, 0.85, w);
    vec3 teal = vec3(0.03, 0.11, 0.17);
    vec3 purple = vec3(0.15, 0.05, 0.22);
    vec3 pink = vec3(0.21, 0.06, 0.12);
    vec3 nebula = mix(teal, purple, smoothstep(0.35, 0.65, fbm(d * 1.3 + 7.0)));
    nebula = mix(nebula, pink, 0.6 * smoothstep(0.6, 0.8, fbm(d * 3.1 + 2.0)));

    // 銀河帶：傾斜的大圓附近亮一點，夾著暗色塵埃帶
    float b = dot(d, normalize(vec3(0.35, 1.0, 0.2)));
    float band = exp(-b * b * 18.0) * (0.55 + 0.45 * fbm(d * 7.0 + 3.0));
    band *= 1.0 - 0.6 * smoothstep(0.55, 0.8, fbm(d * 11.0));

    vec3 color = vec3(0.008, 0.011, 0.028) + nebula * clouds * 0.9 + vec3(0.2, 0.19, 0.24) * band * 0.5;
    gl_FragColor = vec4(color, 1.0);
  }`;

/**
 * 開頁時用 GPU 畫一次星雲貼圖，之後每幀只是貼圖，幾乎沒有額外成本。
 * 回傳 bake()：WebGL 內容遺失（手機切到背景等）再還原後，貼圖會被清空，要重畫一次。
 */
function createNebula(renderer, width) {
  const target = new THREE.WebGLRenderTarget(width, width / 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const material = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: NEBULA_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bake = () => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);
  };
  bake();
  return { texture: target.texture, bake };
}

/** 天空球：跟著鏡頭移動，永遠在最遠處 */
export function createSky(renderer, { width }) {
  const nebula = createNebula(renderer, width);
  renderer.domElement.addEventListener('webglcontextrestored', () => nebula.bake());
  const material = new THREE.MeshBasicMaterial({
    map: nebula.texture, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), material);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return {
    mesh,
    /** 白天星雲淡一點、夜晚亮一點（k：0 白天～1 夜晚） */
    setNight(k) { material.color.setScalar(0.6 + 0.4 * k); },
    follow(position) { mesh.position.copy(position); },
  };
}

const STAR_VERTEX = /* glsl */`
  attribute float size;
  attribute float phase;
  attribute vec3 tint;
  uniform float uTime;
  uniform float uScale;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // 每顆星閃爍的速度與相位都不同；大顆的星比較亮，會帶一點 Bloom 柔光
    float twinkle = 0.72 + 0.28 * sin(uTime * (1.0 + fract(phase * 7.13) * 2.2) + phase);
    vColor = tint * twinkle * (0.75 + 0.25 * (size - 1.0));
    gl_PointSize = size * uScale * uPixelRatio;
  }`;

const STAR_FRAGMENT = /* glsl */`
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor * smoothstep(0.5, 0.1, d), 1.0);
  }`;

/** 星空：大小、顏色不同的星星，在 GPU 上閃爍，全部一次繪製 */
export function createStars({ count, shell, seed, pixelRatio }) {
  const data = createStarData({ count, shell, seed });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('tint', new THREE.BufferAttribute(data.colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(data.sizes, 1));
  geometry.setAttribute('phase', new THREE.BufferAttribute(data.phases, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1.3 }, uPixelRatio: { value: pixelRatio } },
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  return {
    points,
    /** 夜晚星星大一點（k：0 白天～1 夜晚） */
    setNight(k) { material.uniforms.uScale.value = 1.3 + 0.5 * k; },
    /** 每幀：閃爍時間、跟著鏡頭（與天空球的視差一致）、同步像素比（視窗拖到另一個螢幕時會變） */
    tick(seconds, cameraPosition, pixelRatio) {
      material.uniforms.uTime.value = seconds;
      material.uniforms.uPixelRatio.value = pixelRatio;
      points.position.copy(cameraPosition);
    },
  };
}
