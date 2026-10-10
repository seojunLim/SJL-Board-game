'use strict';
// 부루마블 (빠른 모드) — 2-4 players. Roll two dice round a 40-square world
// board, buy cities and build a villa, building and hotel on them, collect
// rent, draw golden keys, get stuck on the desert island, take the space
// shuttle anywhere. Doubles roll again (three in a row: island). Ends after
// the chosen number of rounds (richest wins) or when one player is left.
// Money is in 만원.

const SPACES = [
  { t: 'start', name: '출발' },
  { t: 'city', name: '타이베이', price: 5, g: 0 }, { t: 'key', name: '황금열쇠' }, { t: 'city', name: '베이징', price: 8, g: 0 },
  { t: 'city', name: '마닐라', price: 8, g: 0 }, { t: 'special', name: '제주도', price: 20 }, { t: 'city', name: '싱가포르', price: 10, g: 1 },
  { t: 'key', name: '황금열쇠' }, { t: 'city', name: '카이로', price: 10, g: 1 }, { t: 'city', name: '이스탄불', price: 12, g: 1 },
  { t: 'island', name: '무인도' },
  { t: 'city', name: '아테네', price: 14, g: 2 }, { t: 'key', name: '황금열쇠' }, { t: 'city', name: '코펜하겐', price: 16, g: 2 },
  { t: 'city', name: '스톡홀름', price: 16, g: 2 }, { t: 'special', name: '콩코드 여객기', price: 20 }, { t: 'city', name: '베른', price: 18, g: 3 },
  { t: 'key', name: '황금열쇠' }, { t: 'city', name: '베를린', price: 18, g: 3 }, { t: 'city', name: '오타와', price: 20, g: 3 },
  { t: 'fund', name: '사회복지기금' },
  { t: 'city', name: '부에노스아이레스', price: 22, g: 4 }, { t: 'key', name: '황금열쇠' }, { t: 'city', name: '상파울루', price: 24, g: 4 },
  { t: 'city', name: '시드니', price: 24, g: 4 }, { t: 'special', name: '부산', price: 50 }, { t: 'city', name: '하와이', price: 26, g: 5 },
  { t: 'city', name: '리스본', price: 26, g: 5 }, { t: 'special', name: '퀸엘리자베스호', price: 30 }, { t: 'city', name: '마드리드', price: 28, g: 5 },
  { t: 'space', name: '우주여행' },
  { t: 'city', name: '도쿄', price: 30, g: 6 }, { t: 'special', name: '컬럼비아호', price: 45 }, { t: 'city', name: '파리', price: 32, g: 6 },
  { t: 'city', name: '로마', price: 32, g: 6 }, { t: 'key', name: '황금열쇠' }, { t: 'city', name: '런던', price: 35, g: 7 },
  { t: 'city', name: '뉴욕', price: 35, g: 7 }, { t: 'payfund', name: '사회복지기금 납부' }, { t: 'special', name: '서울', price: 100 }
];
const N = SPACES.length;
const START_CASH = 300, SALARY = 20, FUND_FEE = 15, SHUTTLE_FEE = 20;
const BUILD = ['별장', '빌딩', '호텔'];
const buildCost = (sp, lvl) => Math.round(sp.price * [0.5, 1, 1.5][lvl]);
const ISLAND = 10, FUND = 20, SPACE = 30, SHUTTLE = 32;

function rentOf(state, i) {
  const sp = SPACES[i];
  if (sp.t === 'special') return Math.round(sp.price * 0.5);
  return Math.round(sp.price * [0.3, 1, 2.2, 3.6][state.level[i]]);
}

const KEYS = [
  { text: '복권 당첨! 20만원을 받아요.', fx: 'money', v: 20 },
  { text: '노벨 평화상 수상! 30만원을 받아요.', fx: 'money', v: 30 },
  { text: '장학금 10만원을 받아요.', fx: 'money', v: 10 },
  { text: '과속 벌금 5만원을 내요.', fx: 'money', v: -5 },
  { text: '병원비 10만원을 내요.', fx: 'money', v: -10 },
  { text: '해외 유학! 10만원을 사회복지기금에 내요.', fx: 'fund', v: 10 },
  { text: '건물 수리비: 별장 3만, 빌딩 6만, 호텔 10만씩 내요.', fx: 'repair' },
  { text: '생일 축하! 모두에게 5만원씩 받아요.', fx: 'birthday', v: 5 },
  { text: '무인도로 떠내려갔어요!', fx: 'island' },
  { text: '출발지로 가세요. 월급을 받아요.', fx: 'goto', v: 0 },
  { text: '우주여행 초대권! 우주여행 칸으로 가요.', fx: 'goto', v: SPACE },
  { text: '뒤로 세 칸 가세요.', fx: 'back', v: 3 },
  { text: '서울 관광! 서울로 가요.', fx: 'goto', v: 39 },
  { text: '우대권: 다음 통행료 한 번 면제!', fx: 'pass' },
  { text: '사회복지기금 배당! 사회복지기금 칸으로 가요.', fx: 'goto', v: FUND }
];

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function assets(state, s) {
  let v = state.players[s].cash;
  for (let i = 0; i < N; i++) if (state.owner[i] === s) {
    v += SPACES[i].price;
    for (let l = 0; l < state.level[i]; l++) v += buildCost(SPACES[i], l);
  }
  return v;
}
const ev = (state, e) => state.events.push(e);

// Take `amount` from seat s, selling buildings and land at half value if
// needed. Returns what was actually paid; marks bankruptcy.
function charge(state, s, amount, to) {
  const p = state.players[s];
  if (p.cash < amount) raise(state, s, amount);
  const paid = Math.min(amount, p.cash);
  p.cash -= paid;
  if (to >= 0) state.players[to].cash += paid;
  else if (to === -2) state.fund += paid;
  ev(state, { type: 'pay', from: s, to, amount: paid });
  if (paid < amount) bankrupt(state, s);
  return paid;
}
function raise(state, s, need) {
  const p = state.players[s];
  // sell the most expensive buildings first, then land
  const mine = [];
  for (let i = 0; i < N; i++) if (state.owner[i] === s) mine.push(i);
  mine.sort((a, b) => SPACES[b].price - SPACES[a].price);
  for (const i of mine) {
    while (p.cash < need && state.level[i] > 0) {
      state.level[i]--;
      const back = Math.floor(buildCost(SPACES[i], state.level[i]) / 2);
      p.cash += back;
      state.log.push(`${state.names[s]}: ${SPACES[i].name} ${BUILD[state.level[i]]} 매각 (+${back})`);
    }
  }
  for (const i of mine) {
    if (p.cash >= need) break;
    state.owner[i] = -1;
    const back = Math.floor(SPACES[i].price / 2);
    p.cash += back;
    state.log.push(`${state.names[s]}: ${SPACES[i].name} 매각 (+${back})`);
    ev(state, { type: 'sell', seat: s, idx: i });
  }
}
function bankrupt(state, s) {
  const p = state.players[s];
  p.out = true; p.cash = 0;
  for (let i = 0; i < N; i++) if (state.owner[i] === s) { state.owner[i] = -1; state.level[i] = 0; }
  state.log.push(`💸 ${state.names[s]} 파산!`);
  ev(state, { type: 'bankrupt', seat: s });
  const alive = state.players.map((q, i) => (q.out ? -1 : i)).filter(i => i >= 0);
  if (alive.length === 1) finish(state, alive[0]);
}
function finish(state, only) {
  state.over = true; state.phase = 'over';
  const tot = state.players.map((_, i) => (state.players[i].out ? -1 : assets(state, i)));
  let w = only;
  if (w == null) { const best = Math.max(...tot); const ws = tot.map((t, i) => (t === best ? i : -1)).filter(i => i >= 0); w = ws.length === 1 ? ws[0] : null; }
  state.winner = w;
  state.result = (w != null ? `${state.names[w]} 승리! ` : '공동 1위! ') + state.names.map((n, i) => `${n} ${tot[i] < 0 ? '파산' : tot[i] + '만'}`).join(' · ');
  state.log.push(state.result);
}

function moveTo(state, s, to, how, salary = true) {
  const p = state.players[s];
  const from = p.pos;
  if (salary && how !== 'back' && to < from && to !== ISLAND) { p.cash += SALARY; state.log.push(`${state.names[s]}: 출발지 통과! 월급 +${SALARY}`); ev(state, { type: 'salary', seat: s }); }
  else if (salary && how === 'walk' && to === 0 && from !== 0) { p.cash += SALARY; ev(state, { type: 'salary', seat: s }); }
  p.pos = to;
  ev(state, { type: 'move', seat: s, from, to, how });
}

function land(state, s) {
  const p = state.players[s];
  const i = p.pos, sp = SPACES[i];
  if (sp.t === 'city' || sp.t === 'special') {
    const own = state.owner[i];
    if (own < 0) {
      if (p.cash >= sp.price) { state.phase = 'buy'; return; }
      state.log.push(`${state.names[s]}: ${sp.name}을(를) 살 돈이 모자라요.`);
    } else if (own === s) {
      if (sp.t === 'city' && state.level[i] < 3 && p.cash >= buildCost(sp, state.level[i])) { state.phase = 'build'; return; }
    } else if (!state.players[own].out) {
      if (p.pass) { p.pass = false; state.log.push(`${state.names[s]}: 우대권으로 ${sp.name} 통행료 면제!`); ev(state, { type: 'passUsed', seat: s }); }
      else {
        const rent = rentOf(state, i);
        state.log.push(`${state.names[s]} → ${state.names[own]}: ${sp.name} 통행료 ${rent}만`);
        charge(state, s, rent, own);
      }
    }
  } else if (sp.t === 'key') {
    drawKey(state, s);
    return;
  } else if (sp.t === 'island') {
    p.island = 3; p.doubles = 0;
    state.log.push(`${state.names[s]}: 무인도에 갇혔어요! (더블이 나오거나 3턴 뒤 탈출)`);
  } else if (sp.t === 'fund') {
    if (state.fund > 0) { p.cash += state.fund; state.log.push(`${state.names[s]}: 사회복지기금 ${state.fund}만 수령!`); ev(state, { type: 'fund', seat: s, amount: state.fund }); state.fund = 0; }
  } else if (sp.t === 'payfund') {
    state.log.push(`${state.names[s]}: 사회복지기금 ${FUND_FEE}만 납부`);
    charge(state, s, FUND_FEE, -2);
  } else if (sp.t === 'space') {
    state.log.push(`${state.names[s]}: 우주여행! 다음 차례에 원하는 곳으로 날아가요.`);
    p.fly = true;
  }
}

function drawKey(state, s) {
  if (!state.keys.length) state.keys = shuffle(KEYS.map((_, i) => i));
  const k = KEYS[state.keys.pop()];
  const p = state.players[s];
  state.log.push(`🔑 ${state.names[s]}: ${k.text}`);
  ev(state, { type: 'key', seat: s, text: k.text });
  switch (k.fx) {
    case 'money': if (k.v > 0) p.cash += k.v; else charge(state, s, -k.v, -1); break;
    case 'fund': charge(state, s, k.v, -2); break;
    case 'repair': {
      let cost = 0;
      for (let i = 0; i < N; i++) if (state.owner[i] === s) cost += [0, 3, 9, 19][state.level[i]];
      if (cost) charge(state, s, cost, -1); break;
    }
    case 'birthday':
      state.players.forEach((q, i) => { if (i !== s && !q.out && !p.out) charge(state, i, k.v, s); });
      break;
    case 'island': moveTo(state, s, ISLAND, 'jump', false); land(state, s); break;
    case 'goto': moveTo(state, s, k.v, 'jump'); land(state, s); break;
    case 'back': moveTo(state, s, (p.pos - k.v + N) % N, 'back', false); land(state, s); break;
    case 'pass': p.pass = true; break;
  }
}

function endTurn(state, s, again) {
  if (state.over) return;
  const p = state.players[s];
  state.phase = 'roll';
  if (again && !p.out && !p.island) { state.log.push(`${state.names[s]}: 더블! 한 번 더`); return; }
  p.doubles = 0;
  let t = s;
  do {
    t = (t + 1) % state.n;
    if (t === 0) {
      state.round++;
      if (state.maxRounds && state.round > state.maxRounds) { finish(state, null); return; }
    }
  } while (state.players[t].out);
  state.turn = t;
}

module.exports = {
  id: 'marble',
  name: '부루마블',
  nameEn: 'Blue Marble',
  minPlayers: 2,
  maxPlayers: 4,
  realtime: false,
  options: { choices: [{ key: 'rounds', def: 12, values: [{ v: 12, label: '12바퀴 (빠른 판)' }, { v: 20, label: '20바퀴' }, { v: 0, label: '파산할 때까지 (오래 걸려요)' }] }] },

  create(players, opts) {
    const r = Number(opts && opts.rounds);
    return {
      n: players.length, names: players.map(p => p.name),
      maxRounds: [12, 20, 0].includes(r) ? r : 12, round: 1,
      players: players.map(() => ({ cash: START_CASH, pos: 0, out: false, island: 0, doubles: 0, pass: false, fly: false })),
      owner: new Array(N).fill(-1), level: new Array(N).fill(0), fund: 0,
      keys: shuffle(KEYS.map((_, i) => i)),
      turn: 0, phase: 'roll', dice: [1, 1], seq: 0, events: [],
      over: false, winner: null, result: null, log: ['게임 시작! 모두 300만원으로 출발해요.']
    };
  },

  view(state, seat) {
    return {
      n: state.n, names: state.names, mySeat: seat, turn: state.turn, phase: state.phase,
      round: state.round, maxRounds: state.maxRounds, spaces: SPACES,
      players: state.players.map((p, i) => Object.assign({}, p, { assets: assets(state, i) })),
      owner: state.owner, level: state.level, fund: state.fund, dice: state.dice, seq: state.seq, events: state.events,
      rents: SPACES.map((sp, i) => (state.owner[i] >= 0 ? rentOf(state, i) : null)),
      nextBuild: SPACES.map((sp, i) => (sp.t === 'city' && state.level[i] < 3 ? { name: BUILD[state.level[i]], cost: buildCost(sp, state.level[i]) } : null)),
      over: state.over, winner: state.winner, result: state.result, log: state.log.slice(-40)
    };
  },

  move(state, seat, action) {
    if (state.over) return { error: '이미 끝난 게임입니다.' };
    if (action.type === 'resign') {
      if (state.players[seat].out) return { error: '이미 파산했어요.' };
      state.seq++; state.events = [];
      bankrupt(state, seat);
      if (!state.over && state.turn === seat) endTurn(state, seat, false);
      return { ok: true };
    }
    if (seat !== state.turn) return { error: '당신의 차례가 아닙니다.' };
    const p = state.players[seat];
    const sp = SPACES[p.pos];
    state.events = [];

    if (action.type === 'roll') {
      if (state.phase !== 'roll') return { error: '지금은 굴릴 수 없어요.' };
      if (p.fly) return { error: '우주여행 중이에요. 갈 곳을 고르세요.' };
      state.seq++;
      const a = 1 + Math.floor(Math.random() * 6), b = 1 + Math.floor(Math.random() * 6);
      state.dice = [a, b];
      const dbl = a === b;
      ev(state, { type: 'roll', seat, dice: [a, b] });
      if (p.island) {
        if (dbl) { p.island = 0; state.again = false; state.log.push(`${state.names[seat]}: 더블! 무인도 탈출`); }
        else {
          p.island--;
          state.log.push(`${state.names[seat]}: 무인도… (${p.island ? `${p.island}턴 남음` : '다음 턴에 탈출'})`);
          endTurn(state, seat, false);
          return { ok: true };
        }
        moveTo(state, seat, (p.pos + a + b) % N, 'walk');
        land(state, seat);
        if (state.phase === 'roll') endTurn(state, seat, false);
        return { ok: true };
      }
      if (dbl) p.doubles++;
      if (p.doubles >= 3) {
        state.log.push(`${state.names[seat]}: 더블 3번! 무인도로…`);
        moveTo(state, seat, ISLAND, 'jump', false);
        p.island = 3; p.doubles = 0;
        endTurn(state, seat, false);
        return { ok: true };
      }
      moveTo(state, seat, (p.pos + a + b) % N, 'walk');
      land(state, seat);
      state.again = dbl;
      if (state.phase === 'roll') endTurn(state, seat, dbl);
      return { ok: true };
    }

    if (action.type === 'fly') {
      if (!p.fly || state.phase !== 'roll') return { error: '지금은 날아갈 수 없어요.' };
      const to = action.to;
      if (!Number.isInteger(to) || to < 0 || to >= N || to === SPACE) return { error: '다른 칸을 고르세요.' };
      state.seq++;
      p.fly = false;
      const own = state.owner[SHUTTLE];
      if (own >= 0 && own !== seat && !state.players[own].out) { state.log.push(`${state.names[seat]}: 컬럼비아호 이용료 ${SHUTTLE_FEE}만`); charge(state, seat, SHUTTLE_FEE, own); }
      if (p.out) return { ok: true };
      state.log.push(`🚀 ${state.names[seat]}: ${SPACES[to].name}(으)로 날아가요!`);
      moveTo(state, seat, to, 'fly');
      state.again = false;
      land(state, seat);
      if (state.phase === 'roll') endTurn(state, seat, false);
      return { ok: true };
    }

    if (action.type === 'buy') {
      if (state.phase !== 'buy') return { error: '지금은 살 수 없어요.' };
      state.seq++;
      p.cash -= sp.price; state.owner[p.pos] = seat;
      state.log.push(`${state.names[seat]}: ${sp.name} 구입 (-${sp.price}만)`);
      ev(state, { type: 'buy', seat, idx: p.pos });
      if (sp.t === 'city' && p.cash >= buildCost(sp, 0)) { state.phase = 'build'; return { ok: true }; }
      endTurn(state, seat, state.again);
      return { ok: true };
    }
    if (action.type === 'build') {
      if (state.phase !== 'build') return { error: '지금은 지을 수 없어요.' };
      const lvl = state.level[p.pos];
      const cost = buildCost(sp, lvl);
      if (p.cash < cost) return { error: '돈이 모자라요.' };
      state.seq++;
      p.cash -= cost; state.level[p.pos]++;
      state.log.push(`${state.names[seat]}: ${sp.name}에 ${BUILD[lvl]} 건설 (-${cost}만)`);
      ev(state, { type: 'build', seat, idx: p.pos, level: lvl + 1 });
      endTurn(state, seat, state.again);
      return { ok: true };
    }
    if (action.type === 'pass') {
      if (state.phase !== 'buy' && state.phase !== 'build') return { error: '넘길 것이 없어요.' };
      state.seq++;
      endTurn(state, seat, state.again);
      return { ok: true };
    }
    return { error: '알 수 없는 동작입니다.' };
  },

  _internals: { SPACES, rentOf, assets, KEYS, buildCost }
};
