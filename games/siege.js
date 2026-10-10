'use strict';
// 블록 공성전 — an original game by 임서준. 2-4 players each build a castle of
// wooden blocks in secret, then take turns flinging a block from a slingshot
// at the others. A player is out when their flag block falls off their
// pedestal or their castle is knocked almost flat. Last castle standing wins.
//
// The server owns the physics (cannon-es): it settles the castles, simulates
// every shot and sends the recorded motion to all clients, so everybody sees
// exactly the same collapse.

const CANNON = require('cannon-es');

const BH = 0.6;                                   // block thickness
const SIZES = { 0: [3, BH, 1], 1: [1, BH, 3], 2: [1, 3, BH], 3: [BH, 3, 1] };
const FLAG = [1, 0.8, 1];
const HALF = 3;                                   // plot is 6x6
const PED_TOP = 1;                                // pedestal height
const MAX_TOP = 12;
const OUT_HEIGHT = BH * 1.5;                      // "almost flat"
const MIN_HEIGHT = BH * 3;                        // must build 3 layers high
const GRAVITY = -20;
const SHOT_SECS = 20;
const MODES = { 0: { budget: 24, secs: 150 }, 1: { budget: 18, secs: 90 } };

function sizeOf(it) { return it.k === 'f' ? FLAG : SIZES[it.o]; }
const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;

// Drop each piece straight down onto the plot or the pieces under it.
// Returns pieces with local centre y filled in, or { error }.
function stack(items, budget) {
  const out = [];
  let blocks = 0, flags = 0;
  for (const raw of items) {
    const it = { k: raw.k === 'f' ? 'f' : 'b', o: raw.k === 'f' ? 0 : Number(raw.o), x: Math.round(Number(raw.x) * 2) / 2, z: Math.round(Number(raw.z) * 2) / 2 };
    if (it.k === 'b' && !SIZES[it.o]) return { error: '잘못된 블록 방향이에요.' };
    if (!isFinite(it.x) || !isFinite(it.z)) return { error: '잘못된 위치예요.' };
    const [sx, sy, sz] = sizeOf(it);
    if (Math.abs(it.x) + sx / 2 > HALF + 1e-6 || Math.abs(it.z) + sz / 2 > HALF + 1e-6) return { error: '성터 밖이에요.' };
    let bottom = 0;
    for (const o of out) {
      const [ox, oy, oz] = sizeOf(o);
      if (overlap(it.x - sx / 2, it.x + sx / 2, o.x - ox / 2, o.x + ox / 2) && overlap(it.z - sz / 2, it.z + sz / 2, o.z - oz / 2, o.z + oz / 2)) bottom = Math.max(bottom, o.y + oy / 2);
    }
    if (bottom + sy > MAX_TOP) return { error: '너무 높아요.' };
    it.y = bottom + sy / 2;
    if (it.k === 'f') flags++; else blocks++;
    out.push(it);
  }
  if (blocks > budget) return { error: `블록은 ${budget}개까지예요.` };
  if (flags > 1) return { error: '깃발은 하나만 놓을 수 있어요.' };
  return { items: out, blocks, flags };
}
const topOf = items => items.reduce((m, it) => Math.max(m, it.y + sizeOf(it)[1] / 2), 0);

function plotsFor(n) {
  const R = n === 2 ? 8.5 : 10;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n;
    const cx = Math.cos(a) * R, cz = Math.sin(a) * R;
    const len = Math.hypot(cx, cz);
    const ix = -cx / len, iz = -cz / len;          // toward the centre
    return { cx: +cx.toFixed(3), cz: +cz.toFixed(3), sx: +(cx + ix * 5.4).toFixed(3), sz: +(cz + iz * 5.4).toFixed(3), sy: 2.2, yaw: Math.atan2(ix, iz) };
  });
}

// ------------------------------------------------------------ physics
function makeWorld(state) {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0), allowSleep: true });
  world.solver.iterations = 18;
  world.defaultContactMaterial.friction = 0.62;
  world.defaultContactMaterial.restitution = 0.04;
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  for (const p of state.plots) {
    const ped = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(HALF + 0.3, PED_TOP / 2, HALF + 0.3)) });
    ped.position.set(p.cx, PED_TOP / 2, p.cz);
    world.addBody(ped);
  }
  const map = new Map();
  for (const b of state.bodies) {
    const body = new CANNON.Body({ mass: b.kind === 'a' ? 4 : b.kind === 'f' ? 0.8 : 1, shape: new CANNON.Box(new CANNON.Vec3(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)) });
    body.position.set(b.p[0], b.p[1], b.p[2]);
    body.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    body.linearDamping = 0.02; body.angularDamping = 0.05;
    body.sleepSpeedLimit = 0.12; body.sleepTimeLimit = 0.35;
    world.addBody(body);
    body.sleep();
    map.set(b.id, body);
  }
  return { world, map };
}
const r3 = v => Math.round(v * 1000) / 1000;
const r4 = v => Math.round(v * 10000) / 10000;

// Step the world, recording motion at 15 fps, until everything rests.
// Frames are integer-encoded: position x100, quaternion x1000.
function simulate(state, world, map, maxSecs, minSecs) {
  const ids = state.bodies.map(b => b.id);
  const raw = [];
  const dt = 1 / 60;
  let t = 0, quiet = 0;
  const snap = () => raw.push(ids.map(id => { const b = map.get(id); return [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]; }));
  snap();
  for (let step = 1; t < maxSecs; step++) {
    world.step(dt);
    t += dt;
    if (step % 4 === 0) snap();
    let moving = false;
    for (const b of map.values()) if (b.sleepState !== CANNON.Body.SLEEPING && (b.velocity.length() > 0.3 || b.angularVelocity.length() > 0.4)) { moving = true; break; }
    quiet = moving ? 0 : quiet + dt;
    if (t > minSecs && quiet > 0.25) break;
  }
  snap();
  // keep only bodies that visibly moved
  const keep = [];
  ids.forEach((id, i) => {
    const a = raw[0][i];
    for (const f of raw) if (Math.hypot(f[i][0] - a[0], f[i][1] - a[1], f[i][2] - a[2]) > 0.04) { keep.push(i); break; }
  });
  for (const b of state.bodies) {
    const body = map.get(b.id);
    b.p = [r3(body.position.x), r3(body.position.y), r3(body.position.z)];
    b.q = [r4(body.quaternion.x), r4(body.quaternion.y), r4(body.quaternion.z), r4(body.quaternion.w)];
  }
  const enc = f => keep.flatMap(i => { const v = f[i]; return [Math.round(v[0] * 100), Math.round(v[1] * 100), Math.round(v[2] * 100), Math.round(v[3] * 1000), Math.round(v[4] * 1000), Math.round(v[5] * 1000), Math.round(v[6] * 1000)]; });
  return { ids: keep.map(i => ids[i]), frames: raw.map(enc), fps: 15 };
}

// world-space half height of a rotated box
function halfHeight(b) {
  const [x, y, z, w] = b.q;
  // rotation matrix row for world Y
  const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
  return (Math.abs(r10) * b.size[0] + Math.abs(r11) * b.size[1] + Math.abs(r12) * b.size[2]) / 2;
}
function judge(state) {
  state.heights = state.plots.map((p, s) => {
    let top = 0;
    for (const b of state.bodies) {
      if (b.owner !== s || b.kind === 'a') continue;
      if (Math.abs(b.p[0] - p.cx) > HALF + 0.4 || Math.abs(b.p[2] - p.cz) > HALF + 0.4) continue;
      top = Math.max(top, b.p[1] + halfHeight(b) - PED_TOP);
    }
    return Math.round(top * 100) / 100;
  });
  const newlyOut = [];
  state.plots.forEach((p, s) => {
    if (!state.alive[s]) return;
    const flag = state.bodies.find(b => b.owner === s && b.kind === 'f');
    const fell = !flag || flag.p[1] < PED_TOP - 0.05 || Math.abs(flag.p[0] - p.cx) > HALF + 0.6 || Math.abs(flag.p[2] - p.cz) > HALF + 0.6;
    const flat = state.heights[s] <= OUT_HEIGHT;
    if (fell || flat) {
      state.alive[s] = false; newlyOut.push(s);
      state.log.push(`💥 ${state.names[s]} 탈락! (${fell ? '깃발이 떨어졌어요' : '성이 무너졌어요'})`);
    }
  });
  const alive = state.alive.map((a, i) => (a ? i : -1)).filter(i => i >= 0);
  if (alive.length <= 1) {
    state.over = true; state.phase = 'over';
    state.winner = alive.length === 1 ? alive[0] : null;
    state.result = alive.length === 1 ? `🏰 ${state.names[alive[0]]}의 성이 끝까지 살아남았어요! 승리!` : '모든 성이 동시에 무너졌어요. 무승부!';
    state.log.push(state.result);
  }
  return newlyOut;
}

function finishBuild(state) {
  state.bodies = [];
  let id = 0;
  state.plots.forEach((p, s) => {
    let items = (state.drafts[s] && stack(state.drafts[s], state.budget).items) || [];
    if (!items.some(it => it.k === 'f')) {
      // no flag placed in time: put it on top in the middle
      const r = stack([...items, { k: 'f', x: 0, z: 0 }], state.budget);
      items = r.items || items;
    }
    for (const it of items) {
      state.bodies.push({ id: id++, owner: s, kind: it.k, size: sizeOf(it).slice(), p: [r3(p.cx + it.x), r3(PED_TOP + it.y), r3(p.cz + it.z)], q: [0, 0, 0, 1] });
    }
  });
  const { world, map } = makeWorld(state);
  for (const b of map.values()) b.wakeUp();
  const rep = simulate(state, world, map, 3, 1.5);
  state.replay = Object.assign(rep, { seq: ++state.seq, kind: 'settle' });
  state.phase = 'attack';
  state.log.push('🌫️ 안개가 걷혔어요! 공격 시작!');
  judge(state);
  if (!state.over) {
    state.turn = state.alive.indexOf(true);
    state.deadline = Date.now() + (rep.frames.length / rep.fps) * 1000 + 1500 + SHOT_SECS * 1000;
  }
}

function nextTurn(state, extraMs) {
  let t = state.turn;
  for (let k = 0; k < state.n; k++) { t = (t + 1) % state.n; if (state.alive[t]) break; }
  state.turn = t;
  state.deadline = Date.now() + extraMs + SHOT_SECS * 1000;
}

module.exports = {
  id: 'siege',
  name: '블록 공성전',
  nameEn: 'Block Siege',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,
  tickMs: 500,
  options: { choices: [{ key: 'mode', def: 0, values: [{ v: 0, label: '정식 (블록 24개 · 150초)' }, { v: 1, label: '빠른 판 (블록 18개 · 90초)' }] }] },

  create(players, opts) {
    const mode = MODES[Number(opts && opts.mode)] ? Number(opts && opts.mode) : 0;
    const n = players.length;
    return {
      n, names: players.map(p => p.name), mode, budget: MODES[mode].budget,
      plots: plotsFor(n), phase: 'build', deadline: Date.now() + MODES[mode].secs * 1000,
      drafts: players.map(() => []), done: players.map(() => false),
      bodies: [], alive: players.map(() => true), heights: players.map(() => 0),
      turn: 0, seq: 0, shots: 0, replay: null,
      over: false, winner: null, result: null,
      log: ['🏗️ 건설 시작! 남의 성은 안개에 가려 안 보여요. 깃발을 꼭 놓으세요.']
    };
  },

  view(state, seat) {
    const building = state.phase === 'build';
    return {
      n: state.n, names: state.names, mySeat: seat, phase: state.phase, mode: state.mode, budget: state.budget,
      plots: state.plots, deadline: state.deadline, now: Date.now(),
      myDraft: seat >= 0 ? state.drafts[seat] : [], done: state.done,
      counts: state.drafts.map(d => d.filter(it => it.k !== 'f').length),
      bodies: building ? [] : state.bodies, alive: state.alive, heights: state.heights,
      turn: state.turn, seq: state.seq, shots: state.shots, replay: state.replay,
      consts: { BH, SIZES, FLAG, HALF, PED_TOP, OUT_HEIGHT, MIN_HEIGHT, GRAVITY, MAX_TOP },
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-30)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat < 0) return { error: '관전 중이에요.' };
    if (action.type === 'draft' || action.type === 'submit') {
      if (state.phase !== 'build') return { error: '건설 시간이 끝났어요.' };
      if (state.done[seat]) return { error: '이미 완료했어요.' };
      const items = Array.isArray(action.items) ? action.items.slice(0, 60) : [];
      const r = stack(items, state.budget);
      if (r.error) return { error: r.error };
      state.drafts[seat] = r.items.map(({ k, o, x, z }) => ({ k, o, x, z }));
      if (action.type === 'submit') {
        if (r.flags !== 1) return { error: '깃발을 하나 놓아야 해요.' };
        if (topOf(r.items) < MIN_HEIGHT - 1e-6) return { error: '성을 블록 3층 높이 이상으로 쌓아야 해요.' };
        state.done[seat] = true;
        state.log.push(`${state.names[seat]} 건설 완료! (블록 ${r.blocks}개)`);
        if (state.done.every(Boolean)) finishBuild(state);
      }
      return { ok: true };
    }
    if (action.type === 'shoot') {
      if (state.phase !== 'attack') return { error: '아직 공격할 수 없어요.' };
      if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
      const yaw = Number(action.yaw), pitch = Math.max(-0.3, Math.min(1.35, Number(action.pitch))), power = Math.max(0, Math.min(1, Number(action.power)));
      if (!isFinite(yaw) || !isFinite(pitch) || !isFinite(power)) return { error: '잘못된 발사예요.' };
      const p = state.plots[seat];
      const id = state.bodies.length ? Math.max(...state.bodies.map(b => b.id)) + 1 : 0;
      const ammo = { id, owner: seat, kind: 'a', size: [3, BH, 1], p: [p.sx, p.sy, p.sz], q: [0, 0, 0, 1] };
      // point the long side along the flight
      const h = yaw / 2; ammo.q = [0, r4(Math.sin(h + Math.PI / 4)), 0, r4(Math.cos(h + Math.PI / 4))];
      state.bodies.push(ammo);
      const { world, map } = makeWorld(state);
      const body = map.get(id);
      body.wakeUp();
      const speed = 6 + 26 * power;
      body.velocity.set(Math.sin(yaw) * Math.cos(pitch) * speed, Math.sin(pitch) * speed, Math.cos(yaw) * Math.cos(pitch) * speed);
      body.angularVelocity.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
      const rep = simulate(state, world, map, 7, 1.2);
      state.replay = Object.assign(rep, { seq: ++state.seq, kind: 'shot', shooter: seat, ammo: id });
      state.shots++;
      state.log.push(`${state.names[seat]} 발사! 🏹`);
      // drop ammo that flew off the table
      state.bodies = state.bodies.filter(b => b.kind !== 'a' || b.p[1] > -5);
      judge(state);
      if (!state.over) nextTurn(state, (rep.frames.length / rep.fps) * 1000 + 1200);
      return { ok: true };
    }
    if (action.type === 'resign') {
      if (!state.alive[seat]) return { error: '이미 탈락했어요.' };
      state.alive[seat] = false;
      state.log.push(`${state.names[seat]} 항복`);
      const alive = state.alive.map((a, i) => (a ? i : -1)).filter(i => i >= 0);
      if (alive.length === 1) { state.over = true; state.phase = 'over'; state.winner = alive[0]; state.result = `🏰 ${state.names[alive[0]]} 승리!`; }
      else if (state.phase === 'build') { state.done[seat] = true; if (state.done.every(Boolean)) finishBuild(state); }
      else if (state.turn === seat) nextTurn(state, 0);
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  tick(state) {
    if (state.over) return false;
    if (Date.now() < state.deadline) return false;
    if (state.phase === 'build') {
      state.log.push('⏰ 건설 시간 끝!');
      state.done = state.done.map(() => true);
      finishBuild(state);
      return true;
    }
    if (state.phase === 'attack') {
      state.log.push(`⏰ ${state.names[state.turn]} 시간 초과, 차례가 넘어가요.`);
      nextTurn(state, 0);
      return true;
    }
    return false;
  },

  _internals: { stack, topOf, plotsFor, judge, SIZES, FLAG, HALF, PED_TOP, MIN_HEIGHT, OUT_HEIGHT }
};
