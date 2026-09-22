'use strict';
// Standard 8x8 Reversi/Othello. 0 = empty, 1 = black (seat 0), 2 = white (seat 1).
const N = 8;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const inside = (r,c) => r>=0 && r<N && c>=0 && c<N;

function flipsFor(board, r, c, me) {
  if (board[r][c] !== 0) return [];
  const opp = me === 1 ? 2 : 1;
  const all = [];
  for (const [dr,dc] of DIRS) {
    const line = [];
    let rr = r+dr, cc = c+dc;
    while (inside(rr,cc) && board[rr][cc] === opp) { line.push([rr,cc]); rr+=dr; cc+=dc; }
    if (line.length && inside(rr,cc) && board[rr][cc] === me) all.push(...line);
  }
  return all;
}

function legalFor(board, me) {
  const out = [];
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) {
    const f = flipsFor(board, r, c, me);
    if (f.length) out.push({ r, c, flips: f.length });
  }
  return out;
}

function counts(board) {
  let b=0,w=0;
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) { if (board[r][c]===1) b++; else if (board[r][c]===2) w++; }
  return { black: b, white: w };
}

function finish(state) {
  const { black, white } = counts(state.board);
  state.over = true;
  state.winner = black > white ? 0 : white > black ? 1 : null;
  state.result = black === white ? `무승부 ${black}:${white}`
    : `${black > white ? '흑' : '백'} 승 ${Math.max(black,white)}:${Math.min(black,white)}`;
}

module.exports = {
  id: 'othello',
  name: '오델로',
  nameEn: 'Othello',
  minPlayers: 2,
  maxPlayers: 2,
  realtime: false,

  create() {
    const board = Array.from({length:N}, () => new Array(N).fill(0));
    board[3][3] = 2; board[4][4] = 2; board[3][4] = 1; board[4][3] = 1;
    const state = { board, turn: 0, over: false, winner: null, result: null, history: [], passed: false, lastMove: null };
    state.legal = legalFor(board, 1);
    return state;
  },

  view(state, seat) {
    return {
      board: state.board.map(r => r.slice()),
      turn: state.turn,
      myColor: seat === 0 ? 1 : seat === 1 ? 2 : 0,
      legal: (!state.over && seat === state.turn) ? state.legal : [],
      counts: counts(state.board),
      over: state.over, winner: state.winner, result: state.result,
      history: state.history, lastMove: state.lastMove,
      mustPass: !state.over && state.legal.length === 0
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true; state.winner = seat === 0 ? 1 : 0;
      state.result = (seat === 0 ? '백' : '흑') + ' 승 (기권)';
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const me = seat === 0 ? 1 : 2;
    const opp = me === 1 ? 2 : 1;

    if (action.type === 'pass') {
      if (state.legal.length > 0) return { error: '둘 곳이 있으면 패스할 수 없습니다.' };
      state.history.push('pass');
      if (state.passed) { finish(state); return { ok: true }; }
      state.passed = true;
      state.turn = 1 - seat;
      state.legal = legalFor(state.board, opp);
      if (state.legal.length === 0) finish(state);
      return { ok: true };
    }
    if (action.type !== 'place') return { error: '알 수 없는 동작입니다.' };
    const { r, c } = action;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inside(r,c)) return { error: '잘못된 좌표입니다.' };
    const flips = flipsFor(state.board, r, c, me);
    if (!flips.length) return { error: '놓을 수 없는 자리입니다.' };

    state.board[r][c] = me;
    for (const [fr,fc] of flips) state.board[fr][fc] = me;
    state.history.push('abcdefgh'[c] + (r+1));
    state.lastMove = { r, c, flips };
    state.passed = false;

    state.turn = 1 - seat;
    state.legal = legalFor(state.board, opp);
    if (state.legal.length === 0) {
      // opponent must pass; check whether current player can still move
      const mine = legalFor(state.board, me);
      if (mine.length === 0) finish(state);
    }
    return { ok: true };
  }
};
