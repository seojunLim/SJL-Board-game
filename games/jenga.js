'use strict';
// 젠가 — 2-6 players. 18 layers of 3 wooden blocks, alternating direction.
// On your turn pull one block from any layer below the top (and below the
// unfinished layer under it), then it goes on top. Whoever makes the tower
// fall loses.
//
// There is no physics engine on the server, so stability is modelled: a layer
// left with one edge block falls at once; otherwise every pull has a risk
// that grows with weak layers and height, scaled by how steady the pull was
// (the timing mini-game on the client reports 0..1).

const LAYERS = 18;

function topIndex(state) { return state.layers.length - 1; }
function removable(state, l, s) {
  const top = topIndex(state);
  const topFull = state.layers[top].every(Boolean);
  const limit = topFull ? top : top - 1;          // this layer and above are off-limits
  if (l >= limit || l < 0) return false;
  return !!(state.layers[l] && state.layers[l][s]);
}

// Risk (0..1) that pulling this block brings the tower down.
function riskOf(state, l, s) {
  const after = state.layers[l].slice(); after[s] = false;
  const cnt = after.filter(Boolean).length;
  if (cnt === 0) return 1;
  if (cnt === 1 && !after[1]) return 1;           // a lone edge block can't hold the layers above
  let r = 0.015;
  if (cnt === 1) r += 0.07;                       // balancing on the middle block
  else if (!after[0] || !after[2]) r += 0.025;    // two blocks pushed to one side
  // weak layers elsewhere in the tower
  state.layers.forEach((L, i) => {
    if (i === l || i >= topIndex(state) - 1) return;
    const c = L.filter(Boolean).length;
    if (c === 1) r += 0.03;
    else if (c === 2 && (!L[0] || !L[2])) r += 0.01;
  });
  r += Math.max(0, state.layers.length - LAYERS) * 0.006;
  r *= 1 + (state.layers.length - l) * 0.012;     // load from the blocks above
  return Math.min(0.95, r);
}

module.exports = {
  id: 'jenga',
  name: '젠가',
  nameEn: 'Jenga',
  minPlayers: 2,
  maxPlayers: 6,
  realtime: false,

  create(players) {
    return {
      n: players.length, names: players.map(p => p.name),
      layers: Array.from({ length: LAYERS }, () => [true, true, true]),
      turn: 0, pulls: 0, over: false, winner: null, loser: null, result: null,
      collapsed: false, fallSeed: 0, last: null, seq: 0,
      log: ['게임 시작! 위 두 층을 빼고 아무 블록이나 빼서 맨 위에 올리세요.']
    };
  },

  view(state, seat) {
    const risks = state.layers.map((L, l) => L.map((_, s) => (removable(state, l, s) ? Math.round(riskOf(state, l, s) * 1000) / 1000 : null)));
    return {
      n: state.n, names: state.names, layers: state.layers, turn: state.turn, mySeat: seat,
      risks, pulls: state.pulls, collapsed: state.collapsed, fallSeed: state.fallSeed,
      last: state.last, seq: state.seq,
      over: state.over, winner: state.winner, loser: state.loser, result: state.result, log: state.log.slice(-30)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true; state.loser = seat;
      state.winner = state.n === 2 ? 1 - seat : null;
      state.result = `${state.names[seat]} 포기`;
      state.log.push(state.result);
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type !== 'pull') return { error: '알 수 없는 동작입니다.' };
    const { layer: l, slot: s } = action;
    if (!Number.isInteger(l) || !Number.isInteger(s) || s < 0 || s > 2) return { error: '잘못된 블록입니다.' };
    if (!removable(state, l, s)) return { error: '맨 위 층(과 아직 덜 쌓인 층 바로 아래)은 뺄 수 없어요.' };
    const steady = Math.max(0, Math.min(1, Number(action.steady) || 0));
    const risk = riskOf(state, l, s);
    let p = risk >= 1 ? 1 : risk * (1.9 - 1.6 * steady);
    if (steady < 0.15) p += 0.12;                  // yanked it
    p = Math.min(1, Math.max(risk >= 1 ? 1 : risk * 0.3, p));

    state.seq++;
    state.layers[l][s] = false;
    if (Math.random() < p) {
      state.collapsed = true;
      state.fallSeed = Math.floor(Math.random() * 1e9);
      state.over = true; state.loser = seat;
      state.winner = state.n === 2 ? 1 - seat : null;
      state.last = { seat, from: [l, s], to: null, fell: true };
      state.result = `💥 탑이 무너졌어요! ${state.names[seat]} 패배` + (state.n === 2 ? ` · ${state.names[1 - seat]} 승리!` : '');
      state.log.push(`${state.names[seat]}: ${l + 1}층 블록을 빼다가… 와르르!`);
      return { ok: true };
    }
    // put it on top
    let top = topIndex(state);
    if (state.layers[top].every(Boolean)) { state.layers.push([false, false, false]); top++; }
    const free = [0, 2, 1].find(i => !state.layers[top][i]);
    state.layers[top][free] = true;
    state.pulls++;
    state.last = { seat, from: [l, s], to: [top, free], fell: false, steady };
    state.log.push(`${state.names[seat]}: ${l + 1}층 블록 성공 → ${top + 1}층 (${steady > 0.8 ? '완벽!' : steady > 0.5 ? '조심조심' : '아슬아슬…'})`);
    state.turn = (seat + 1) % state.n;
    return { ok: true };
  },

  _internals: { riskOf, removable, LAYERS }
};
