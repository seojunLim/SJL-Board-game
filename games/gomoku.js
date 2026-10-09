'use strict';
// Gomoku (오목) on a 15x15 board. Black moves first. Exactly five in a row
// wins (six or more does not count). Black may not make a double-three
// (쌍삼): a move that creates two open threes at once, unless it also wins.
const N = 15;
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

function runLength(board, r, c, dr, dc, v) {
  let n = 1;
  for (let k = 1; inside(r + dr * k, c + dc * k) && board[r + dr * k][c + dc * k] === v; k++) n++;
  for (let k = 1; inside(r - dr * k, c - dc * k) && board[r - dr * k][c - dc * k] === v; k++) n++;
  return n;
}
function exactFive(board, r, c, v) {
  return DIRS.some(([dr, dc]) => runLength(board, r, c, dr, dc, v) === 5);
}
// Open four through (r,c) along a direction: four in a row with both ends empty.
function openFourAt(board, r, c, dr, dc, v) {
  if (runLength(board, r, c, dr, dc, v) !== 4) return false;
  let a = 1; while (inside(r - dr * a, c - dc * a) && board[r - dr * a][c - dc * a] === v) a++;
  let b = 1; while (inside(r + dr * b, c + dc * b) && board[r + dr * b][c + dc * b] === v) b++;
  const e1 = [r - dr * a, c - dc * a], e2 = [r + dr * b, c + dc * b];
  return inside(...e1) && board[e1[0]][e1[1]] === 0 && inside(...e2) && board[e2[0]][e2[1]] === 0;
}
// A "three" in this direction: one more stone on the line makes an open four
// that contains (r,c).
function threeInDir(board, r, c, dr, dc, v) {
  for (let k = -4; k <= 4; k++) {
    if (!k) continue;
    const rr = r + dr * k, cc = c + dc * k;
    if (!inside(rr, cc) || board[rr][cc] !== 0) continue;
    board[rr][cc] = v;
    const ok = openFourAt(board, r, c, dr, dc, v) && openFourAt(board, rr, cc, dr, dc, v);
    board[rr][cc] = 0;
    if (ok) return true;
  }
  return false;
}
function isDoubleThree(board, r, c, v) {
  board[r][c] = v;
  let threes = 0;
  for (const [dr, dc] of DIRS) if (threeInDir(board, r, c, dr, dc, v)) threes++;
  const five = exactFive(board, r, c, v);
  board[r][c] = 0;
  return threes >= 2 && !five;
}
const label = (r, c) => 'ABCDEFGHJKLMNOP'[c] + (N - r);

module.exports = {
  id: 'gomoku',
  name: '오목',
  nameEn: 'Gomoku',
  minPlayers: 2,
  maxPlayers: 2,
  realtime: false,

  create() {
    return {
      n: N, board: Array.from({ length: N }, () => new Array(N).fill(0)),
      turn: 0, over: false, winner: null, result: null, history: [], lastMove: null, line: null, moves: 0
    };
  },

  view(state, seat) {
    return {
      n: state.n, board: state.board.map(r => r.slice()), turn: state.turn,
      myColor: seat === 0 ? 1 : seat === 1 ? 2 : 0,
      history: state.history, lastMove: state.lastMove, line: state.line,
      over: state.over, winner: state.winner, result: state.result,
      phase: 'play', captures: [0, 0], komi: 0, dead: [], scoreAccept: [false, false], scoreInfo: null,
      gomoku: true
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true; state.winner = 1 - seat;
      state.result = (seat === 0 ? '백' : '흑') + ' 승 (기권)';
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'place') return { error: '알 수 없는 동작입니다.' };
    const { r, c } = action;
    if (!Number.isInteger(r) || !Number.isInteger(c) || !inside(r, c)) return { error: '잘못된 좌표입니다.' };
    if (state.board[r][c]) return { error: '이미 돌이 있습니다.' };
    const v = seat === 0 ? 1 : 2;
    if (v === 1 && isDoubleThree(state.board, r, c, v)) return { error: '흑은 쌍삼(3·3)을 둘 수 없습니다.' };

    state.board[r][c] = v;
    state.moves++;
    state.lastMove = { r, c };
    state.history.push(label(r, c));
    if (exactFive(state.board, r, c, v)) {
      const [dr, dc] = DIRS.find(([a, b]) => runLength(state.board, r, c, a, b, v) === 5);
      let k = 0; while (inside(r - dr * (k + 1), c - dc * (k + 1)) && state.board[r - dr * (k + 1)][c - dc * (k + 1)] === v) k++;
      state.line = Array.from({ length: 5 }, (_, i) => [r - dr * k + dr * i, c - dc * k + dc * i]);
      state.over = true; state.winner = seat;
      state.result = (v === 1 ? '흑' : '백') + ' 승 (오목!)';
    } else if (state.moves === N * N) {
      state.over = true; state.winner = null; state.result = '무승부 (판이 가득 찼습니다)';
    } else state.turn = 1 - seat;
    return { ok: true };
  },

  _internals: { isDoubleThree, exactFive, N }
};
