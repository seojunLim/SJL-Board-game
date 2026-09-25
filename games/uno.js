'use strict';
// UNO — 2-6 players. Standard 108-card deck and official turn rules:
// match by colour / number / symbol or a wild; Skip, Reverse (acts as Skip
// with 2 players), Draw Two, Wild, Wild Draw Four; draw-one-then-optionally-
// play; call "UNO" at one card or be caught for a +2 penalty. First to empty
// their hand wins.
const COLORS = ['r', 'y', 'g', 'b'];
const COLOR_KO = { r: '빨강', y: '노랑', g: '초록', b: '파랑', w: '와일드' };

function buildDeck() {
  const d = [];
  for (const c of COLORS) {
    d.push({ color: c, kind: 'num', value: 0 });
    for (let v = 1; v <= 9; v++) { d.push({ color: c, kind: 'num', value: v }); d.push({ color: c, kind: 'num', value: v }); }
    for (const k of ['skip', 'rev', 'd2']) { d.push({ color: c, kind: k }); d.push({ color: c, kind: k }); }
  }
  for (let i = 0; i < 4; i++) { d.push({ color: 'w', kind: 'wild' }); d.push({ color: 'w', kind: 'wd4' }); }
  return d;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function isPlayable(card, topColor, top) {
  if (card.kind === 'wild' || card.kind === 'wd4') return true;
  if (card.color === topColor) return true;
  if (card.kind === 'num' && top.kind === 'num' && card.value === top.value) return true;
  if (card.kind !== 'num' && card.kind === top.kind) return true;
  return false;
}
const step = (state, from, k = 1) => ((from + state.dir * k) % state.n + state.n * 2) % state.n;

function draw(state, seat, count) {
  for (let i = 0; i < count; i++) {
    if (!state.deck.length) {
      if (state.discard.length <= 1) return;      // nothing to recycle
      const top = state.discard.pop();
      state.deck = shuffle(state.discard.map(c => (c.kind === 'wild' || c.kind === 'wd4') ? { color: 'w', kind: c.kind } : c));
      state.discard = [top];
    }
    state.hands[seat].push(state.deck.pop());
  }
  if (state.hands[seat].length !== 1) state.pendingUno[seat] = false;
}

function label(card) {
  if (card.kind === 'num') return COLOR_KO[card.color] + ' ' + card.value;
  const k = { skip: '스킵', rev: '리버스', d2: '드로우2', wild: '와일드', wd4: '와일드 드로우4' }[card.kind];
  return card.color === 'w' ? k : COLOR_KO[card.color] + ' ' + k;
}

function finishTurn(state) {
  const t = state.turn;
  if (state.hands[t].length === 1 && !state.uno[t]) state.pendingUno[t] = true;
  else state.pendingUno[t] = false;
}

module.exports = {
  id: 'uno',
  name: '우노',
  nameEn: 'UNO',
  minPlayers: 2,
  maxPlayers: 6,
  realtime: false,

  create(players) {
    const n = players.length;
    const deck = shuffle(buildDeck());
    const hands = [];
    for (let i = 0; i < n; i++) hands.push(deck.splice(0, 7));
    // Turn up the first non-wild-draw-four card.
    let first;
    do { first = deck.pop(); if (first.kind === 'wd4') deck.unshift(first); } while (first.kind === 'wd4');
    const state = {
      n, names: players.map(p => p.name), hands, deck, discard: [first],
      turn: 0, dir: 1, color: first.color === 'w' ? COLORS[Math.floor(Math.random() * 4)] : first.color,
      phase: 'play', drawnIndex: -1,
      uno: new Array(n).fill(false), pendingUno: new Array(n).fill(false),
      over: false, winner: null, result: null, log: [], lastPlay: null
    };
    state.log.push('게임 시작! 시작 카드: ' + label(first));
    // Apply the opening card's effect to the first player (standard rules).
    const eff = first.kind;
    if (eff === 'skip') { state.turn = step(state, 0, 1); state.log.push(COLOR_KO[first.color] + ' 스킵 — 첫 플레이어 건너뜀'); }
    else if (eff === 'rev') { state.dir = -1; state.turn = n === 2 ? 0 : n - 1; state.log.push('리버스 — 진행 방향 반대'); }
    else if (eff === 'd2') { draw(state, 0, 2); state.turn = step(state, 0, 1); state.log.push('드로우2 — 첫 플레이어가 2장 받고 건너뜀'); }
    else if (eff === 'wild') { state.log.push('첫 카드가 와일드 — 시작 색: ' + COLOR_KO[state.color]); }
    return state;
  },

  view(state, seat) {
    const top = state.discard[state.discard.length - 1];
    const mine = seat >= 0 ? state.hands[seat] : [];
    return {
      n: state.n, names: state.names, mySeat: seat, turn: state.turn, dir: state.dir,
      color: state.color, top, phase: state.phase,
      counts: state.hands.map(h => h.length),
      hand: mine.map((c, i) => ({
        color: c.color, kind: c.kind, value: c.value,
        playable: !state.over && seat === state.turn &&
          (state.phase === 'play' || (state.phase === 'decide' && i === state.drawnIndex)) &&
          isPlayable(c, state.color, top)
      })),
      canDraw: !state.over && seat === state.turn && state.phase === 'play',
      canPass: !state.over && seat === state.turn && state.phase === 'decide',
      pendingUno: state.pendingUno,
      catchable: state.pendingUno.map((p, i) => p && i !== seat),
      needUno: seat >= 0 && state.hands[seat] && state.hands[seat].length === 1 && !state.uno[seat],
      deckLeft: state.deck.length,
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-40),
      lastPlay: state.lastPlay,
      playSeq: state.playSeq || 0
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };

    if (action.type === 'uno') {
      if (state.hands[seat] && state.hands[seat].length === 1) { state.uno[seat] = true; state.pendingUno[seat] = false; state.log.push(state.names[seat] + ': UNO!'); return { ok: true }; }
      return { error: '카드가 1장일 때만 외칠 수 있습니다.' };
    }
    if (action.type === 'catch') {
      const t = action.target;
      if (!state.pendingUno[t] || t === seat) return { error: '잡을 수 없습니다.' };
      state.pendingUno[t] = false;
      draw(state, t, 2);
      state.log.push(`${state.names[seat]}이(가) ${state.names[t]}의 UNO 미선언을 잡았습니다! (+2)`);
      return { ok: true };
    }

    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const top = state.discard[state.discard.length - 1];

    if (action.type === 'draw') {
      if (state.phase !== 'play') return { error: '지금은 뽑을 수 없습니다.' };
      const before = state.hands[seat].length;
      draw(state, seat, 1);
      if (state.hands[seat].length === before) return { error: '더 뽑을 카드가 없습니다.' };
      const idx = state.hands[seat].length - 1;
      const card = state.hands[seat][idx];
      state.log.push(state.names[seat] + '이(가) 카드를 1장 뽑았습니다.');
      if (isPlayable(card, state.color, top)) { state.phase = 'decide'; state.drawnIndex = idx; return { ok: true }; }
      this._advance(state, seat);          // not playable -> pass
      return { ok: true };
    }

    if (action.type === 'pass') {
      if (state.phase !== 'decide') return { error: '지금은 넘길 수 없습니다.' };
      state.phase = 'play'; state.drawnIndex = -1;
      state.log.push(state.names[seat] + '이(가) 턴을 넘겼습니다.');
      this._advance(state, seat);
      return { ok: true };
    }

    if (action.type === 'play') {
      const i = action.index;
      const hand = state.hands[seat];
      if (!hand[i]) return { error: '없는 카드입니다.' };
      if (state.phase === 'decide' && i !== state.drawnIndex) return { error: '방금 뽑은 카드만 낼 수 있습니다.' };
      const card = hand[i];
      if (!isPlayable(card, state.color, top)) return { error: '낼 수 없는 카드입니다.' };
      if ((card.kind === 'wild' || card.kind === 'wd4')) {
        if (!COLORS.includes(action.chosenColor)) return { error: '색을 선택하세요.' };
      }
      hand.splice(i, 1);
      const played = { color: (card.kind === 'wild' || card.kind === 'wd4') ? 'w' : card.color, kind: card.kind, value: card.value };
      state.discard.push(played);
      state.lastPlay = { seat, card: played };
      state.playSeq = (state.playSeq || 0) + 1;
      state.uno[seat] = false;
      state.color = (card.kind === 'wild' || card.kind === 'wd4') ? action.chosenColor : card.color;
      state.phase = 'play'; state.drawnIndex = -1;
      state.log.push(`${state.names[seat]}: ${label(card)}${(card.kind === 'wild' || card.kind === 'wd4') ? ' → ' + COLOR_KO[state.color] : ''}`);

      if (hand.length === 0) {
        state.over = true; state.winner = seat; state.result = `${state.names[seat]} 승리!`;
        for (let k = 0; k < state.n; k++) state.pendingUno[k] = false;
        return { ok: true };
      }

      // Apply effect + advance.
      const nxt = step(state, seat, 1);
      if (card.kind === 'skip') { finishTurn(state); state.turn = step(state, seat, 2); state.log.push('→ ' + state.names[nxt] + ' 스킵'); }
      else if (card.kind === 'rev') {
        if (state.n === 2) { finishTurn(state); state.turn = seat; state.log.push('→ 2인 리버스(스킵)'); }
        else { state.dir = -state.dir; finishTurn(state); state.turn = step(state, seat, 1); state.log.push('→ 방향 반전'); }
      }
      else if (card.kind === 'd2') { draw(state, nxt, 2); finishTurn(state); state.turn = step(state, seat, 2); state.log.push('→ ' + state.names[nxt] + ' +2, 스킵'); }
      else if (card.kind === 'wd4') { draw(state, nxt, 4); finishTurn(state); state.turn = step(state, seat, 2); state.log.push('→ ' + state.names[nxt] + ' +4, 스킵'); }
      else { finishTurn(state); state.turn = nxt; }
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _advance(state, seat) { finishTurn(state); state.phase = 'play'; state.drawnIndex = -1; state.turn = step(state, seat, 1); },

  _internals: { buildDeck, isPlayable, label }
};
