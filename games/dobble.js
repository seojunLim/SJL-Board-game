'use strict';
// Dobble / Spot It (도블) — "The Tower" mode, 2-8 players, real-time.
// 57 cards x 8 symbols built from the projective plane of order 7, so any two
// cards share exactly one symbol. Everyone has a face-up card; find the symbol
// your card shares with the centre card and claim it first to win that card,
// which becomes your new top card. Wrong claims lock you out briefly.
// Most cards when the centre deck runs out wins.
const P = 7;
const SYMBOLS = [
  '🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍍', '🥕', '🌽', '🍄', '🌵', '🌻', '🌈', '⭐', '🌙', '☀️', '⚡', '❄️', '🔥',
  '💧', '🎈', '🎁', '🎨', '🎸', '🎲', '⚽', '🏀', '🎯', '🔔', '🔑', '🔒', '💡', '📌', '✏️', '✂️', '📚', '⏰', '🧲',
  '🧩', '🚗', '🚀', '✈️', '⛵', '🚲', '🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐸', '🐵', '🐧', '🐢', '🐙', '🦋'
];
const SYMBOL_KO = ['사과', '바나나', '포도', '수박', '딸기', '체리', '파인애플', '당근', '옥수수', '버섯', '선인장', '해바라기', '무지개', '별', '달', '해', '번개', '눈꽃', '불',
  '물방울', '풍선', '선물', '팔레트', '기타', '주사위', '축구공', '농구공', '과녁', '종', '열쇠', '자물쇠', '전구', '압정', '연필', '가위', '책', '시계', '자석',
  '퍼즐', '자동차', '로켓', '비행기', '돛단배', '자전거', '강아지', '고양이', '쥐', '토끼', '여우', '곰', '판다', '개구리', '원숭이', '펭귄', '거북이', '문어', '나비'];
const LOCK_MS = 1500;

function buildCards() {
  const pt = (x, y) => x * P + y;                    // 0..48 affine points
  const inf = m => P * P + m;                        // 49..55 slopes, 56 vertical
  const cards = [];
  for (let m = 0; m < P; m++) for (let b = 0; b < P; b++) {
    const card = [];
    for (let x = 0; x < P; x++) card.push(pt(x, (m * x + b) % P));
    card.push(inf(m));
    cards.push(card);
  }
  for (let c = 0; c < P; c++) {
    const card = [];
    for (let y = 0; y < P; y++) card.push(pt(c, y));
    card.push(inf(P));
    cards.push(card);
  }
  const line = []; for (let m = 0; m <= P; m++) line.push(inf(m));
  cards.push(line);
  return cards;
}
const CARDS = buildCards();
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

module.exports = {
  id: 'dobble',
  name: '도블',
  nameEn: 'Dobble',
  minPlayers: 2,
  maxPlayers: 8,
  realtime: true,

  create(players) {
    const deck = shuffle(CARDS.map((_, i) => i));
    const tops = players.map(() => deck.pop());
    return {
      names: players.map(p => p.name), n: players.length, deck, tops,
      piles: players.map(() => 1), center: deck.pop(), lock: players.map(() => 0),
      over: false, winner: null, result: null, flash: null,
      log: ['게임 시작! 내 카드와 가운데 카드에 똑같이 있는 그림을 먼저 찾아 누르세요.']
    };
  },

  view(state, seat) {
    return {
      names: state.names, n: state.n, mySeat: seat, turn: -1,
      tops: state.tops.map(c => CARDS[c]), topIds: state.tops,
      center: state.center == null ? null : CARDS[state.center], centerId: state.center,
      piles: state.piles, deckLeft: state.deck.length,
      lockedUntil: seat >= 0 ? state.lock[seat] : 0, now: Date.now(),
      symbols: SYMBOLS, symbolNames: SYMBOL_KO,
      over: state.over, winner: state.winner, result: state.result, flash: state.flash, log: state.log.slice(-20)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type !== 'claim') return { error: '알 수 없는 동작입니다.' };
    const now = Date.now();
    if (now < state.lock[seat]) return { error: '잠깐! 틀린 뒤라 잠시 기다려야 해요.' };
    const sym = action.symbol;
    const mine = CARDS[state.tops[seat]], mid = CARDS[state.center];
    if (action.center != null && action.center !== state.center) return { error: '이미 다른 사람이 가져갔어요!' };
    if (!mine.includes(sym) || !mid.includes(sym)) {
      state.lock[seat] = now + LOCK_MS;
      state.flash = { type: 'bad', seat, symbol: sym, t: now };
      return { ok: true };
    }
    state.tops[seat] = state.center;
    state.piles[seat]++;
    state.flash = { type: 'good', seat, symbol: sym, t: now, card: state.center };
    state.log.push(`${state.names[seat]}: ${SYMBOL_KO[sym]} ${SYMBOLS[sym]}!`);
    if (state.deck.length) state.center = state.deck.pop();
    else {
      state.center = null;
      state.over = true;
      const best = Math.max(...state.piles);
      const w = state.piles.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
      state.winner = w.length === 1 ? w[0] : null;
      state.result = (w.length === 1 ? `${state.names[w[0]]} 승리! ` : '공동 1위! ') + state.piles.map((v, i) => `${state.names[i]} ${v}장`).join(' · ');
    }
    return { ok: true };
  },

  _internals: { CARDS, SYMBOLS, SYMBOL_KO }
};
