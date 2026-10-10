import * as THREE from 'three';

// 淺色招牌上的漲跌字色要深一點才看得清楚
const TREND_TEXT = Object.freeze({ up: '#0f9d63', down: '#d63340', flat: '#7d8790' });
const W = 512;
const H = 224;
const FONT = '"Outfit", "PingFang TC", "Noto Sans TC", system-ui, sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 永遠面向鏡頭的電子招牌：排名、代號，下排左邊 primary（價格）、右邊 secondary（漲跌或資金流） */
export function createSignboard() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // alphaTest＋寫入深度：前後重疊的招牌不會互相透字；color 壓暗一點避免白字被 Bloom 糊掉
  const material = new THREE.SpriteMaterial({ map: texture, alphaTest: 0.2, color: new THREE.Color(0.7, 0.7, 0.7) });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.3, 2.3 * (H / W), 1);
  sprite.position.set(0, 2.75, -0.1);

  const draw = ({ symbol, rank, primary, secondary }, trend, accent) => {
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#fffaf2';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = accent;
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#8a8478';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(`#${rank}`, 34, 70);
    ctx.fillStyle = '#2b2d42';
    ctx.font = `800 76px ${FONT}`;
    ctx.fillText(symbol, 110, 82, W - 144);

    ctx.font = `600 54px ${FONT}`;
    // 下排左右兩欄各自限制寬度，數字變長時壓窄而不是疊在一起
    ctx.fillText(primary, 34, 168, W * 0.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = TREND_TEXT[trend];
    ctx.font = `700 46px ${FONT}`;
    ctx.fillText(secondary, W - 34, 168, W * 0.4);
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
