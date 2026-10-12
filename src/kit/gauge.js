import * as THREE from 'three';
import { flat, PALETTE } from './materials.js';
import { groundHeight } from '../sim/sphere.js';
import { GAUGE_BANDS, gaugeAngle } from '../sim/mood-layout.js';

const OUTER = 2.6;
const INNER = 1.75;
const DEPTH = 0.3;
/** 儀表圓心離地高度 */
const HUB_Y = 1.25;
const SIGN_GAP = 1.0;
/** 指針轉到目標角度的速度（每秒趨近的比例） */
const NEEDLE_EASE = 3;
const FONT = '"Outfit", "PingFang TC", "Noto Sans TC", system-ui, sans-serif';
const W = 512;
const H = 288;
const LEVEL_TEXT = Object.freeze({
  extremeFear: '#d63340', fear: '#d9692c', neutral: '#b98a12', greed: '#5d9a1f', extremeGreed: '#0f9d63',
});

/** 半圓上的一段刻度：外弧＋內弧圍成的扇環，往 z 擠出一點厚度 */
function bandGeometry(from, to) {
  const a0 = gaugeAngle(from);
  const a1 = gaugeAngle(to);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, OUTER, a0, a1, true);
  shape.absarc(0, 0, INNER, a1, a0, false);
  return new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -DEPTH / 2);
}

function createNeedle() {
  const pivot = new THREE.Group();
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.14, OUTER - 0.15, 4).translate(0, (OUTER - 0.15) / 2, 0),
    flat('#2b2d42'),
  );
  needle.position.z = DEPTH / 2 + 0.08;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 8).rotateX(Math.PI / 2), flat('#e6c25a'));
  hub.position.z = DEPTH / 2 + 0.05;
  pivot.add(needle, hub);
  return pivot;
}

function createSign() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.SpriteMaterial({ map: texture, alphaTest: 0.2, color: new THREE.Color(0.7, 0.7, 0.7) });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 2.8 * (H / W), 1);

  const draw = ({ value, level }, t) => {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#fffaf2';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = LEVEL_TEXT[level];
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a8478';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(t('mood.title'), W / 2, 62, W - 60);
    ctx.fillStyle = '#2b2d42';
    ctx.font = `800 110px ${FONT}`;
    ctx.fillText(String(value), W / 2, 172, W - 60);
    ctx.fillStyle = LEVEL_TEXT[level];
    ctx.font = `700 50px ${FONT}`;
    ctx.fillText(t(`mood.level.${level}`), W / 2, 244, W - 60);
    texture.needsUpdate = true;
  };
  return { sprite, draw };
}

/**
 * 恐懼貪婪儀表：立在地面上的半圓刻度盤（紅→綠）、指針與招牌。
 * 座標為切面座標：儀表面朝 +z（南），從正面看左邊是恐懼、右邊是貪婪。
 */
export function createGauge(radius) {
  const group = new THREE.Group();
  const baseY = groundHeight(radius, 0, 0);
  const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.25, 1.6).translate(0, 0.125, 0), flat(PALETTE.stone));
  base.position.y = baseY;
  group.add(base);

  const dial = new THREE.Group();
  dial.position.y = baseY + HUB_Y;
  for (const band of GAUGE_BANDS) dial.add(new THREE.Mesh(bandGeometry(band.from, band.to), flat(band.color)));
  // 兩端的支柱撐住半圓
  for (const x of [-(OUTER + INNER) / 2, (OUTER + INNER) / 2]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, HUB_Y, 0.5).translate(0, -HUB_Y / 2, 0), flat(PALETTE.trim));
    pillar.position.x = x;
    dial.add(pillar);
  }
  const needle = createNeedle();
  dial.add(needle);
  group.add(dial);

  const sign = createSign();
  sign.sprite.position.y = baseY + HUB_Y + OUTER + SIGN_GAP + 0.3;
  group.add(sign.sprite);

  const height = HUB_Y + OUTER + SIGN_GAP;
  let target = gaugeAngle(50);
  let angle = target;
  let last = null;
  const applyAngle = () => { needle.rotation.z = angle - Math.PI / 2; };
  applyAngle();

  return {
    group,
    height,
    /** today：{ value, level } */
    setData(today, t) {
      last = today;
      target = gaugeAngle(today.value);
      sign.draw(today, t);
    },
    redraw(t) { if (last) sign.draw(last, t); },
    /** 指針平滑轉到目標分數 */
    step(dt) {
      if (angle === target) return;
      const next = angle + (target - angle) * Math.min(1, dt * NEEDLE_EASE);
      angle = Math.abs(target - next) < 1e-3 ? target : next;
      applyAngle();
    },
    dispose() {
      sign.sprite.material.map.dispose();
      sign.sprite.material.dispose();
    },
  };
}
