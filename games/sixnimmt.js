'use strict';
// 젝스님트 (6 nimmt!) — 2-10 players. Cards 1-104 carry 1-7 bull heads.
// Every round all players pick a card at once; cards are then placed from
// lowest to highest onto the row whose last card is the highest below it.
// The 6th card in a row takes the five before it. A card lower than every
// row end takes a row of the player's choice. Fewest bull heads wins.
// Options: one hand of 10 rounds, or hands until someone reaches 66.

function heads(n) {
  if (n === 55) return 7;
  if (n % 11 === 0) return 5;
  if (n % 10 === 0) return 3;
  if (n % 5 === 0) return 2;
  return 1;
}
const sumHeads = cards => cards.reduce((a, c) => a + heads(c), 0);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function deal(state) {
  const deck = shuffle(Array.from({ length: 104 }, (_, i) => i + 1));
  state.hands = state.names.map(() => deck.splice(0, 10).sort((a, b) => a - b));
  state.rows = [0, 1, 2, 3].map(() => [deck.pop()]);
  state.taken = state.names.map(() => []);
  state.chosen = state.names.map(() => null);
  state.round = 1;
  state.phase = 'choose';
  state.queue = [];
  state.picker = -1;
}

function autoChoose(state) {
  state.out.forEach((o, i) => { if (o && state.chosen[i] == null && state.hands[i].length) state.chosen[i] = state.hands[i][0]; });
}
function cheapestRow(state) {
  let best = 0;
  state.rows.forEach((r, i) => { if (sumHeads(r) < sumHeads(state.rows[best])) best = i; });
  return best;
}

// Place queued cards in order until done or someone must pick a row.
function resolve(state) {
  while (state.queue.length) {
    const { seat, card } = state.queue[0];
    let row = -1, best = -1;
    state.rows.forEach((r, i) => { const end = r[r.length - 1]; if (end < card && end > best) { best = end; row = i; } });
    if (row < 0) {
      if (state.out[seat]) { takeRow(state, seat, card, cheapestRow(state)); state.queue.shift(); continue; }
      state.phase = 'pickRow'; state.picker = seat;
      return;
    }
    const r = state.rows[row];
    let took = [];
    if (r.length >= 5) { took = r.slice(); state.taken[seat].push(...took); state.rows[row] = [card]; }
    else r.push(card);
    state.reveal.plays.push({ seat, card, row, took });
    if (took.length) state.log.push(`${state.names[seat]} ${card} → 6번째! ${took.length}장 (🐮${sumHeads(took)}) 가져감`);
    state.queue.shift();
  }
  // round finished
  state.picker = -1;
  state.round++;
  if (state.hands.every(h => h.length === 0)) endHand(state);
  else { state.phase = 'choose'; autoChoose(state); }
}
function takeRow(state, seat, card, row) {
  const took = state.rows[row].slice();
  state.taken[seat].push(...took);
  state.rows[row] = [card];
  state.reveal.plays.push({ seat, card, row, took, picked: true });
  state.log.push(`${state.names[seat]} ${card}: 가장 작아서 ${row + 1}번째 줄 (🐮${sumHeads(took)}) 가져감`);
}

function endHand(state) {
  state.taken.forEach((t, i) => { state.scores[i] += sumHeads(t); });
  state.log.push('한 판 끝! ' + state.names.map((n, i) => `${n} 🐮${state.scores[i]}`).join(' · '));
  state.hand++;
  if (!state.target || state.scores.some(s => s >= state.target)) {
    state.over = true;
    const alive = state.scores.map((s, i) => (state.out[i] ? Infinity : s));
    const best = Math.min(...alive);
    const w = alive.map((s, i) => (s === best ? i : -1)).filter(i => i >= 0);
    state.winner = w.length === 1 ? w[0] : null;
    state.result = (w.length === 1 ? `${state.names[w[0]]} 승리! ` : '공동 1위! ') + state.names.map((n, i) => `${n} 🐮${state.scores[i]}`).join(' · ');
    state.phase = 'over';
    return;
  }
  deal(state);
  autoChoose(state);
  state.log.push(`${state.hand}번째 판 시작!`);
}

module.exports = {
  id: 'sixnimmt',
  name: '젝스님트',
  nameEn: '6 nimmt!',
  minPlayers: 2,
  maxPlayers: 10,
  realtime: false,
  options: { choices: [{ key: 'target', def: 0, values: [{ v: 0, label: '한 판만 (빠른 판)' }, { v: 66, label: '66점까지 (정식)' }] }] },

  create(players, opts) {
    const state = {
      n: players.length, names: players.map(p => p.name),
      target: Number(opts && opts.target) === 66 ? 66 : 0,
      scores: players.map(() => 0), out: players.map(() => false), hand: 1, seq: 0,
      over: false, winner: null, result: null, log: [], reveal: null
    };
    deal(state);
    state.log.push(`게임 시작! ${state.target ? '누가 66마리가 될 때까지' : '한 판'}, 소를 적게 먹는 사람이 이겨요.`);
    return state;
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, mySeat: seat, target: state.target, hand: state.hand,
      round: state.round, phase: state.phase, picker: state.picker, turn: state.phase === 'pickRow' ? state.picker : -1,
      rows: state.rows, rowHeads: state.rows.map(sumHeads),
      myHand: seat >= 0 ? state.hands[seat] : [], myChoice: seat >= 0 ? state.chosen[seat] : null,
      chosen: state.chosen.map(c => c != null), counts: state.hands.map(h => h.length),
      takenHeads: state.taken.map(sumHeads), takenCount: state.taken.map(t => t.length), scores: state.scores, out: state.out,
      pending: state.phase === 'pickRow' ? state.queue[0] : null,
      reveal: state.reveal, seq: state.seq,
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-30)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat < 0) return { error: '관전 중이에요.' };
    if (action.type === 'resign') {
      state.out[seat] = true;
      state.log.push(`${state.names[seat]} 기권 (남은 카드는 자동으로 냄)`);
      if (state.out.every(Boolean)) { state.over = true; state.result = '모두 기권'; return { ok: true }; }
      if (state.phase === 'choose') { autoChoose(state); if (state.chosen.every((c, i) => c != null || !state.hands[i].length)) startReveal(state); }
      else if (state.phase === 'pickRow' && state.picker === seat) { takeRow(state, seat, state.queue[0].card, cheapestRow(state)); state.queue.shift(); state.seq++; resolve(state); }
      return { ok: true };
    }
    if (action.type === 'choose') {
      if (state.phase !== 'choose') return { error: '지금은 카드를 고를 수 없어요.' };
      if (!state.hands[seat].includes(action.card)) return { error: '손에 없는 카드예요.' };
      state.chosen[seat] = action.card;
      if (state.chosen.every(c => c != null)) startReveal(state);
      return { ok: true };
    }
    if (action.type === 'pickRow') {
      if (state.phase !== 'pickRow' || state.picker !== seat) return { error: '지금은 줄을 고를 차례가 아니에요.' };
      const row = action.row;
      if (!(row >= 0 && row < 4)) return { error: '없는 줄이에요.' };
      takeRow(state, seat, state.queue[0].card, row);
      state.queue.shift();
      state.seq++;
      resolve(state);
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { heads, sumHeads }
};

function startReveal(state) {
  const plays = state.chosen.map((card, seat) => ({ seat, card })).filter(p => p.card != null).sort((a, b) => a.card - b.card);
  plays.forEach(p => { state.hands[p.seat] = state.hands[p.seat].filter(c => c !== p.card); });
  state.chosen = state.names.map(() => null);
  state.queue = plays.slice();
  state.reveal = { id: (state.reveal ? state.reveal.id : 0) + 1, cards: plays, plays: [], rowsBefore: state.rows.map(r => r.slice()) };
  state.seq++;
  resolve(state);
}
