'use strict';
// Full chess rules: castling, en passant, promotion, check/checkmate/stalemate,
// 50-move rule, threefold repetition, insufficient material.

const START = [
  'rnbqkbnr',
  'pppppppp',
  '........',
  '........',
  '........',
  '........',
  'PPPPPPPP',
  'RNBQKBNR'
];

function newBoard() {
  return START.map(r => r.split(''));
}

const isWhite = p => p >= 'A' && p <= 'Z';
const isBlack = p => p >= 'a' && p <= 'z';
const colorOf = p => (p === '.' ? null : isWhite(p) ? 'w' : 'b');
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

const DIRS = {
  N: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]],
  B: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  R: [[-1, 0], [1, 0], [0, -1], [0, 1]],
  KN: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
};

function findKing(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return [r, c];
  return null;
}

function attacked(board, r, c, byColor) {
  // pawns
  const dir = byColor === 'w' ? 1 : -1; // pawn at r+dir attacks (r,c)
  for (const dc of [-1, 1]) {
    const rr = r + dir, cc = c + dc;
    if (inside(rr, cc)) {
      const p = board[rr][cc];
      if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'p') return true;
    }
  }
  for (const [dr, dc] of DIRS.KN) {
    const rr = r + dr, cc = c + dc;
    if (!inside(rr, cc)) continue;
    const p = board[rr][cc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'n') return true;
  }
  for (const [dr, dc] of DIRS.N) {
    const rr = r + dr, cc = c + dc;
    if (!inside(rr, cc)) continue;
    const p = board[rr][cc];
    if (p !== '.' && colorOf(p) === byColor && p.toLowerCase() === 'k') return true;
  }
  const slide = (dirs, letters) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc)) {
        const p = board[rr][cc];
        if (p !== '.') {
          if (colorOf(p) === byColor && letters.includes(p.toLowerCase())) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  if (slide(DIRS.R, ['r', 'q'])) return true;
  if (slide(DIRS.B, ['b', 'q'])) return true;
  return false;
}

function inCheck(state, color) {
  const k = findKing(state.board, color);
  if (!k) return false;
  return attacked(state.board, k[0], k[1], color === 'w' ? 'b' : 'w');
}

// Pseudo-legal moves for the piece at (r,c)
function pieceMoves(state, r, c) {
  const board = state.board;
  const p = board[r][c];
  if (p === '.') return [];
  const color = colorOf(p);
  const enemy = color === 'w' ? 'b' : 'w';
  const out = [];
  const push = (rr, cc, extra) => out.push(Object.assign({ from: [r, c], to: [rr, cc] }, extra || {}));
  const type = p.toLowerCase();

  if (type === 'p') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promoRow = color === 'w' ? 0 : 7;
    const one = r + dir;
    if (inside(one, c) && board[one][c] === '.') {
      if (one === promoRow) for (const q of ['q', 'r', 'b', 'n']) push(one, c, { promo: q });
      else push(one, c);
      const two = r + dir * 2;
      if (r === startRow && board[two][c] === '.') push(two, c, { double: true });
    }
    for (const dc of [-1, 1]) {
      const rr = one, cc = c + dc;
      if (!inside(rr, cc)) continue;
      const t = board[rr][cc];
      if (t !== '.' && colorOf(t) === enemy) {
        if (rr === promoRow) for (const q of ['q', 'r', 'b', 'n']) push(rr, cc, { promo: q });
        else push(rr, cc);
      } else if (t === '.' && state.ep && state.ep[0] === rr && state.ep[1] === cc) {
        push(rr, cc, { ep: true });
      }
    }
    return out;
  }
  if (type === 'n') {
    for (const [dr, dc] of DIRS.KN) {
      const rr = r + dr, cc = c + dc;
      if (!inside(rr, cc)) continue;
      if (colorOf(board[rr][cc]) !== color) push(rr, cc);
    }
    return out;
  }
  if (type === 'k') {
    for (const [dr, dc] of DIRS.N) {
      const rr = r + dr, cc = c + dc;
      if (!inside(rr, cc)) continue;
      if (colorOf(board[rr][cc]) !== color) push(rr, cc);
    }
    // castling
    const row = color === 'w' ? 7 : 0;
    const rights = state.castling[color];
    if (r === row && c === 4 && !attacked(board, row, 4, enemy)) {
      if (rights.k && board[row][5] === '.' && board[row][6] === '.' &&
        !attacked(board, row, 5, enemy) && !attacked(board, row, 6, enemy)) push(row, 6, { castle: 'k' });
      if (rights.q && board[row][3] === '.' && board[row][2] === '.' && board[row][1] === '.' &&
        !attacked(board, row, 3, enemy) && !attacked(board, row, 2, enemy)) push(row, 2, { castle: 'q' });
    }
    return out;
  }
  const dirs = type === 'r' ? DIRS.R : type === 'b' ? DIRS.B : DIRS.N;
  for (const [dr, dc] of dirs) {
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc)) {
      const t = board[rr][cc];
      if (t === '.') push(rr, cc);
      else { if (colorOf(t) === enemy) push(rr, cc); break; }
      rr += dr; cc += dc;
    }
  }
  return out;
}

function cloneState(s) {
  return {
    board: s.board.map(r => r.slice()),
    side: s.side,
    castling: { w: { k: s.castling.w.k, q: s.castling.w.q }, b: { k: s.castling.b.k, q: s.castling.b.q } },
    ep: s.ep ? s.ep.slice() : null,
    halfmove: s.halfmove,
    fullmove: s.fullmove
  };
}

function applyRaw(s, m) {
  const board = s.board;
  const [fr, fc] = m.from, [tr, tc] = m.to;
  const p = board[fr][fc];
  const color = colorOf(p);
  const type = p.toLowerCase();
  const captured = board[tr][tc];
  board[tr][tc] = p;
  board[fr][fc] = '.';
  if (m.ep) board[fr][tc] = '.';
  if (m.promo) board[tr][tc] = color === 'w' ? m.promo.toUpperCase() : m.promo;
  if (m.castle) {
    const row = fr;
    if (m.castle === 'k') { board[row][5] = board[row][7]; board[row][7] = '.'; }
    else { board[row][3] = board[row][0]; board[row][0] = '.'; }
  }
  // castling rights
  if (type === 'k') { s.castling[color].k = false; s.castling[color].q = false; }
  if (type === 'r') {
    const row = color === 'w' ? 7 : 0;
    if (fr === row && fc === 0) s.castling[color].q = false;
    if (fr === row && fc === 7) s.castling[color].k = false;
  }
  const enemy = color === 'w' ? 'b' : 'w';
  const erow = enemy === 'w' ? 7 : 0;
  if (tr === erow && tc === 0) s.castling[enemy].q = false;
  if (tr === erow && tc === 7) s.castling[enemy].k = false;

  s.ep = m.double ? [(fr + tr) / 2, fc] : null;
  s.halfmove = (type === 'p' || captured !== '.' || m.ep) ? 0 : s.halfmove + 1;
  if (color === 'b') s.fullmove++;
  s.side = enemy;
  return { captured: m.ep ? (color === 'w' ? 'p' : 'P') : captured };
}

function legalMoves(state, color) {
  const res = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (colorOf(state.board[r][c]) !== color) continue;
    for (const m of pieceMoves(state, r, c)) {
      const nx = cloneState(state);
      applyRaw(nx, m);
      if (!inCheck(nx, color)) res.push(m);
    }
  }
  return res;
}

function positionKey(s) {
  return s.board.map(r => r.join('')).join('/') + ' ' + s.side + ' ' +
    (s.castling.w.k ? 'K' : '') + (s.castling.w.q ? 'Q' : '') +
    (s.castling.b.k ? 'k' : '') + (s.castling.b.q ? 'q' : '') + ' ' +
    (s.ep ? s.ep.join(',') : '-');
}

function insufficient(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p !== '.' && p.toLowerCase() !== 'k') pieces.push({ p: p.toLowerCase(), col: colorOf(p), sq: (r + c) % 2 });
  }
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0].p === 'b' || pieces[0].p === 'n')) return true;
  if (pieces.length === 2 && pieces.every(x => x.p === 'b') && pieces[0].sq === pieces[1].sq) return true;
  return false;
}

const SAN_LETTER = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
function sq(r, c) { return 'abcdefgh'[c] + (8 - r); }

function toSAN(state, m, legals) {
  const p = state.board[m.from[0]][m.from[1]];
  const type = p.toLowerCase();
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const capture = state.board[m.to[0]][m.to[1]] !== '.' || m.ep;
  let s = '';
  if (type === 'p') {
    s = capture ? 'abcdefgh'[m.from[1]] + 'x' + sq(m.to[0], m.to[1]) : sq(m.to[0], m.to[1]);
  } else {
    const same = legals.filter(x =>
      state.board[x.from[0]][x.from[1]] === p &&
      x.to[0] === m.to[0] && x.to[1] === m.to[1] &&
      !(x.from[0] === m.from[0] && x.from[1] === m.from[1]));
    let dis = '';
    if (same.length) {
      const sameFile = same.some(x => x.from[1] === m.from[1]);
      const sameRank = same.some(x => x.from[0] === m.from[0]);
      if (!sameFile) dis = 'abcdefgh'[m.from[1]];
      else if (!sameRank) dis = String(8 - m.from[0]);
      else dis = sq(m.from[0], m.from[1]);
    }
    s = SAN_LETTER[type] + dis + (capture ? 'x' : '') + sq(m.to[0], m.to[1]);
  }
  if (m.promo) s += '=' + m.promo.toUpperCase();
  const nx = cloneState(state);
  applyRaw(nx, m);
  const opp = colorOf(p) === 'w' ? 'b' : 'w';
  if (inCheck(nx, opp)) s += legalMoves(nx, opp).length === 0 ? '#' : '+';
  return s;
}

function sameMove(a, b) {
  return a.from[0] === b.from[0] && a.from[1] === b.from[1] &&
    a.to[0] === b.to[0] && a.to[1] === b.to[1] &&
    (a.promo || 'q') === (b.promo || 'q');
}

module.exports = {
  id: 'chess',
  name: '체스',
  nameEn: 'Chess',
  minPlayers: 2,
  maxPlayers: 2,
  realtime: false,

  create(players) {
    const state = {
      board: newBoard(),
      side: 'w',
      castling: { w: { k: true, q: true }, b: { k: true, q: true } },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      history: [],
      reps: {},
      turn: 0,
      over: false,
      winner: null,
      result: null,
      seats: players.length
    };
    state.reps[positionKey(state)] = 1;
    state.legal = legalMoves(state, 'w');
    return state;
  },

  // seat 0 = white, seat 1 = black
  view(state, seat) {
    return {
      board: state.board.map(r => r.join('')),
      side: state.side,
      turn: state.turn,
      myColor: seat === 0 ? 'w' : seat === 1 ? 'b' : null,
      check: inCheck(state, state.side),
      history: state.history,
      over: state.over,
      winner: state.winner,
      result: state.result,
      legal: (!state.over && seat === state.turn) ? state.legal.map(m => ({
        from: m.from, to: m.to, promo: m.promo || null, castle: m.castle || null, ep: !!m.ep
      })) : [],
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      lastMove: state.lastMove || null
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true;
      state.winner = seat === 0 ? 1 : 0;
      state.result = (seat === 0 ? '흑' : '백') + ' 승 (기권)';
      return { ok: true };
    }
    if (action.type === 'draw-offer') { state.drawOffer = seat; return { ok: true }; }
    if (action.type === 'draw-accept') {
      if (state.drawOffer == null || state.drawOffer === seat) return { error: '무승부 제안이 없습니다.' };
      state.over = true; state.winner = null; state.result = '무승부 (합의)';
      return { ok: true };
    }
    if (action.type === 'draw-decline') { state.drawOffer = null; return { ok: true }; }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'move') return { error: '알 수 없는 동작입니다.' };

    const cand = {
      from: action.from, to: action.to,
      promo: action.promo ? String(action.promo).toLowerCase() : undefined
    };
    if (!Array.isArray(cand.from) || !Array.isArray(cand.to)) return { error: '잘못된 이동입니다.' };
    const m = state.legal.find(x => sameMove(x, cand));
    if (!m) return { error: '규칙에 맞지 않는 수입니다.' };

    const san = toSAN(state, m, state.legal);
    applyRaw(state, m);
    state.lastMove = { from: m.from, to: m.to };
    state.history.push(san);
    state.drawOffer = null;
    state.turn = state.side === 'w' ? 0 : 1;

    const key = positionKey(state);
    state.reps[key] = (state.reps[key] || 0) + 1;
    state.legal = legalMoves(state, state.side);

    if (state.legal.length === 0) {
      state.over = true;
      if (inCheck(state, state.side)) {
        state.winner = state.side === 'w' ? 1 : 0;
        state.result = (state.side === 'w' ? '흑' : '백') + ' 승 (체크메이트)';
      } else { state.winner = null; state.result = '무승부 (스테일메이트)'; }
    } else if (state.halfmove >= 100) {
      state.over = true; state.winner = null; state.result = '무승부 (50수 규칙)';
    } else if (state.reps[key] >= 3) {
      state.over = true; state.winner = null; state.result = '무승부 (3회 동형 반복)';
    } else if (insufficient(state.board)) {
      state.over = true; state.winner = null; state.result = '무승부 (기물 부족)';
    }
    return { ok: true };
  },

  _internals: { legalMoves, inCheck, positionKey, applyRaw, cloneState }
};
