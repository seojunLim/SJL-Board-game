'use strict';
// Loopin' Louie (루핑 루이) — real-time dexterity game for 2-4 players.
// A plane orbits the board. When it reaches your station you must flick your
// lever at the right moment to swat it away; otherwise it knocks off a chicken.
// Last player with chickens left wins.

const CHICKENS = 3;
const HIT_ARC = 9;          // degrees around a station that count as "at the station"
const SWING_MS = 230;       // how long a flicked lever stays up
const COOLDOWN_MS = 520;    // penalty cooldown after the lever comes down
const START_SPEED = 95;     // degrees per second
const SPEED_STEP = 7;       // speed gained after every deflection
const MAX_SPEED = 260;

const norm = a => ((a % 360) + 360) % 360;

module.exports = {
  id: 'louie',
  name: '루핑 루이',
  nameEn: "Loopin' Louie",
  minPlayers: 2,
  maxPlayers: 4,
  realtime: true,
  tickMs: 33,

  create(players) {
    const n = players.length;
    const now = Date.now();
    return {
      n, names: players.map(p => p.name),
      stations: Array.from({ length: n }, (_, i) => (360 / n) * i),
      chickens: new Array(n).fill(CHICKENS),
      lever: Array.from({ length: n }, () => ({ upUntil: 0, coolUntil: 0 })),
      angle: 180 / n + 180,
      dir: 1,
      speed: START_SPEED,
      last: now,
      startAt: now + 3000,
      immuneUntil: 0,
      events: [],
      log: ['3초 후 시작! 루이가 다가오면 레버를 치세요 (스페이스 / 클릭).'],
      over: false, winner: null, result: null
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, mySeat: seat, stations: state.stations,
      chickens: state.chickens, angle: state.angle, dir: state.dir, speed: state.speed,
      lever: state.lever.map(l => ({ up: Date.now() < l.upUntil, cool: Date.now() < l.coolUntil })),
      startsIn: Math.max(0, state.startAt - Date.now()),
      over: state.over, winner: state.winner, result: state.result,
      events: state.events.slice(-6), log: state.log.slice(-15)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type !== 'flick') return { error: '알 수 없는 동작입니다.' };
    if (state.chickens[seat] <= 0) return { error: '이미 탈락했습니다.' };
    const now = Date.now();
    const l = state.lever[seat];
    if (now < l.coolUntil || now < l.upUntil) return { ok: true, silent: true };
    l.upUntil = now + SWING_MS;
    l.coolUntil = now + SWING_MS + COOLDOWN_MS;
    return { ok: true };
  },

  tick(state) {
    if (state.over) return false;
    const now = Date.now();
    const dt = Math.min(200, now - state.last) / 1000;
    state.last = now;
    if (now < state.startAt) return true;

    const prev = state.angle;
    const travel = Math.min(359, state.speed * dt);
    state.angle = norm(state.angle + state.dir * travel);

    // A station is crossed when it lies inside the arc swept this frame.
    for (let i = 0; i < state.n; i++) {
      if (state.chickens[i] <= 0) continue;
      const st = state.stations[i];
      const gap = state.dir > 0 ? norm(st - prev) : norm(prev - st);
      if (gap > travel) continue;
      if (now < state.immuneUntil) continue;

      const l = state.lever[i];
      if (now < l.upUntil) {
        state.dir = -state.dir;
        state.speed = Math.min(MAX_SPEED, state.speed + SPEED_STEP);
        state.angle = norm(st - state.dir * (HIT_ARC + 4));
        state.immuneUntil = now + 120;
        state.events.push({ type: 'deflect', seat: i, t: now });
        state.log.push(`${state.names[i]} 격추 성공! 속도 ${Math.round(state.speed)}`);
        l.upUntil = now;
        l.coolUntil = now + 180;
      } else {
        state.chickens[i]--;
        state.immuneUntil = now + 500;
        state.events.push({ type: 'hit', seat: i, t: now });
        state.log.push(`${state.names[i]}의 닭이 떨어졌습니다! (남은 닭 ${state.chickens[i]})`);
        if (state.chickens[i] === 0) state.log.push(`${state.names[i]} 탈락!`);
      }
    }

    const living = [];
    for (let i = 0; i < state.n; i++) if (state.chickens[i] > 0) living.push(i);
    if (living.length <= 1) {
      state.over = true;
      state.winner = living.length === 1 ? living[0] : null;
      state.result = living.length === 1 ? `${state.names[living[0]]} 승리!` : '무승부';
    }
    if (state.events.length > 20) state.events = state.events.slice(-10);
    if (state.log.length > 60) state.log = state.log.slice(-30);
    return true;
  }
};
