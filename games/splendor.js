'use strict';
// Splendor: collect gem tokens, buy development cards (permanent discounts),
// attract nobles, first to the target prestige ends the round.
// Colours: w(diamond) u(sapphire) g(emerald) r(ruby) k(onyx); o = gold joker.

const GEMS = ['w', 'u', 'g', 'r', 'k'];
const GEM_KO = { w: '다이아몬드', u: '사파이어', g: '에메랄드', r: '루비', k: '오닉스', o: '황금' };

// Card templates per level, written relative to the card's own colour:
// offset 0 = own colour, 1..4 = the next colours in GEMS order.
const TEMPLATES = {
  1: [
    [0, { 1: 1, 2: 1, 3: 1, 4: 1 }],
    [0, { 1: 1, 2: 2, 3: 1, 4: 1 }],
    [0, { 1: 2, 2: 2, 4: 1 }],
    [0, { 0: 1, 3: 1, 4: 3 }],
    [0, { 3: 2, 4: 1 }],
    [0, { 1: 2, 3: 2 }],
    [0, { 3: 3 }],
    [1, { 2: 4 }]
  ],
  2: [
    [1, { 1: 3, 2: 2, 3: 2 }],
    [1, { 0: 2, 1: 3, 3: 3 }],
    [2, { 2: 1, 3: 4, 4: 2 }],
    [2, { 3: 5, 4: 3 }],
    [2, { 1: 5 }],
    [3, { 0: 6 }]
  ],
  3: [
    [3, { 1: 3, 2: 3, 3: 5, 4: 3 }],
    [4, { 4: 7 }],
    [4, { 0: 3, 3: 3, 4: 6 }],
    [5, { 0: 3, 4: 7 }]
  ]
};

const CARDS = [];
for (const level of [1, 2, 3]) {
  GEMS.forEach((color, ci) => {
    for (const [points, rel] of TEMPLATES[level]) {
      const cost = {};
      for (const [off, n] of Object.entries(rel)) cost[GEMS[(ci + Number(off)) % 5]] = n;
      CARDS.push({ id: CARDS.length, level, color, points, cost });
    }
  });
}

const NOBLES = [];
for (let i = 0; i < 5; i++) NOBLES.push({ id: NOBLES.length, points: 3, req: { [GEMS[i]]: 4, [GEMS[(i + 1) % 5]]: 4 } });
for (let i = 0; i < 5; i++) NOBLES.push({ id: NOBLES.length, points: 3, req: { [GEMS[i]]: 3, [GEMS[(i + 1) % 5]]: 3, [GEMS[(i + 2) % 5]]: 3 } });

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const sumTokens = t => Object.values(t).reduce((a, b) => a + b, 0);
const emptyTokens = () => ({ w: 0, u: 0, g: 0, r: 0, k: 0, o: 0 });

function bonuses(p) {
  const b = { w: 0, u: 0, g: 0, r: 0, k: 0 };
  for (const id of p.cards) b[CARDS[id].color]++;
  return b;
}
function points(p) {
  return p.cards.reduce((a, id) => a + CARDS[id].points, 0) + p.nobles.reduce((a, id) => a + NOBLES[id].points, 0);
}
// What the player would pay for a card: gems per colour plus gold, or null.
function payment(p, card) {
  const b = bonuses(p);
  const pay = emptyTokens();
  let gold = 0;
  for (const c of GEMS) {
    const need = Math.max(0, (card.cost[c] || 0) - b[c]);
    const use = Math.min(need, p.tokens[c]);
    pay[c] = use;
    gold += need - use;
  }
  if (gold > p.tokens.o) return null;
  pay.o = gold;
  return pay;
}

function refill(state, level, slot) {
  const deck = state.decks[level];
  state.market[level][slot] = deck.length ? deck.pop() : null;
}

function endTurn(state, seat) {
  const p = state.players[seat];
  // nobles visit automatically (one per turn)
  const b = bonuses(p);
  const ni = state.nobles.findIndex(id => Object.entries(NOBLES[id].req).every(([c, n]) => b[c] >= n));
  if (ni >= 0) {
    const id = state.nobles.splice(ni, 1)[0];
    p.nobles.push(id);
    state.log.push(`👑 귀족이 ${state.names[seat]}을(를) 방문했어요! (+3점)`);
    state.nobleFlash = { seat, id, t: Date.now() };
  }
  if (!state.finalRound && points(p) >= state.target) {
    state.finalRound = true;
    state.log.push(`${state.names[seat]} ${points(p)}점 달성! 이번 바퀴까지만 진행해요.`);
  }
  state.turn = (seat + 1) % state.n;
  if (state.finalRound && state.turn === 0) finish(state);
}

function finish(state) {
  state.over = true;
  const sc = state.players.map((p, i) => ({ i, pts: points(p), cards: p.cards.length }));
  sc.sort((a, b) => b.pts - a.pts || a.cards - b.cards);
  const top = sc.filter(s => s.pts === sc[0].pts && s.cards === sc[0].cards);
  state.winner = top.length === 1 ? top[0].i : null;
  state.result = (top.length === 1 ? `${state.names[top[0].i]} 승리! ` : '공동 1위! ') +
    state.players.map((p, i) => `${state.names[i]} ${points(p)}점`).join(' · ');
}

module.exports = {
  id: 'splendor',
  name: '스플렌더',
  nameEn: 'Splendor',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,
  options: { target: [15, 10] },

  create(players, opts) {
    const n = players.length;
    const target = [10, 15].includes(Number(opts && opts.target)) ? Number(opts.target) : 15;
    const per = n === 2 ? 4 : n === 3 ? 5 : 7;
    const bank = { w: per, u: per, g: per, r: per, k: per, o: 5 };
    const decks = {};
    const market = {};
    for (const l of [1, 2, 3]) {
      decks[l] = shuffle(CARDS.filter(c => c.level === l).map(c => c.id));
      market[l] = [decks[l].pop(), decks[l].pop(), decks[l].pop(), decks[l].pop()];
    }
    return {
      names: players.map(p => p.name), n, target, bank, decks, market,
      nobles: shuffle(NOBLES.map(x => x.id)).slice(0, n + 1),
      players: players.map(() => ({ tokens: emptyTokens(), cards: [], reserved: [], nobles: [] })),
      turn: 0, discard: false, finalRound: false,
      over: false, winner: null, result: null,
      log: [`게임 시작! 목표 ${target}점.`], last: null, nobleFlash: null
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, target: state.target, mySeat: seat,
      bank: state.bank, market: state.market, nobles: state.nobles,
      deckLeft: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
      players: state.players.map((p, i) => ({
        tokens: p.tokens, cards: p.cards, nobles: p.nobles, bonus: bonuses(p), points: points(p),
        // a card reserved blind from a deck stays secret from the others
        reserved: p.reserved.map(r => (i === seat || !r.hidden ? { id: r.id, hidden: r.hidden } : { id: null, level: CARDS[r.id].level, hidden: true }))
      })),
      turn: state.turn, discard: state.discard, finalRound: state.finalRound,
      over: state.over, winner: state.winner, result: state.result,
      log: state.log.slice(-30), last: state.last, nobleFlash: state.nobleFlash,
      cards: CARDS, nobleList: NOBLES
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      state.over = true;
      const others = state.names.map((_, i) => i).filter(i => i !== seat);
      state.winner = others.length === 1 ? others[0] : null;
      state.result = `${state.names[seat]} 포기`;
      state.log.push(state.result);
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const p = state.players[seat];

    if (state.discard) {
      if (action.type !== 'discard') return { error: '보석이 10개를 넘어요. 먼저 반납하세요.' };
      const back = action.gems || {};
      const over = sumTokens(p.tokens) - 10;
      let total = 0;
      for (const [c, k] of Object.entries(back)) {
        if (!(c in p.tokens) || !Number.isInteger(k) || k < 0 || k > p.tokens[c]) return { error: '잘못된 반납입니다.' };
        total += k;
      }
      if (total !== over) return { error: `정확히 ${over}개를 반납해야 해요.` };
      for (const [c, k] of Object.entries(back)) { p.tokens[c] -= k; state.bank[c] += k; }
      state.discard = false;
      state.log.push(`${state.names[seat]} 보석 ${total}개 반납`);
      endTurn(state, seat);
      return { ok: true };
    }

    if (action.type === 'take') {
      const gems = Array.isArray(action.gems) ? action.gems : [];
      if (!gems.every(c => GEMS.includes(c))) return { error: '황금은 직접 가져올 수 없어요.' };
      const distinct = new Set(gems).size;
      if (gems.length === 2 && distinct === 1) {
        if (state.bank[gems[0]] < 4) return { error: '같은 색 2개는 그 색이 4개 이상 남았을 때만 가능해요.' };
      } else {
        if (distinct !== gems.length || gems.length < 1 || gems.length > 3) return { error: '서로 다른 색 3개, 또는 같은 색 2개를 가져올 수 있어요.' };
        const avail = GEMS.filter(c => state.bank[c] > 0).length;
        if (gems.length < Math.min(3, avail)) return { error: '서로 다른 색을 3개 골라야 해요.' };
        if (gems.some(c => state.bank[c] < 1)) return { error: '남아 있지 않은 보석이에요.' };
      }
      for (const c of gems) { state.bank[c]--; p.tokens[c]++; }
      state.last = { seat, type: 'take', gems };
      state.log.push(`${state.names[seat]} 보석 가져오기: ${gems.map(c => GEM_KO[c]).join(', ')}`);
    } else if (action.type === 'reserve') {
      if (p.reserved.length >= 3) return { error: '카드는 3장까지만 예약할 수 있어요.' };
      let id;
      let hidden = false;
      if (action.level) {
        const l = Number(action.level);
        if (!state.decks[l] || !state.decks[l].length) return { error: '덱이 비었어요.' };
        id = state.decks[l].pop();
        hidden = true;
      } else {
        const where = findMarket(state, action.card);
        if (!where) return { error: '시장에 없는 카드예요.' };
        id = action.card;
        refill(state, where.level, where.slot);
      }
      p.reserved.push({ id, hidden });
      const gotGold = state.bank.o > 0;
      if (gotGold) { state.bank.o--; p.tokens.o++; }
      state.last = { seat, type: 'reserve', card: hidden ? null : id };
      state.log.push(`${state.names[seat]} ${CARDS[id].level}단계 카드 예약${gotGold ? ' (+황금)' : ''}`);
    } else if (action.type === 'buy') {
      const id = action.card;
      const card = CARDS[id];
      if (!card) return { error: '알 수 없는 카드예요.' };
      const where = findMarket(state, id);
      const ri = p.reserved.findIndex(r => r.id === id);
      if (!where && ri < 0) return { error: '살 수 없는 카드예요.' };
      const pay = payment(p, card);
      if (!pay) return { error: '보석이 모자라요.' };
      for (const c of Object.keys(pay)) { p.tokens[c] -= pay[c]; state.bank[c] += pay[c]; }
      if (where) refill(state, where.level, where.slot); else p.reserved.splice(ri, 1);
      p.cards.push(id);
      state.last = { seat, type: 'buy', card: id };
      state.log.push(`${state.names[seat]} ${GEM_KO[card.color]} 카드 구매${card.points ? ` (+${card.points}점)` : ''}`);
    } else {
      return { error: '알 수 없는 동작입니다.' };
    }

    if (sumTokens(p.tokens) > 10) { state.discard = true; return { ok: true }; }
    endTurn(state, seat);
    return { ok: true };
  },

  _internals: { CARDS, NOBLES, GEMS, payment, bonuses, points }
};

function findMarket(state, id) {
  for (const level of [1, 2, 3]) {
    const slot = state.market[level].indexOf(id);
    if (slot >= 0 && id != null) return { level, slot };
  }
  return null;
}
