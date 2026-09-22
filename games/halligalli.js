'use strict';
// Halli Galli (할리갈리) — 2-6 players, real-time bell.
// Deck: 4 fruits x (5x"1", 3x"2", 3x"3", 2x"4", 1x"5") = 56 cards.
const FRUITS = ['banana', 'strawberry', 'lime', 'plum'];
const FRUIT_KO = { banana: '바나나', strawberry: '딸기', lime: '라임', plum: '자두' };
const COUNT_DIST = [[1, 5], [2, 3], [3, 3], [4, 2], [5, 1]];

function buildDeck() {
  const d = [];
  for (const f of FRUITS) for (const [n, k] of COUNT_DIST) for (let i = 0; i < k; i++) d.push({ fruit: f, n });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function visibleTotals(state) {
  const tot = {};
  for (const f of FRUITS) tot[f] = 0;
  state.up.forEach(pile => { if (pile.length) { const c = pile[pile.length - 1]; tot[c.fruit] += c.n; } });
  return tot;
}
function bellIsCorrect(state) {
  const tot = visibleTotals(state);
  return FRUITS.some(f => tot[f] === 5);
}
function totalCards(state, i) { return state.down[i].length + state.up[i].length; }

function advanceTurn(state) {
  let t = state.turn;
  for (let i = 0; i < state.n; i++) {
    t = (t + 1) % state.n;
    if (!state.out[t] && state.down[t].length + state.up[t].length > 0) break;
  }
  state.turn = t;
}

function refreshOut(state) {
  for (let i = 0; i < state.n; i++) {
    if (!state.out[i] && totalCards(state, i) === 0) {
      state.out[i] = true;
      state.log.push(`${state.names[i]} 탈락!`);
    }
  }
  const living = [];
  for (let i = 0; i < state.n; i++) if (!state.out[i]) living.push(i);
  if (living.length <= 1) {
    state.over = true;
    state.winner = living.length === 1 ? living[0] : null;
    state.result = living.length === 1 ? `${state.names[living[0]]} 승리!` : '무승부';
  }
  return state.over;
}

module.exports = {
  id: 'halligalli',
  name: '할리갈리',
  nameEn: 'Halli Galli',
  minPlayers: 2,
  maxPlayers: 6,
  realtime: true,

  create(players) {
    const n = players.length;
    const deck = shuffle(buildDeck());
    const down = Array.from({ length: n }, () => []);
    let i = 0;
    while (deck.length) { down[i % n].push(deck.pop()); i++; }
    return {
      n, names: players.map(p => p.name), down, up: Array.from({ length: n }, () => []),
      out: new Array(n).fill(false), turn: 0, over: false, winner: null, result: null,
      log: ['게임 시작! 순서대로 카드를 뒤집고, 같은 과일이 정확히 5개 보이면 종을 치세요.'],
      flash: null, lastBell: 0
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, mySeat: seat, turn: state.turn, out: state.out,
      up: state.up.map(p => p.length ? { top: p[p.length - 1], size: p.length } : { top: null, size: 0 }),
      downCounts: state.down.map(p => p.length),
      totals: visibleTotals(state),
      over: state.over, winner: state.winner, result: state.result,
      log: state.log.slice(-25), flash: state.flash,
      fruitNames: FRUIT_KO
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (state.out[seat]) return { error: '이미 탈락했습니다.' };

    if (action.type === 'flip') {
      if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
      if (!state.down[seat].length) {
        // recycle own face-up pile is not allowed in Halli Galli; player is out
        if (!state.up[seat].length) { state.out[seat] = true; refreshOut(state); advanceTurn(state); return { ok: true }; }
        return { error: '뒤집을 카드가 없습니다.' };
      }
      const card = state.down[seat].pop();
      state.up[seat].push(card);
      state.flash = { type: 'flip', seat, card, t: Date.now() };
      advanceTurn(state);
      refreshOut(state);
      return { ok: true };
    }

    if (action.type === 'bell') {
      const correct = bellIsCorrect(state);
      if (correct) {
        let gained = 0;
        for (let i = 0; i < state.n; i++) {
          gained += state.up[i].length;
          while (state.up[i].length) state.down[seat].unshift(state.up[i].pop());
        }
        shuffle(state.down[seat]);
        state.log.push(`🔔 ${state.names[seat]}이(가) 종을 쳤습니다 — 정답! ${gained}장 획득`);
        state.flash = { type: 'bell-good', seat, t: Date.now() };
        state.turn = seat;
        if (state.out[seat]) state.out[seat] = false;
      } else {
        state.log.push(`🔔 ${state.names[seat]}의 오답! 다른 플레이어에게 1장씩 지불`);
        state.flash = { type: 'bell-bad', seat, t: Date.now() };
        for (let i = 0; i < state.n; i++) {
          if (i === seat || state.out[i]) continue;
          let c = state.down[seat].pop();
          if (!c) c = state.up[seat].shift();
          if (c) state.up[i].push(c);
        }
      }
      refreshOut(state);
      if (!state.over && (state.out[state.turn] || totalCards(state, state.turn) === 0)) advanceTurn(state);
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { buildDeck, visibleTotals, bellIsCorrect, FRUITS }
};
