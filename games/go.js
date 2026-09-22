'use strict';
// Go (Baduk). Board sizes 9/13/19, positional superko via position history,
// suicide forbidden, Chinese-style area scoring with dead-stone marking.
const inside = (n,r,c) => r>=0 && r<n && c>=0 && c<n;
const NB = [[-1,0],[1,0],[0,-1],[0,1]];

function groupOf(board, n, r, c) {
  const color = board[r][c];
  const stones = [], libs = new Set(), seen = new Set([r*n+c]);
  const stack = [[r,c]];
  while (stack.length) {
    const [cr,cc] = stack.pop();
    stones.push([cr,cc]);
    for (const [dr,dc] of NB) {
      const rr = cr+dr, cc2 = cc+dc;
      if (!inside(n,rr,cc2)) continue;
      const v = board[rr][cc2];
      if (v === 0) libs.add(rr*n+cc2);
      else if (v === color && !seen.has(rr*n+cc2)) { seen.add(rr*n+cc2); stack.push([rr,cc2]); }
    }
  }
  return { stones, liberties: libs.size };
}

function key(board) { return board.map(r => r.join('')).join(''); }

function tryPlay(board, n, r, c, color) {
  if (board[r][c] !== 0) return { error: '이미 돌이 있습니다.' };
  const opp = color === 1 ? 2 : 1;
  const nb = board.map(row => row.slice());
  nb[r][c] = color;
  let captured = 0;
  const removed = [];
  for (const [dr,dc] of NB) {
    const rr = r+dr, cc = c+dc;
    if (!inside(n,rr,cc) || nb[rr][cc] !== opp) continue;
    const g = groupOf(nb, n, rr, cc);
    if (g.liberties === 0) for (const [sr,sc] of g.stones) { nb[sr][sc] = 0; captured++; removed.push([sr,sc]); }
  }
  if (groupOf(nb, n, r, c).liberties === 0) return { error: '자살수는 둘 수 없습니다.' };
  return { board: nb, captured, removed };
}

// Area scoring: stones on board + territory surrounded by only one color.
function score(board, n, komi, dead) {
  const b = board.map(r => r.slice());
  let capB = 0, capW = 0;
  for (const kkey of dead || []) {
    const [r,c] = kkey.split(',').map(Number);
    if (b[r] && b[r][c]) { if (b[r][c] === 1) capW++; else capB++; b[r][c] = 0; }
  }
  let black = 0, white = 0;
  const seen = Array.from({length:n}, () => new Array(n).fill(false));
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) {
    if (b[r][c] === 1) { black++; continue; }
    if (b[r][c] === 2) { white++; continue; }
    if (seen[r][c]) continue;
    const region = [], borders = new Set(), stack = [[r,c]];
    seen[r][c] = true;
    while (stack.length) {
      const [cr,cc] = stack.pop();
      region.push([cr,cc]);
      for (const [dr,dc] of NB) {
        const rr=cr+dr, cc2=cc+dc;
        if (!inside(n,rr,cc2)) continue;
        if (b[rr][cc2] === 0) { if (!seen[rr][cc2]) { seen[rr][cc2]=true; stack.push([rr,cc2]); } }
        else borders.add(b[rr][cc2]);
      }
    }
    if (borders.size === 1) { if (borders.has(1)) black += region.length; else white += region.length; }
  }
  return { black, white: white + komi, blackRaw: black, whiteRaw: white, komi };
}

module.exports = {
  id: 'go',
  name: '바둑',
  nameEn: 'Go',
  minPlayers: 2,
  maxPlayers: 2,
  realtime: false,
  options: { size: [19, 13, 9] },

  create(players, opts) {
    const n = [9,13,19].includes(Number(opts && opts.size)) ? Number(opts.size) : 19;
    const board = Array.from({length:n}, () => new Array(n).fill(0));
    return {
      n, komi: 6.5, board, turn: 0, over: false, winner: null, result: null,
      captures: [0,0], history: [], positions: { [key(board)]: true },
      passes: 0, lastMove: null, phase: 'play', dead: [], scoreAccept: [false,false], scoreInfo: null
    };
  },

  view(state, seat) {
    return {
      n: state.n, board: state.board.map(r => r.slice()), turn: state.turn,
      myColor: seat === 0 ? 1 : seat === 1 ? 2 : 0,
      captures: state.captures, komi: state.komi, history: state.history,
      over: state.over, winner: state.winner, result: state.result,
      lastMove: state.lastMove, phase: state.phase, dead: state.dead,
      scoreAccept: state.scoreAccept, scoreInfo: state.scoreInfo
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true; state.winner = 1 - seat;
      state.result = (seat === 0 ? '백' : '흑') + ' 불계승';
      return { ok: true };
    }
    if (state.phase === 'scoring') {
      if (action.type === 'toggle-dead') {
        const { r, c } = action;
        if (!inside(state.n,r,c) || state.board[r][c] === 0) return { error: '돌이 없습니다.' };
        const g = groupOf(state.board, state.n, r, c);
        const has = state.dead.includes(g.stones[0][0] + ',' + g.stones[0][1]);
        for (const [sr,sc] of g.stones) {
          const k = sr + ',' + sc;
          const i = state.dead.indexOf(k);
          if (has && i >= 0) state.dead.splice(i,1);
          else if (!has && i < 0) state.dead.push(k);
        }
        state.scoreAccept = [false,false];
        state.scoreInfo = score(state.board, state.n, state.komi, state.dead);
        return { ok: true };
      }
      if (action.type === 'accept-score') {
        state.scoreAccept[seat] = true;
        if (state.scoreAccept[0] && state.scoreAccept[1]) {
          const s = score(state.board, state.n, state.komi, state.dead);
          state.scoreInfo = s;
          state.over = true;
          state.winner = s.black > s.white ? 0 : s.white > s.black ? 1 : null;
          state.result = `흑 ${s.black} : 백 ${s.white} — ` +
            (s.black === s.white ? '무승부' : `${s.black > s.white ? '흑' : '백'} ${Math.abs(s.black - s.white).toFixed(1)}집 승`);
        }
        return { ok: true };
      }
      if (action.type === 'resume') {
        state.phase = 'play'; state.passes = 0; state.dead = [];
        state.scoreAccept = [false,false]; state.scoreInfo = null;
        return { ok: true };
      }
      return { error: '계가 중에는 할 수 없는 동작입니다.' };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const color = seat === 0 ? 1 : 2;

    if (action.type === 'pass') {
      state.passes++;
      state.history.push('pass');
      state.lastMove = null;
      state.turn = 1 - seat;
      if (state.passes >= 2) {
        state.phase = 'scoring';
        state.scoreInfo = score(state.board, state.n, state.komi, state.dead);
        state.scoreAccept = [false,false];
      }
      return { ok: true };
    }
    if (action.type !== 'place') return { error: '알 수 없는 동작입니다.' };
    const { r, c } = action;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inside(state.n,r,c)) return { error: '잘못된 좌표입니다.' };
    const res = tryPlay(state.board, state.n, r, c, color);
    if (res.error) return { error: res.error };
    const k = key(res.board);
    if (state.positions[k]) return { error: '패(ko) 규칙 위반입니다.' };

    state.board = res.board;
    state.positions[k] = true;
    state.captures[seat] += res.captured;
    state.passes = 0;
    state.lastMove = { r, c, removed: res.removed };
    state.history.push('ABCDEFGHJKLMNOPQRST'[c] + (state.n - r));
    state.turn = 1 - seat;
    return { ok: true };
  },

  _internals: { tryPlay, score, groupOf }
};
