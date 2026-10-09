'use strict';
// Blokus (블로커스) — 20x20, four colours with the standard 21 pieces (89
// squares) each. 2 players control two colours each; 3-4 players one colour.
// A colour's first piece must cover its corner; afterwards every piece must
// touch a same-coloured piece corner-to-corner and never edge-to-edge.
// A colour that cannot place is out. Score: -1 per square left, +15 for
// placing every piece, +5 more if the monomino went last.
const N = 20;
const PIECES = {
  I1: [[0, 0]],
  I2: [[0, 0], [0, 1]],
  I3: [[0, 0], [0, 1], [0, 2]], V3: [[0, 0], [1, 0], [1, 1]],
  I4: [[0, 0], [0, 1], [0, 2], [0, 3]], L4: [[0, 0], [1, 0], [2, 0], [2, 1]], T4: [[0, 0], [0, 1], [0, 2], [1, 1]],
  S4: [[0, 1], [0, 2], [1, 0], [1, 1]], O4: [[0, 0], [0, 1], [1, 0], [1, 1]],
  F5: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]], I5: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  L5: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]], N5: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]],
  P5: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]], T5: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]],
  U5: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], V5: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]],
  W5: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], X5: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  Y5: [[0, 1], [1, 0], [1, 1], [2, 1], [3, 1]], Z5: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]]
};
const IDS = Object.keys(PIECES);
const CORNERS = [[0, 0], [0, N - 1], [N - 1, N - 1], [N - 1, 0]];
const COLOR_KO = ['파랑', '노랑', '빨강', '초록'];

function normalize(cells) {
  const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
// All distinct rotations/reflections of every piece.
const ORIENTS = {};
for (const id of IDS) {
  const seen = new Set(), list = [];
  let cur = PIECES[id];
  for (let f = 0; f < 2; f++) {
    for (let k = 0; k < 4; k++) {
      const n = normalize(cur);
      const key = JSON.stringify(n);
      if (!seen.has(key)) { seen.add(key); list.push(n); }
      cur = cur.map(([r, c]) => [c, -r]);
    }
    cur = cur.map(([r, c]) => [r, -c]);
  }
  ORIENTS[id] = list;
}

function canPlace(board, color, first, cells) {
  let corner = false;
  for (const [r, c] of cells) {
    if (r < 0 || c < 0 || r >= N || c >= N || board[r][c] !== -1) return false;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) return false;
    }
    if (first) { if (r === CORNERS[color][0] && c === CORNERS[color][1]) corner = true; }
    else for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) corner = true;
    }
  }
  return corner;
}

function anchors(board, color, first) {
  if (first) return [CORNERS[color]];
  const out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (board[r][c] !== -1) continue;
    let diag = false, edge = false;
    for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) diag = true; }
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) edge = true; }
    if (diag && !edge) out.push([r, c]);
  }
  return out;
}

function hasAnyMove(state, color) {
  const col = state.colors[color];
  const first = col.left.length === IDS.length;
  for (const [ar, ac] of anchors(state.board, color, first)) {
    for (const id of col.left) for (const o of ORIENTS[id]) for (const [pr, pc] of o) {
      const cells = o.map(([r, c]) => [r - pr + ar, c - pc + ac]);
      if (canPlace(state.board, color, first, cells)) return true;
    }
  }
  return false;
}

function scoreOf(col) {
  if (!col.left.length) return 15 + (col.lastPiece === 'I1' ? 5 : 0);
  return -col.left.reduce((s, id) => s + PIECES[id].length, 0);
}

function advance(state) {
  for (let i = 0; i < 4; i++) {
    state.turnColor = state.order[(state.order.indexOf(state.turnColor) + 1) % state.order.length];
    const col = state.colors[state.turnColor];
    if (col.done) continue;
    if (!col.left.length || !hasAnyMove(state, state.turnColor)) {
      col.done = true;
      state.log.push(`${COLOR_KO[state.turnColor]}은(는) 더 둘 곳이 없어 끝났습니다.`);
      continue;
    }
    state.turn = col.owner;
    return;
  }
  // nobody can move
  state.over = true;
  const scores = state.names.map((_, s) => state.order.filter(c => state.colors[c].owner === s).reduce((a, c) => a + scoreOf(state.colors[c]), 0));
  state.scores = scores;
  const best = Math.max(...scores);
  const winners = scores.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
  state.winner = winners.length === 1 ? winners[0] : null;
  state.result = (winners.length === 1 ? `${state.names[winners[0]]} 승리! ` : '공동 1위! ') + scores.map((v, i) => `${state.names[i]} ${v}점`).join(' · ');
}

module.exports = {
  id: 'blokus',
  name: '블로커스',
  nameEn: 'Blokus',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    const n = players.length;
    const order = n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    const owner = c => (n === 2 ? c % 2 : c);
    const colors = {};
    for (const c of order) colors[c] = { owner: owner(c), left: IDS.slice(), done: false, lastPiece: null };
    return {
      names: players.map(p => p.name), n, order, colors,
      board: Array.from({ length: N }, () => new Array(N).fill(-1)),
      turnColor: 0, turn: owner(0), over: false, winner: null, result: null, scores: null,
      log: ['게임 시작! 첫 조각은 자기 색 모서리 칸을 덮어야 해요.'], last: null
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, board: state.board, order: state.order,
      colors: state.colors, turnColor: state.turnColor, turn: state.turn, mySeat: seat,
      myColors: state.order.filter(c => state.colors[c].owner === seat),
      scores: state.order.reduce((o, c) => (o[c] = scoreOf(state.colors[c]), o), {}),
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-30), last: state.last,
      orients: ORIENTS, corners: CORNERS
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      for (const c of state.order) if (state.colors[c].owner === seat) state.colors[c].done = true;
      state.log.push(`${state.names[seat]} 포기`);
      if (state.colors[state.turnColor].owner === seat) advance(state);
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'place') return { error: '알 수 없는 동작입니다.' };
    const color = state.turnColor;
    const col = state.colors[color];
    const id = action.piece;
    if (!col.left.includes(id)) return { error: '이미 쓴 조각입니다.' };
    const o = ORIENTS[id][action.orient];
    if (!o || !Number.isInteger(action.r) || !Number.isInteger(action.c)) return { error: '잘못된 배치입니다.' };
    const cells = o.map(([r, c]) => [r + action.r, c + action.c]);
    const first = col.left.length === IDS.length;
    if (!canPlace(state.board, color, first, cells)) {
      return { error: first ? '첫 조각은 자기 색 모서리 칸을 덮어야 해요.' : '같은 색과는 모서리로만 닿아야 하고, 변끼리는 닿으면 안 돼요.' };
    }
    for (const [r, c] of cells) state.board[r][c] = color;
    col.left = col.left.filter(x => x !== id);
    col.lastPiece = id;
    state.last = { color, cells };
    state.log.push(`${state.names[seat]} (${COLOR_KO[color]}) ${PIECES[id].length}칸 조각`);
    advance(state);
    return { ok: true };
  },

  _internals: { PIECES, ORIENTS, IDS, canPlace, hasAnyMove, scoreOf, N }
};
