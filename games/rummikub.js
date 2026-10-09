'use strict';
// Rummikub (루미큐브) — 2-4 players, 106 tiles (1-13 in four colours x2 and
// two jokers), 14 tiles each. On your turn either lay tiles (rearranging the
// table freely) or draw one. Your first lay must be 30+ points from your own
// tiles without touching the table. Every set on the table must be a group
// (same number, different colours, 3-4) or a run (same colour, consecutive,
// 3+). Jokers stand in for any tile. Empty your rack to win.
const COLORS = ['r', 'b', 'y', 'k'];
const COLOR_KO = { r: '빨강', b: '파랑', y: '노랑', k: '검정' };

function buildTiles() {
  const t = [];
  for (let copy = 0; copy < 2; copy++) for (const color of COLORS) for (let n = 1; n <= 13; n++) t.push({ id: t.length, color, n });
  t.push({ id: t.length, joker: true }); t.push({ id: t.length, joker: true });
  return t;
}
const TILES = buildTiles();
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Returns { ok, ids (normalised order), points } for a set of tile ids.
function analyseSet(ids) {
  if (!Array.isArray(ids) || ids.length < 3) return { ok: false };
  const tiles = ids.map(id => TILES[id]);
  if (tiles.some(t => !t)) return { ok: false };
  const jokers = tiles.filter(t => t.joker), real = tiles.filter(t => !t.joker);
  // group
  if (ids.length <= 4 && real.length && real.every(t => t.n === real[0].n) && new Set(real.map(t => t.color)).size === real.length) {
    const order = real.slice().sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color)).map(t => t.id).concat(jokers.map(j => j.id));
    return { ok: true, kind: 'group', ids: order, points: real[0].n * ids.length };
  }
  if (!real.length) {
    // all jokers (only possible with 3+ jokers, never in a real game) — reject
    return { ok: false };
  }
  // run
  if (ids.length <= 13 && real.every(t => t.color === real[0].color)) {
    const nums = real.map(t => t.n).sort((a, b) => a - b);
    if (new Set(nums).size !== nums.length) return { ok: false };
    const span = nums[nums.length - 1] - nums[0] + 1;
    const gaps = span - nums.length;
    if (gaps > jokers.length) return { ok: false };
    let extra = jokers.length - gaps;
    let lo = nums[0], hi = nums[nums.length - 1];
    while (extra > 0 && hi < 13) { hi++; extra--; }
    while (extra > 0 && lo > 1) { lo--; extra--; }
    if (extra > 0) return { ok: false };
    const byN = {}; real.forEach(t => { byN[t.n] = t.id; });
    const jq = jokers.map(j => j.id);
    const order = []; let points = 0;
    for (let v = lo; v <= hi; v++) { order.push(byN[v] != null ? byN[v] : jq.shift()); points += v; }
    return { ok: true, kind: 'run', ids: order, points };
  }
  return { ok: false };
}

const rackValue = rack => rack.reduce((s, id) => s + (TILES[id].joker ? 30 : TILES[id].n), 0);
const sameSet = (a, b) => a.length === b.length && a.slice().sort((x, y) => x - y).every((v, i) => v === b.slice().sort((x, y) => x - y)[i]);

function finishByStalemate(state) {
  state.over = true;
  const vals = state.racks.map(rackValue);
  const best = Math.min(...vals);
  const w = vals.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
  state.winner = w.length === 1 ? w[0] : null;
  state.result = `더 이상 진행할 수 없어 종료 — 남은 타일 점수가 가장 낮은 ${w.map(i => state.names[i]).join(', ')} 승리`;
}

module.exports = {
  id: 'rummikub',
  name: '루미큐브',
  nameEn: 'Rummikub',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    const pool = shuffle(TILES.map(t => t.id));
    const racks = players.map(() => pool.splice(0, 14));
    return {
      names: players.map(p => p.name), n: players.length, pool, racks, table: [],
      melded: players.map(() => false), turn: 0, passes: 0, over: false, winner: null, result: null,
      log: ['게임 시작! 첫 등록은 내 타일만으로 30점 이상이어야 해요.'], lastPlayed: []
    };
  },

  view(state, seat) {
    return {
      names: state.names, n: state.n, turn: state.turn, mySeat: seat,
      rack: seat >= 0 ? state.racks[seat] : [], rackCounts: state.racks.map(r => r.length),
      table: state.table, poolCount: state.pool.length, melded: state.melded,
      tiles: TILES, lastPlayed: state.lastPlayed,
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-30),
      finalRacks: state.over ? state.racks : null
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const name = state.names[seat];
    const next = () => { state.turn = (state.turn + 1) % state.n; };

    if (action.type === 'draw') {
      if (state.pool.length) {
        state.racks[seat].push(state.pool.pop());
        state.passes = 0;
        state.log.push(`${name}이(가) 타일을 1장 가져갔습니다.`);
      } else {
        state.passes++;
        state.log.push(`${name} 패스 (더미가 비었습니다)`);
        if (state.passes >= state.n) { finishByStalemate(state); return { ok: true }; }
      }
      state.lastPlayed = [];
      next();
      return { ok: true };
    }

    if (action.type === 'play') {
      const newTable = action.table;
      if (!Array.isArray(newTable) || !newTable.every(Array.isArray)) return { error: '잘못된 테이블입니다.' };
      const flat = newTable.flat();
      if (new Set(flat).size !== flat.length) return { error: '같은 타일이 두 번 있습니다.' };
      const oldIds = new Set(state.table.flat());
      const rack = new Set(state.racks[seat]);
      for (const id of flat) if (!oldIds.has(id) && !rack.has(id)) return { error: '없는 타일입니다.' };
      for (const id of oldIds) if (!flat.includes(id)) return { error: '테이블의 타일을 내 랙으로 가져올 수는 없어요.' };
      const added = flat.filter(id => !oldIds.has(id));
      if (!added.length) return { error: '내 타일을 1장 이상 내려놓아야 해요. 낼 게 없으면 타일을 가져가세요.' };
      const analysed = [];
      for (const set of newTable) {
        if (!set.length) continue;
        const a = analyseSet(set);
        if (!a.ok) return { error: `올바르지 않은 세트가 있어요: ${set.map(id => TILES[id].joker ? '조커' : COLOR_KO[TILES[id].color] + TILES[id].n).join(', ')}` };
        analysed.push(a);
      }
      if (!state.melded[seat]) {
        // first lay: the old table stays untouched; new sets use only own tiles
        const untouched = state.table.every(old => newTable.some(s => sameSet(s, old)));
        const fresh = analysed.filter(a => !state.table.some(old => sameSet(old, a.ids)));
        if (!untouched || fresh.some(a => a.ids.some(id => oldIds.has(id)))) return { error: '첫 등록에서는 테이블의 타일을 움직일 수 없어요.' };
        const pts = fresh.reduce((s, a) => s + a.points, 0);
        if (pts < 30) return { error: `첫 등록은 30점 이상이어야 해요 (지금 ${pts}점).` };
        state.melded[seat] = true;
      }
      state.table = analysed.map(a => a.ids);
      state.racks[seat] = state.racks[seat].filter(id => !added.includes(id));
      state.lastPlayed = added;
      state.passes = 0;
      state.log.push(`${name}이(가) 타일 ${added.length}장을 내려놓았습니다.`);
      if (!state.racks[seat].length) {
        state.over = true; state.winner = seat; state.result = `${name} 승리! 루미큐브!`;
        return { ok: true };
      }
      next();
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { TILES, analyseSet, rackValue }
};
