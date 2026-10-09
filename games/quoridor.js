'use strict';
// Quoridor (쿼리도) — 9x9, 2-4 players. Move your pawn one square or place a
// wall; first to reach the far side wins. Walls are two squares long, may not
// overlap or cross, and may never cut a player off from their goal.
// Pawns jump an adjacent pawn straight ahead, or diagonally if a wall or the
// board edge is behind it.
const N = 9;
const START = [[8, 4], [4, 0], [0, 4], [4, 8]];            // bottom, left, top, right (clockwise)
const GOAL = [p => p[0] === 0, p => p[1] === N - 1, p => p[0] === N - 1, p => p[1] === 0];
const GOAL_KO = ['위쪽 끝', '오른쪽 끝', '아래쪽 끝', '왼쪽 끝'];
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const inside = (r, c) => r >= 0 && r < N && c >= 0 && c < N;

function blocked(walls, r, c, dr, dc) {
  const has = (wr, wc, o) => walls.some(w => w.r === wr && w.c === wc && w.o === o);
  if (dr === 1) return has(r, c, 'h') || has(r, c - 1, 'h');
  if (dr === -1) return has(r - 1, c, 'h') || has(r - 1, c - 1, 'h');
  if (dc === 1) return has(r, c, 'v') || has(r - 1, c, 'v');
  if (dc === -1) return has(r, c - 1, 'v') || has(r - 1, c - 1, 'v');
  return false;
}
function occupied(state, r, c) { return state.pos.some(p => p && p[0] === r && p[1] === c); }

function pawnMoves(state, seat) {
  const [r, c] = state.pos[seat];
  const out = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr, nc = c + dc;
    if (!inside(nr, nc) || blocked(state.walls, r, c, dr, dc)) continue;
    if (!occupied(state, nr, nc)) { out.push([nr, nc]); continue; }
    const jr = nr + dr, jc = nc + dc;
    if (inside(jr, jc) && !blocked(state.walls, nr, nc, dr, dc) && !occupied(state, jr, jc)) { out.push([jr, jc]); continue; }
    for (const [pr, pc] of dr ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
      const sr = nr + pr, sc = nc + pc;
      if (inside(sr, sc) && !blocked(state.walls, nr, nc, pr, pc) && !occupied(state, sr, sc)) out.push([sr, sc]);
    }
  }
  return out;
}

function hasPath(walls, from, goal) {
  const seen = new Set([from[0] * N + from[1]]);
  const q = [from];
  while (q.length) {
    const p = q.shift();
    if (goal(p)) return true;
    for (const [dr, dc] of DIRS) {
      const nr = p[0] + dr, nc = p[1] + dc;
      if (!inside(nr, nc) || blocked(walls, p[0], p[1], dr, dc) || seen.has(nr * N + nc)) continue;
      seen.add(nr * N + nc); q.push([nr, nc]);
    }
  }
  return false;
}

function wallError(state, w) {
  if (!w || !['h', 'v'].includes(w.o) || !Number.isInteger(w.r) || !Number.isInteger(w.c) || w.r < 0 || w.c < 0 || w.r > N - 2 || w.c > N - 2) return '잘못된 벽 위치입니다.';
  for (const x of state.walls) {
    if (x.r === w.r && x.c === w.c) return '벽이 겹치거나 교차합니다.';
    if (x.o === w.o && w.o === 'h' && x.r === w.r && Math.abs(x.c - w.c) === 1) return '벽이 겹칩니다.';
    if (x.o === w.o && w.o === 'v' && x.c === w.c && Math.abs(x.r - w.r) === 1) return '벽이 겹칩니다.';
  }
  const walls = state.walls.concat([w]);
  for (let i = 0; i < state.n; i++) if (!hasPath(walls, state.pos[i], GOAL[state.side[i]])) return '상대의 길을 완전히 막을 수는 없습니다.';
  return null;
}

module.exports = {
  id: 'quoridor',
  name: '쿼리도',
  nameEn: 'Quoridor',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    const n = players.length;
    const side = n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    const per = n === 2 ? 10 : n === 3 ? 7 : 5;
    return {
      n, names: players.map(p => p.name), side,
      pos: side.map(s => START[s].slice()), wallsLeft: new Array(n).fill(per), walls: [],
      turn: 0, over: false, winner: null, result: null, history: [], last: null
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, side: state.side, pos: state.pos, walls: state.walls,
      wallsLeft: state.wallsLeft, turn: state.turn, mySeat: seat,
      moves: !state.over && seat === state.turn ? pawnMoves(state, seat) : [],
      goals: state.side.map(s => GOAL_KO[s]),
      over: state.over, winner: state.winner, result: state.result, history: state.history.slice(-60), last: state.last
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const name = state.names[seat];
    if (action.type === 'move') {
      const ok = pawnMoves(state, seat).some(([r, c]) => r === action.r && c === action.c);
      if (!ok) return { error: '그 칸으로는 갈 수 없습니다.' };
      state.pos[seat] = [action.r, action.c];
      state.last = { type: 'move', seat, to: [action.r, action.c] };
      state.history.push(`${name}: 말 → ${'abcdefghi'[action.c]}${N - action.r}`);
      if (GOAL[state.side[seat]](state.pos[seat])) {
        state.over = true; state.winner = seat; state.result = `${name} 승리!`;
        return { ok: true };
      }
    } else if (action.type === 'wall') {
      if (state.wallsLeft[seat] <= 0) return { error: '남은 벽이 없습니다.' };
      const w = { r: action.r, c: action.c, o: action.o };
      const err = wallError(state, w);
      if (err) return { error: err };
      state.walls.push(Object.assign(w, { seat }));
      state.wallsLeft[seat]--;
      state.last = { type: 'wall', seat, wall: w };
      state.history.push(`${name}: 벽 (${w.o === 'h' ? '가로' : '세로'})`);
    } else if (action.type === 'resign') {
      state.over = true;
      state.winner = state.n === 2 ? 1 - seat : null;
      state.result = state.n === 2 ? `${state.names[1 - seat]} 승리 (기권)` : `${name} 기권 — 게임 종료`;
      return { ok: true };
    } else return { error: '알 수 없는 동작입니다.' };
    state.turn = (state.turn + 1) % state.n;
    return { ok: true };
  },

  _internals: { pawnMoves, wallError, hasPath, blocked, N }
};
