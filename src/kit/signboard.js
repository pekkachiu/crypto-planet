import * as THREE from 'three';
import { formatPrice, formatPct } from '../ui/format.js';
import { TREND_COLORS } from './palette.js';

const W = 512;
const H = 224;
const FONT = '"Outfit", "PingFang TC", "Noto Sans TC", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 永遠面向鏡頭的電子招牌：代號、價格、24h 漲跌 */
export function createSignboard() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // alphaTest＋寫入深度：前後重疊的招牌不會互相透字；color 壓暗一點避免白字被 Bloom 糊掉
  const material = new THREE.SpriteMaterial({ map: texture, alphaTest: 0.2, color: new THREE.Color(0.74, 0.74, 0.74) });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.3, 2.3 * (H / W), 1);
  sprite.position.set(0, 2.75, 0);

  const draw = ({ symbol, rank, price, change24h }, trend, accent) => {
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#090d16';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8b99a5';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(`#${rank}`, 34, 70);
    ctx.fillStyle = '#edf2f5';
    ctx.font = `800 76px ${FONT}`;
    ctx.fillText(symbol, 110, 82);

    ctx.font = `600 54px ${FONT}`;
    ctx.fillText(formatPrice(price), 34, 168);
    ctx.textAlign = 'right';
    ctx.fillStyle = TREND_COLORS[trend];
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(formatPct(change24h), W - 34, 168);
    ctx.textAlign = 'left';
    texture.needsUpdate = true;
  };

  return {
    sprite,
    draw,
    dispose() {
      texture.dispose();
      sprite.material.dispose();
    },
  };
}
