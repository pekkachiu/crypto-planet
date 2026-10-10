import * as THREE from 'three';
import { flat, PALETTE } from './materials.js';
import { createLamp } from './lamp.js';
import { TREND_COLORS } from './palette.js';
import { groundHeight } from '../sim/sphere.js';
import { PARK, benches, seatPositions, sitterCounts, monument } from '../sim/park-layout.js';
import { formatUsd } from '../ui/format.js';

const LAWN_RADIUS = 3.5;
const LAWN_LIFT = 0.025;
const PATH_WIDTH = 0.7;
const SIGN_GAP = 1.1;
const FONT = '"Outfit", "PingFang TC", "Noto Sans TC", system-ui, sans-serif';
const TREES = [[-2.6, -2.4], [2.6, -2.4], [-3.0, 0.9], [3.0, 0.9]];
const LAMPS = [[-1.2, 2.9], [1.2, 2.9], [-1.2, -2.9], [1.2, -2.9]];

/** 把平面幾何的每個頂點壓到球面高度，草地與步道才會貼著彎曲的地面 */
function conformToSphere(geometry, radius, lift) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, groundHeight(radius, pos.getX(i), pos.getZ(i)) + lift);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createGrounds(radius) {
  const lawn = new THREE.CircleGeometry(LAWN_RADIUS, 32).rotateX(-Math.PI / 2);
  const front = new THREE.PlaneGeometry(PATH_WIDTH, LAWN_RADIUS, 1, 8).rotateX(-Math.PI / 2).translate(0, 0, LAWN_RADIUS / 2);
  const ring = new THREE.RingGeometry(PARK.ringRadius - 0.45, PARK.ringRadius - 0.15, 40).rotateX(-Math.PI / 2);
  return [
    new THREE.Mesh(conformToSphere(lawn, radius, LAWN_LIFT), flat(PALETTE.lawn)),
    new THREE.Mesh(conformToSphere(front, radius, LAWN_LIFT + 0.01), flat(PALETTE.path)),
    new THREE.Mesh(conformToSphere(ring, radius, LAWN_LIFT + 0.01), flat(PALETTE.path)),
  ];
}

function createBench(radius, { x, z, heading }) {
  const bench = new THREE.Group();
  const wood = flat(PALETTE.wood);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.22), wood);
  seat.position.y = 0.2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.04), wood);
  back.position.set(0, 0.34, -0.11);
  bench.add(seat, back);
  for (const lx of [-0.34, 0.34]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.18), flat(PALETTE.lampPost));
    leg.position.set(lx, 0.1, 0);
    bench.add(leg);
  }
  bench.position.set(x, groundHeight(radius, x, z), z);
  bench.rotation.y = heading;
  return bench;
}

function createTree(radius, x, z) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5).translate(0, 0.25, 0), flat('#9b7653'));
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.85, 0), flat('#5fb36a'));
  tree.add(trunk, crown);
  tree.position.set(x, groundHeight(radius, x, z), z);
  return tree;
}

/** 坐在長椅上的爆倉者：身體＋頭兩個 InstancedMesh */
function createSitters(max) {
  const bodies = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.12, 0.16, 0.1).translate(0, 0.3, -0.02),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    max,
  );
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.095, 0.095, 0.095).translate(0, 0.43, -0.02),
    new THREE.MeshLambertMaterial({ color: '#f1d3b3', flatShading: true }),
    max,
  );
  bodies.count = 0;
  heads.count = 0;
  return { bodies, heads };
}

/** 中央紀念碑：底座＋紅色段（多單）＋綠色段（空單）＋金色尖頂 */
function createMonument() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.9).translate(0, 0.125, 0), flat(PALETTE.stone));
  const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), flat(TREND_COLORS.down));
  const green = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5).translate(0, 0.5, 0), flat(TREND_COLORS.up));
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.45, 4).rotateY(Math.PI / 4).translate(0, 0.225, 0), flat('#e6c25a'));
  group.add(base, red, green, cap);
  const set = ({ height, longShare }) => {
    const redH = Math.max(0.05, height * longShare);
    const greenH = Math.max(0.05, height - redH);
    red.position.y = 0.25;
    red.scale.y = redH;
    green.position.y = 0.25 + redH;
    green.scale.y = greenH;
    cap.position.y = 0.25 + redH + greenH;
    return 0.25 + redH + greenH + 0.45;
  };
  return { group, set };
}

function createParkSign() {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, alphaTest: 0.2, color: new THREE.Color(0.7, 0.7, 0.7) });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 1.3, 1);

  const draw = ({ long, short }, t) => {
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 28);
    ctx.fillStyle = '#fffaf2';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#e6c25a';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8a8478';
    ctx.font = `600 34px ${FONT}`;
    // 指定最大寬度：英文標籤較長時自動壓窄，左右兩欄不會疊在一起
    ctx.fillText(t('park.signTitle'), W / 2, 62, W - 60);
    ctx.fillStyle = '#2b2d42';
    ctx.font = `800 72px ${FONT}`;
    ctx.fillText(formatUsd(long + short), W / 2, 142, W - 60);
    ctx.font = `700 38px ${FONT}`;
    ctx.fillStyle = '#d63340';
    ctx.fillText(`${t('park.long')} ${formatUsd(long)}`, W * 0.28, 212, W * 0.42);
    ctx.fillStyle = '#0f9d63';
    ctx.fillText(`${t('park.short')} ${formatUsd(short)}`, W * 0.72, 212, W * 0.42);
    texture.needsUpdate = true;
  };
  return { sprite, draw };
}

/**
 * 爆倉公園：草地、步道、中央紀念碑、兩側長椅與坐著的爆倉者、樹與路燈。
 * 座標為公園中心的切面座標，入口朝 +z。
 */
export function createPark(radius) {
  const group = new THREE.Group();
  group.add(...createGrounds(radius));
  for (const side of ['long', 'short']) for (const b of benches(side)) group.add(createBench(radius, b));
  for (const [x, z] of TREES) group.add(createTree(radius, x, z));
  for (const [x, z] of LAMPS) {
    const lamp = createLamp(x, z, Math.atan2(-x, -z));
    lamp.position.y = groundHeight(radius, x, z);
    group.add(lamp);
  }
  const statue = createMonument();
  group.add(statue.group);
  const sitters = createSitters(PARK.seatsPerSide * 2);
  group.add(sitters.bodies, sitters.heads);
  const sign = createParkSign();
  group.add(sign.sprite);

  let height = 0;
  let last = { long: 0, short: 0 };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const colors = { long: new THREE.Color(TREND_COLORS.down), short: new THREE.Color(TREND_COLORS.up) };

  const placeSitters = (counts) => {
    let n = 0;
    for (const side of ['long', 'short']) {
      for (const seat of seatPositions(side, counts[side])) {
        p.set(seat.x, groundHeight(radius, seat.x, seat.z), seat.z);
        q.setFromAxisAngle(up, seat.heading);
        m.compose(p, q, one);
        sitters.bodies.setMatrixAt(n, m);
        sitters.heads.setMatrixAt(n, m);
        sitters.bodies.setColorAt(n, colors[side]);
        n += 1;
      }
    }
    sitters.bodies.count = n;
    sitters.heads.count = n;
    sitters.bodies.instanceMatrix.needsUpdate = true;
    sitters.heads.instanceMatrix.needsUpdate = true;
    if (sitters.bodies.instanceColor) sitters.bodies.instanceColor.needsUpdate = true;
  };

  return {
    group,
    get height() { return height; },
    /** liqs：{ long, short } 24 小時爆倉金額 */
    setData(liqs, t) {
      last = liqs;
      height = statue.set(monument(liqs));
      sign.sprite.position.y = height + SIGN_GAP;
      sign.draw(liqs, t);
      placeSitters(sitterCounts(liqs));
    },
    redraw(t) { sign.draw(last, t); },
  };
}
