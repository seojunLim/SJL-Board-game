'use strict';
// 펭귄 얼음깨기 — 2-4 players. A 7x7 sheet of ice blocks sits in a frame
// with a penguin on the centre block. Take turns knocking out one block with
// the hammer. Blocks that lose their hold drop out too. Whoever drops the
// penguin loses.
//
// Hold model: blocks hang together; a block stays only if it is linked
// (side by side) to the frame through other blocks. A frame-edge block needs
// at least one neighbour unless it is a corner. A block hanging by a single
// neighbour may slip out (35%) when the sheet shakes. The penguin's block
// needs two neighbours to carry its weight.

const N = 7;
const C = 3;                                       // penguin at (C, C)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function neighbours(ice, r, c) {
  let k = 0;
  for (const [dr, dc] of DIRS) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && ice[rr][cc]) k++; }
  return k;
}
const onEdge = (r, c) => r === 0 || c === 0 || r === N - 1 || c === N - 1;
const isCorner = (r, c) => (r === 0 || r === N - 1) && (c === 0 || c === N - 1);

// Remove everything that can no longer hang on. Returns dropped cells in order.
function settle(ice, rnd) {
  const dropped = [];
  for (let pass = 0; pass < 20; pass++) {
    // anchored = edge blocks that are held (corner, or touching another block)
    const held = Array.from({ length: N }, () => new Array(N).fill(false));
    const q = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (ice[r][c] && onEdge(r, c) && (isCorner(r, c) || neighbours(ice, r, c) > 0)) { held[r][c] = true; q.push([r, c]); }
    }
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of DIRS) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && ice[rr][cc] && !held[rr][cc]) { held[rr][cc] = true; q.push([rr, cc]); }
      }
    }
    // the penguin is heavy: its block needs two neighbours to carry it
    if (ice[C][C] && neighbours(ice, C, C) < 2) held[C][C] = false;
    let changed = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (ice[r][c] && !held[r][c]) { ice[r][c] = false; dropped.push([r, c]); changed = true; }
    }
    if (!changed) {
      // shaky blocks: inner blocks hanging by one neighbour may slip
      const shaky = [];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        if (ice[r][c] && !onEdge(r, c) && neighbours(ice, r, c) === 1) shaky.push([r, c]);
      }
      for (const [r, c] of shaky) if (rnd() < 0.35) { ice[r][c] = false; dropped.push([r, c]); changed = true; }
      if (!changed) break;
    }
  }
  return dropped;
}

module.exports = {
  id: 'penguin',
  name: '펭귄 얼음깨기',
  nameEn: 'Penguin Ice Breaker',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    return {
      n: players.length, names: players.map(p => p.name),
      ice: Array.from({ length: N }, () => new Array(N).fill(true)),
      turn: 0, over: false, winner: null, loser: null, result: null,
      last: null, seq: 0, hits: 0,
      log: ['게임 시작! 펭귄이 떨어지지 않게 얼음을 하나씩 깨세요.']
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, ice: state.ice, turn: state.turn, mySeat: seat, size: N, penguin: [C, C],
      last: state.last, seq: state.seq, hits: state.hits,
      over: state.over, winner: state.winner, loser: state.loser, result: state.result, log: state.log.slice(-30)
    };
  },

  move(state, seat, action, rnd = Math.random) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true; state.loser = seat; state.winner = state.n === 2 ? 1 - seat : null;
      state.result = `${state.names[seat]} 포기`; state.log.push(state.result);
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'hit') return { error: '알 수 없는 동작입니다.' };
    const { r, c } = action;
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= N || c >= N || !state.ice[r][c]) return { error: '이미 깨진 자리예요.' };
    state.ice[r][c] = false;
    const dropped = settle(state.ice, rnd);
    state.seq++; state.hits++;
    const fell = !state.ice[C][C];
    state.last = { seat, hit: [r, c], dropped, fell };
    state.log.push(`${state.names[seat]}: 얼음 깨기${dropped.length ? ` (+${dropped.length}개 같이 떨어짐)` : ''}`);
    if (fell) {
      state.over = true; state.loser = seat; state.winner = state.n === 2 ? 1 - seat : null;
      state.result = `🐧 펭귄이 떨어졌어요! ${state.names[seat]} 패배` + (state.n === 2 ? ` · ${state.names[1 - seat]} 승리!` : '');
      state.log.push(state.result);
      return { ok: true };
    }
    state.turn = (seat + 1) % state.n;
    return { ok: true };
  },

  _internals: { settle, N, C }
};
