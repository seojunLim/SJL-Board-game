'use strict';
// 요트 다이스 — 1-4 players, 12 rounds. Roll five dice up to three times,
// keeping any you like between rolls, then write the result into one empty
// category. Ones..Sixes score their faces; 63+ in the upper section earns a
// 35 bonus. Choice = total, 4 of a Kind = total (if four match), Full House =
// total, Small Straight 15, Large Straight 30, Yacht (five alike) 50.

const CATS = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'choice', 'fourKind', 'fullHouse', 'smallStraight', 'largeStraight', 'yacht'];
const CAT_KO = {
  ones: '1', twos: '2', threes: '3', fours: '4', fives: '5', sixes: '6',
  choice: '초이스', fourKind: '포카드', fullHouse: '풀하우스', smallStraight: '스몰 스트레이트', largeStraight: '라지 스트레이트', yacht: '요트'
};

function scoreFor(cat, dice) {
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) cnt[d]++;
  const sum = dice.reduce((a, b) => a + b, 0);
  const has = (...v) => v.every(x => cnt[x] > 0);
  const i = CATS.indexOf(cat);
  if (i < 6) return cnt[i + 1] * (i + 1);
  switch (cat) {
    case 'choice': return sum;
    case 'fourKind': return cnt.some(c => c >= 4) ? sum : 0;
    case 'fullHouse': return (cnt.includes(3) && cnt.includes(2)) || cnt.includes(5) ? sum : 0;
    case 'smallStraight': return has(1, 2, 3, 4) || has(2, 3, 4, 5) || has(3, 4, 5, 6) ? 15 : 0;
    case 'largeStraight': return has(1, 2, 3, 4, 5) || has(2, 3, 4, 5, 6) ? 30 : 0;
    case 'yacht': return cnt.includes(5) ? 50 : 0;
  }
  return 0;
}
function upperOf(sheet) { return CATS.slice(0, 6).reduce((a, c) => a + (sheet[c] || 0), 0); }
function totalOf(sheet) {
  const up = upperOf(sheet);
  return CATS.reduce((a, c) => a + (sheet[c] || 0), 0) + (up >= 63 ? 35 : 0);
}

module.exports = {
  id: 'yacht',
  name: '요트 다이스',
  nameEn: 'Yacht Dice',
  minPlayers: 1,
  maxPlayers: 4,
  realtime: false,

  create(players) {
    return {
      n: players.length, names: players.map(p => p.name),
      sheets: players.map(() => ({})),
      dice: [1, 2, 3, 4, 5], held: [false, false, false, false, false], rolls: 0,
      turn: 0, round: 1, rollSeq: 0, over: false, winner: null, result: null,
      log: ['게임 시작! 주사위를 굴리세요.'], last: null
    };
  },

  view(state, seat) {
    const preview = state.rolls > 0 ? Object.fromEntries(CATS.map(c => [c, scoreFor(c, state.dice)])) : null;
    return {
      n: state.n, names: state.names, mySeat: seat, turn: state.turn, round: state.round,
      dice: state.dice, held: state.held, rolls: state.rolls, rollSeq: state.rollSeq,
      sheets: state.sheets, preview, cats: CATS, catKo: CAT_KO,
      upper: state.sheets.map(upperOf), totals: state.sheets.map(totalOf),
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-30), last: state.last
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    if (action.type === 'hold') {
      if (!state.rolls || state.rolls >= 3) return { error: '지금은 주사위를 고를 수 없어요.' };
      const i = action.index;
      if (!(i >= 0 && i < 5)) return { error: '잘못된 주사위입니다.' };
      state.held[i] = !state.held[i];
      return { ok: true };
    }
    if (action.type === 'roll') {
      if (state.rolls >= 3) return { error: '3번 다 굴렸어요. 점수를 적으세요.' };
      if (state.rolls && state.held.every(Boolean)) return { error: '굴릴 주사위가 없어요.' };
      for (let i = 0; i < 5; i++) if (!state.rolls || !state.held[i]) state.dice[i] = 1 + Math.floor(Math.random() * 6);
      if (!state.rolls) state.held.fill(false);
      state.rolls++; state.rollSeq++;
      state.last = { type: 'roll', seat, rolled: state.held.map(h => !h) };
      return { ok: true };
    }
    if (action.type === 'score') {
      const cat = action.cat;
      if (!CATS.includes(cat)) return { error: '없는 칸이에요.' };
      if (!state.rolls) return { error: '먼저 주사위를 굴리세요.' };
      const sheet = state.sheets[seat];
      if (sheet[cat] != null) return { error: '이미 적은 칸이에요.' };
      const before = upperOf(sheet);
      const pts = scoreFor(cat, state.dice);
      sheet[cat] = pts;
      state.log.push(`${state.names[seat]}: ${CAT_KO[cat]} ${pts}점 [${state.dice.join(' ')}]`);
      if (before < 63 && upperOf(sheet) >= 63) state.log.push(`🎉 ${state.names[seat]} 보너스 +35!`);
      state.last = { type: 'score', seat, cat, pts };
      state.rolls = 0; state.held = [false, false, false, false, false];
      state.turn = (seat + 1) % state.n;
      if (state.turn === 0) state.round++;
      if (state.round > 12) {
        state.over = true;
        const tot = state.sheets.map(totalOf);
        const best = Math.max(...tot);
        const w = tot.map((t, i) => (t === best ? i : -1)).filter(i => i >= 0);
        state.winner = w.length === 1 ? w[0] : null;
        state.result = (state.n === 1 ? '최종 점수 ' : w.length === 1 ? `${state.names[w[0]]} 승리! ` : '공동 1위! ') + tot.map((t, i) => `${state.names[i]} ${t}점`).join(' · ');
        if (state.n === 1) state.winner = 0;
      }
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { scoreFor, totalOf, CATS }
};
