'use strict';
// 통아저씨 (해적 룰렛) — 2-6 players. A barrel with 24 slots; one hidden slot
// triggers the spring. Take turns pushing a sword into an empty slot. When
// the pirate pops out, that player loses (or wins, by room option).

const SLOTS = 24;

module.exports = {
  id: 'pirate',
  name: '통아저씨',
  nameEn: 'Pop-up Pirate',
  minPlayers: 2,
  maxPlayers: 6,
  realtime: false,
  options: { choices: [{ key: 'mode', def: 0, values: [{ v: 0, label: '튀어나오면 패배' }, { v: 1, label: '튀어나오면 승리' }] }] },

  create(players, opts) {
    const mode = Number(opts && opts.mode) === 1 ? 1 : 0;
    return {
      n: players.length, names: players.map(p => p.name), mode,
      trigger: Math.floor(Math.random() * SLOTS),
      swords: new Array(SLOTS).fill(-1),          // seat that filled each slot
      turn: 0, seq: 0, last: null,
      over: false, winner: null, loser: null, result: null,
      log: [`게임 시작! 해적이 튀어나오면 ${mode ? '승리' : '패배'}!`]
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, mode: state.mode, slots: SLOTS, swords: state.swords,
      turn: state.turn, mySeat: seat, seq: state.seq, last: state.last,
      trigger: state.over ? state.trigger : null,
      over: state.over, winner: state.winner, loser: state.loser, result: state.result, log: state.log.slice(-30)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'stab') return { error: '알 수 없는 동작입니다.' };
    const i = action.slot;
    if (!Number.isInteger(i) || i < 0 || i >= SLOTS) return { error: '없는 구멍이에요.' };
    if (state.swords[i] >= 0) return { error: '이미 칼이 꽂힌 구멍이에요.' };
    state.swords[i] = seat;
    state.seq++;
    const pop = i === state.trigger;
    state.last = { seat, slot: i, pop };
    if (pop) {
      state.over = true;
      if (state.mode === 1) { state.winner = seat; state.result = `🏴‍☠️ 퐁! ${state.names[seat]} 승리!`; }
      else {
        state.loser = seat; state.winner = state.n === 2 ? 1 - seat : null;
        state.result = `🏴‍☠️ 퐁! ${state.names[seat]} 패배` + (state.n === 2 ? ` · ${state.names[1 - seat]} 승리!` : '');
      }
      state.log.push(state.result);
      return { ok: true };
    }
    state.log.push(`${state.names[seat]}: 칼 꽂기… 휴!`);
    state.turn = (seat + 1) % state.n;
    return { ok: true };
  },

  _internals: { SLOTS }
};
