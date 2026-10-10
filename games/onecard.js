'use strict';
// 원카드 (Korean One Card) — 2-6 players, 52 cards + 2 jokers, 7 each.
// Match suit or rank. Attack cards stack: 2 (+2), A (+3), ♠A (+5),
// black joker (+5), colour joker (+7); defend with an equal-or-stronger
// attack card of the same suit or rank (jokers defend anything), or a 3 of
// the current suit against a 2. 7 changes the suit, J skips, Q reverses,
// K plays again. No playable card: draw one (or take the whole attack).
// 20 cards in hand = bankrupt (out). Call "원카드!" at one card or be caught
// for +1.
const SUITS = ['s', 'h', 'd', 'c'];
const SUIT_KO = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_KO = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const BANKRUPT = 20;

function buildDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ suit: s, rank: r });
  d.push({ suit: 'j', rank: 0, joker: 'b' });
  d.push({ suit: 'j', rank: 0, joker: 'c' });
  return d;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function power(c) {
  if (c.joker === 'c') return 7;
  if (c.joker === 'b') return 5;
  if (c.rank === 1) return c.suit === 's' ? 5 : 3;
  if (c.rank === 2) return 2;
  return 0;
}
function label(c) {
  if (c.joker) return c.joker === 'c' ? '컬러 조커' : '흑백 조커';
  return SUIT_KO[c.suit] + (RANK_KO[c.rank] || c.rank);
}

function playable(state, c) {
  const top = state.discard[state.discard.length - 1];
  if (state.attack > 0) {
    if (c.joker) return true;
    // a 3 of the current suit blocks an attack made with a 2
    if (c.rank === 3 && top.rank === 2 && c.suit === state.suit) return true;
    const p = power(c);
    if (!p || p < power(top)) return false;
    return c.suit === state.suit || (!top.joker && c.rank === top.rank);
  }
  if (c.joker) return true;
  if (top.joker) return c.suit === state.suit;
  return c.suit === state.suit || c.rank === top.rank;
}

const step = (state, from, k = 1) => {
  let s = from;
  for (let i = 0; i < k; i++) {
    do { s = ((s + state.dir) % state.n + state.n) % state.n; } while (state.out[s]);
  }
  return s;
};

function draw(state, seat, count) {
  for (let i = 0; i < count; i++) {
    if (!state.deck.length) {
      if (state.discard.length <= 1) break;
      const top = state.discard.pop();
      state.deck = shuffle(state.discard);
      state.discard = [top];
    }
    state.hands[seat].push(state.deck.pop());
  }
  if (state.hands[seat].length !== 1) { state.pendingCall[seat] = false; state.called[seat] = false; }
  if (state.hands[seat].length >= BANKRUPT) {
    state.out[seat] = true;
    state.deck.unshift(...state.hands[seat]);
    state.hands[seat] = [];
    state.log.push(`💥 ${state.names[seat]} 파산! (${BANKRUPT}장 이상)`);
    const alive = state.out.map((o, i) => (o ? -1 : i)).filter(i => i >= 0);
    if (alive.length === 1) { state.over = true; state.winner = alive[0]; state.result = `${state.names[alive[0]]} 승리! (나머지 파산)`; }
  }
}

function settleCall(state, seat) {
  state.pendingCall[seat] = state.hands[seat].length === 1 && !state.called[seat];
}

module.exports = {
  id: 'onecard',
  name: '원카드',
  nameEn: 'One Card',
  minPlayers: 2,
  maxPlayers: 6,
  realtime: false,

  create(players) {
    const n = players.length;
    const deck = shuffle(buildDeck());
    const hands = [];
    for (let i = 0; i < n; i++) hands.push(deck.splice(0, 7));
    // open with a plain card (no attack, joker or special)
    let k = deck.findIndex(c => !c.joker && c.rank >= 3 && c.rank <= 10 && c.rank !== 7);
    const first = deck.splice(k, 1)[0];
    return {
      n, names: players.map(p => p.name), hands, deck, discard: [first],
      suit: first.suit, turn: 0, dir: 1, attack: 0, again: false,
      out: new Array(n).fill(false),
      called: new Array(n).fill(false), pendingCall: new Array(n).fill(false),
      over: false, winner: null, result: null,
      log: [`게임 시작! 첫 카드: ${label(first)}`], lastPlay: null, playSeq: 0
    };
  },

  view(state, seat) {
    const top = state.discard[state.discard.length - 1];
    const mine = seat >= 0 ? state.hands[seat] : [];
    const myTurn = !state.over && seat === state.turn;
    return {
      n: state.n, names: state.names, mySeat: seat, turn: state.turn, dir: state.dir,
      color: state.suit, top, attack: state.attack, again: state.again, out: state.out,
      counts: state.hands.map(h => h.length),
      hand: mine.map(c => Object.assign({}, c, { playable: myTurn && playable(state, c) })),
      canDraw: myTurn, canPass: false,
      catchable: state.pendingCall.map((p, i) => p && i !== seat),
      needUno: seat >= 0 && mine.length === 1 && !state.called[seat] && !state.over,
      deckLeft: state.deck.length,
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-40),
      lastPlay: state.lastPlay, playSeq: state.playSeq
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'uno') {
      if (state.hands[seat] && state.hands[seat].length === 1) { state.called[seat] = true; state.pendingCall[seat] = false; state.log.push(`${state.names[seat]}: 원카드!`); return { ok: true }; }
      return { error: '카드가 1장일 때만 외칠 수 있어요.' };
    }
    if (action.type === 'catch') {
      const t = action.target;
      if (!state.pendingCall[t] || t === seat) return { error: '잡을 수 없어요.' };
      state.pendingCall[t] = false;
      draw(state, t, 1);
      state.log.push(`${state.names[seat]}이(가) ${state.names[t]}의 원카드 미선언을 잡았어요! (+1)`);
      return { ok: true };
    }
    if (action.type === 'resign') {
      state.out[seat] = true;
      state.deck.unshift(...state.hands[seat]); state.hands[seat] = [];
      state.log.push(`${state.names[seat]} 포기`);
      const alive = state.out.map((o, i) => (o ? -1 : i)).filter(i => i >= 0);
      if (alive.length === 1) { state.over = true; state.winner = alive[0]; state.result = `${state.names[alive[0]]} 승리!`; }
      else if (state.turn === seat) { state.again = false; state.turn = step(state, seat); }
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };

    if (action.type === 'draw') {
      const k = state.attack || 1;
      draw(state, seat, k);
      state.log.push(state.attack ? `${state.names[seat]} 공격을 받아 ${k}장!` : `${state.names[seat]} 1장 뽑기`);
      state.attack = 0; state.again = false;
      if (!state.over && !state.out[seat]) settleCall(state, seat);
      if (!state.over) state.turn = step(state, seat);
      return { ok: true };
    }

    if (action.type === 'play') {
      const hand = state.hands[seat];
      const c = hand[action.index];
      if (!c) return { error: '없는 카드입니다.' };
      if (!playable(state, c)) return { error: state.attack ? '공격을 막을 수 있는 카드만 낼 수 있어요.' : '모양이나 숫자가 같아야 해요.' };
      if (c.rank === 7 && !state.attack && !SUITS.includes(action.chosenColor)) return { error: '바꿀 모양을 고르세요.' };
      hand.splice(action.index, 1);
      state.discard.push(c);
      state.lastPlay = { seat, card: c };
      state.playSeq++;
      state.again = false;
      let note = '';
      if (!c.joker) state.suit = c.suit;
      if (c.rank === 7 && !state.attack) { state.suit = action.chosenColor; note = ` → ${SUIT_KO[state.suit]}로 변경`; }
      const p = power(c);
      if (p) { state.attack += p; note = ` (공격 누적 +${state.attack})`; }
      else if (c.rank === 3 && state.attack) { state.attack = 0; note = ' (공격 방어!)'; }
      state.log.push(`${state.names[seat]}: ${label(c)}${note}`);

      if (!hand.length) {
        state.over = true; state.winner = seat; state.result = `${state.names[seat]} 승리!`;
        state.pendingCall.fill(false);
        return { ok: true };
      }
      settleCall(state, seat);
      if (c.rank === 11 && !p) { state.turn = step(state, seat, 2); state.log.push('→ 다음 사람 건너뜀'); }
      else if (c.rank === 12) {
        state.dir = -state.dir;
        state.turn = step(state, seat);
        state.log.push('→ 방향 반대');
      } else if (c.rank === 13) { state.again = true; state.log.push('→ 한 번 더!'); }
      else state.turn = step(state, seat);
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { buildDeck, playable, power, BANKRUPT }
};
