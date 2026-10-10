/**
 * 單一店面的人潮模擬（純邏輯，不依賴 Three.js）。
 * 座標為店面的切面座標：店在原點、門朝 +z；從正面看，右邊（+x）排買方、左邊（-x）排賣方。
 * 為了每秒 60 次更新上千人的效能，agent 物件在模擬內部就地更新，對外只讀。
 */
export const LAYOUT = Object.freeze({
  shopHalfWidth: 1.2,
  shopHalfDepth: 1.0,
  doorZ: 1.0,
  aisleHalfWidth: 0.35,
  perRow: 8,
  spacing: 0.2,
  rowGap: 0.3,
  queueStartX: 0.45,
  queueStartZ: 1.35,
  loop: Object.freeze({ halfWidth: 2.8, zMin: -1.8, zMax: 3.6 }),
  walkSpeed: 0.55,
  queueSpeed: 0.9,
  arriveEpsilon: 0.02,
});

const SIDES = Object.freeze({ buy: 1, sell: -1 });

export function queueSlot(kind, index) {
  const row = Math.floor(index / LAYOUT.perRow);
  const col = index % LAYOUT.perRow;
  const c = row % 2 === 0 ? col : LAYOUT.perRow - 1 - col;
  return {
    x: SIDES[kind] * (LAYOUT.queueStartX + c * LAYOUT.spacing),
    z: LAYOUT.queueStartZ + row * LAYOUT.rowGap,
  };
}

const { halfWidth: LW, zMin: LZ0, zMax: LZ1 } = LAYOUT.loop;
const LOOP_W = 2 * LW;
const LOOP_D = LZ1 - LZ0;
const PERIMETER = 2 * (LOOP_W + LOOP_D);

/** 環形人行道上距離 s 的位置（逆時針：前 → 右 → 後 → 左） */
function loopPoint(s) {
  const d = ((s % PERIMETER) + PERIMETER) % PERIMETER;
  if (d < LOOP_W) return { x: -LW + d, z: LZ1 };
  if (d < LOOP_W + LOOP_D) return { x: LW, z: LZ1 - (d - LOOP_W) };
  if (d < 2 * LOOP_W + LOOP_D) return { x: LW - (d - LOOP_W - LOOP_D), z: LZ0 };
  return { x: -LW, z: LZ0 + (d - 2 * LOOP_W - LOOP_D) };
}

/** 往目標移動，回傳是否已抵達 */
function moveToward(agent, tx, tz, speed, dt) {
  const dx = tx - agent.x;
  const dz = tz - agent.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= LAYOUT.arriveEpsilon) {
    agent.x = tx;
    agent.z = tz;
    agent.moving = false;
    return true;
  }
  const stepLen = Math.min(dist, speed * dt);
  agent.x += (dx / dist) * stepLen;
  agent.z += (dz / dist) * stepLen;
  agent.heading = Math.atan2(dx, dz);
  agent.moving = true;
  agent.phase += dt * 9;
  return stepLen === dist;
}

export function createShopSim(initial, rng) {
  let params = { ...initial };
  let nextId = 0;
  let agents = [];
  const stats = { served: 0 };
  const timers = { buy: params.callInterval, sell: params.callInterval * 0.5 };

  const makeAgent = (kind, state, pos, extra = {}) => ({
    id: nextId++, kind, state, x: pos.x, z: pos.z, heading: 0, moving: false,
    phase: rng() * Math.PI * 2, slot: -1, tint: rng(), ...extra,
  });

  const makeWalker = () => {
    const s = rng() * PERIMETER;
    return makeAgent('walker', 'walking', loopPoint(s), {
      s, dir: rng() < 0.5 ? 1 : -1, speedJitter: 0.8 + rng() * 0.4,
    });
  };

  const line = (kind) => agents.filter((a) => a.kind === kind && (a.state === 'queue' || a.state === 'joining'));

  /** 新人從前方人行道走進隊尾 */
  const addJoiner = (kind, slot) => {
    const target = queueSlot(kind, slot);
    agents.push(makeAgent(kind, 'joining', { x: target.x, z: LZ1 }, { slot }));
  };

  const fillLine = (kind, target) => {
    for (let slot = line(kind).length; slot < target; slot++) addJoiner(kind, slot);
  };

  const syncWalkers = () => {
    const walkers = agents.filter((a) => a.kind === 'walker');
    if (walkers.length > params.pedestrians) {
      const drop = new Set(walkers.slice(params.pedestrians).map((a) => a.id));
      agents = agents.filter((a) => !drop.has(a.id));
    }
    for (let i = walkers.length; i < params.pedestrians; i++) agents.push(makeWalker());
  };

  /** 叫號：排頭進店，其他人往前一格；隊伍比目標短就補人、比目標長就不補 */
  const callNext = (kind) => {
    const current = line(kind);
    const head = current.find((a) => a.slot === 0);
    if (!head) return;
    head.state = 'entering';
    head.slot = -1;
    for (const a of current) if (a !== head) a.slot -= 1;
    const target = params[`${kind}Queue`];
    fillLine(kind, target);
  };

  /** 更新單一 agent；回傳 false 表示要移除。新產生的離場者放進 spawned */
  const stepAgent = (a, dt, spawned) => {
    if (a.state === 'walking') {
      a.s += a.dir * LAYOUT.walkSpeed * a.speedJitter * dt;
      const p = loopPoint(a.s);
      a.heading = Math.atan2(p.x - a.x, p.z - a.z);
      a.x = p.x;
      a.z = p.z;
      a.moving = true;
      a.phase += dt * 9;
      return true;
    }
    if (a.state === 'queue' || a.state === 'joining') {
      const t = queueSlot(a.kind, a.slot);
      const speed = a.state === 'joining' ? LAYOUT.walkSpeed : LAYOUT.queueSpeed;
      if (moveToward(a, t.x, t.z, speed, dt)) {
        a.state = 'queue';
        a.heading = Math.atan2(-a.x, LAYOUT.doorZ - a.z);
      }
      return true;
    }
    if (a.state === 'entering') {
      if (!moveToward(a, SIDES[a.kind] * 0.12, LAYOUT.doorZ - 0.15, LAYOUT.queueSpeed, dt)) return true;
      stats.served += 1;
      const jitter = (rng() - 0.5) * 0.3;
      spawned.push(makeAgent(a.kind, 'exiting', { x: 0, z: LAYOUT.doorZ }, { exitX: jitter }));
      return false;
    }
    // exiting：從中間走道走到前方人行道後離開
    return !moveToward(a, a.exitX, LZ1 + 0.4, LAYOUT.walkSpeed, dt);
  };

  /** 先移動、再叫號：剛被叫到的人下一幀才開始走向門口 */
  const step = (dt) => {
    if (!(dt > 0)) return;
    const spawned = [];
    agents = [...agents.filter((a) => stepAgent(a, dt, spawned)), ...spawned];
    for (const kind of ['buy', 'sell']) {
      timers[kind] -= dt;
      while (timers[kind] <= 0) {
        callNext(kind);
        timers[kind] += params.callInterval;
      }
    }
  };

  const update = (next) => {
    params = { ...next };
    syncWalkers();
    fillLine('buy', params.buyQueue);
    fillLine('sell', params.sellQueue);
  };

  for (const kind of ['buy', 'sell']) {
    const target = params[`${kind}Queue`];
    for (let slot = 0; slot < target; slot++) {
      agents.push(makeAgent(kind, 'queue', queueSlot(kind, slot), { slot }));
    }
  }
  syncWalkers();

  return {
    get agents() { return agents; },
    stats,
    step,
    update,
  };
}
