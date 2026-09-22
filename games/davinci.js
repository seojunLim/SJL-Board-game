'use strict';
// Da Vinci Code (다빈치 코드) — 2-4 players.
// Tiles: black 0-11, white 0-11, plus one joker per color (value 12, shown as "-").
// Sorting: ascending by value; on a tie black comes before white; jokers may be
// placed anywhere by their owner.
const JOKER = 12;

function buildPool() {
  const pool = [];
  for (let v = 0; v <= 12; v++) { pool.push({ color: 'b', v }); pool.push({ color: 'w', v }); }
  return pool;
}
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor((rnd ? rnd() : Math.random()) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function sortKey(t) { return t.v * 2 + (t.color === 'b' ? 0 : 1); }
function sortHand(hand) { hand.sort((a, b) => sortKey(a) - sortKey(b)); }

function alive(state) { return state.hands.map((h, i) => (state.out[i] ? -1 : i)).filter(i => i >= 0); }
function hiddenCount(hand) { return hand.filter(t => !t.revealed).length; }

function checkEnd(state) {
  const living = state.hands.map((h, i) => hiddenCount(h) > 0 ? i : -1).filter(i => i >= 0);
  state.out = state.hands.map(h => hiddenCount(h) === 0);
  if (living.length <= 1) {
    state.over = true;
    state.winner = living.length === 1 ? living[0] : null;
    state.result = living.length === 1 ? `${state.names[living[0]]} 승리!` : '무승부';
    for (const h of state.hands) for (const t of h) t.revealed = true;
    return true;
  }
  return false;
}

function nextTurn(state) {
  let t = state.turn;
  for (let i = 0; i < state.hands.length; i++) {
    t = (t + 1) % state.hands.length;
    if (!state.out[t]) break;
  }
  state.turn = t;
  state.drawn = null;
  state.phase = state.pool.length ? 'draw' : 'guess';
}

module.exports = {
  id: 'davinci',
  name: '다빈치 코드',
  nameEn: 'Da Vinci Code',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    const n = players.length;
    const pool = shuffle(buildPool());
    const per = n === 2 ? 4 : 3;
    const hands = [];
    for (let i = 0; i < n; i++) {
      const h = [];
      for (let k = 0; k < per; k++) h.push(Object.assign(pool.pop(), { revealed: false }));
      sortHand(h);
      hands.push(h);
    }
    const state = {
      pool, hands, names: players.map(p => p.name), turn: 0, out: new Array(n).fill(false),
      phase: pool.length ? 'draw' : 'guess', drawn: null, log: [],
      over: false, winner: null, result: null, lastGuess: null
    };
    state.log.push('게임 시작! 각자 타일을 오름차순(같은 숫자는 검정이 왼쪽)으로 정렬했습니다.');
    return state;
  },

  view(state, seat) {
    return {
      turn: state.turn, phase: state.phase, poolLeft: state.pool.length,
      names: state.names, out: state.out, log: state.log.slice(-40),
      over: state.over, winner: state.winner, result: state.result, lastGuess: state.lastGuess,
      mySeat: seat,
      drawn: (seat === state.turn && state.drawn) ? state.drawn : (state.drawn ? { hidden: true } : null),
      hands: state.hands.map((h, i) => h.map(t => (t.revealed || i === seat || state.over)
        ? { color: t.color, v: t.v, revealed: t.revealed, joker: t.v === JOKER }
        : { color: t.color, revealed: false }))
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (state.out[seat]) return { error: '이미 탈락했습니다.' };
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };

    if (action.type === 'draw') {
      if (state.phase !== 'draw') return { error: '지금은 뽑을 수 없습니다.' };
      if (!state.pool.length) { state.phase = 'guess'; return { ok: true }; }
      state.drawn = Object.assign(state.pool.pop(), { revealed: false });
      state.phase = 'guess';
      return { ok: true };
    }

    if (action.type === 'guess') {
      if (state.phase !== 'guess') return { error: '먼저 타일을 뽑으세요.' };
      const { target, index, color, value } = action;
      if (target === seat) return { error: '자신의 타일은 맞힐 수 없습니다.' };
      const hand = state.hands[target];
      if (!hand || !hand[index] || hand[index].revealed) return { error: '잘못된 대상입니다.' };
      const t = hand[index];
      const guessV = value === 'joker' ? JOKER : Number(value);
      const correct = t.color === color && t.v === guessV;
      const label = v => (v === JOKER ? '조커' : v);
      state.lastGuess = { by: seat, target, index, color, value: guessV, correct };

      if (correct) {
        t.revealed = true;
        state.log.push(`${state.names[seat]} → ${state.names[target]}의 ${index + 1}번째 타일을 ${color === 'b' ? '검정' : '흰색'} ${label(guessV)}(으)로 적중!`);
        if (checkEnd(state)) return { ok: true };
        state.phase = 'continue';
        return { ok: true };
      }
      state.log.push(`${state.names[seat]}의 추측 실패 (${state.names[target]}의 ${index + 1}번째, ${color === 'b' ? '검정' : '흰색'} ${label(guessV)})`);
      if (state.drawn) {
        state.drawn.revealed = true;
        const pos = Number.isInteger(action.place) ? action.place : -1;
        this._insert(state, seat, state.drawn, pos);
        state.log.push(`${state.names[seat]}은(는) 뽑은 타일을 공개했습니다.`);
      } else {
        state.phase = 'reveal-own';
        return { ok: true };
      }
      if (checkEnd(state)) return { ok: true };
      nextTurn(state);
      return { ok: true };
    }

    if (action.type === 'reveal-own') {
      if (state.phase !== 'reveal-own') return { error: '지금은 할 수 없습니다.' };
      const h = state.hands[seat];
      const t = h[action.index];
      if (!t || t.revealed) return { error: '공개할 수 없는 타일입니다.' };
      t.revealed = true;
      state.log.push(`${state.names[seat]}이(가) 자신의 타일 하나를 공개했습니다.`);
      if (checkEnd(state)) return { ok: true };
      nextTurn(state);
      return { ok: true };
    }

    if (action.type === 'stop') {
      if (state.phase !== 'continue') return { error: '지금은 할 수 없습니다.' };
      if (state.drawn) {
        const pos = Number.isInteger(action.place) ? action.place : -1;
        this._insert(state, seat, state.drawn, pos);
      }
      state.log.push(`${state.names[seat]}이(가) 턴을 마쳤습니다.`);
      nextTurn(state);
      return { ok: true };
    }

    if (action.type === 'continue') {
      if (state.phase !== 'continue') return { error: '지금은 할 수 없습니다.' };
      state.phase = 'guess';
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  // Inserts a tile; jokers may go anywhere (pos), others are sorted.
  _insert(state, seat, tile, pos) {
    const hand = state.hands[seat];
    if (tile.v === JOKER && pos >= 0 && pos <= hand.length) hand.splice(pos, 0, tile);
    else if (tile.v === JOKER) hand.push(tile);
    else {
      let i = 0;
      while (i < hand.length && hand[i].v !== JOKER && sortKey(hand[i]) < sortKey(tile)) i++;
      // keep jokers in place: find first non-joker slot whose key is larger
      i = 0;
      while (i < hand.length && (hand[i].v === JOKER || sortKey(hand[i]) < sortKey(tile))) i++;
      hand.splice(i, 0, tile);
    }
    state.drawn = null;
  },

  _internals: { sortHand, sortKey, JOKER }
};
