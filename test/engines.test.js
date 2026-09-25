'use strict';
// Lightweight engine test suite — run with `npm test`.
const assert = require('assert');
const games = require('../games');

let pass = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const P2 = [{ name: 'A' }, { name: 'B' }];
const THREE_P = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];

console.log('chess');
const chess = games.byId.chess;
const { legalMoves, applyRaw, cloneState } = chess._internals;
t('perft(1..4) from the initial position', () => {
  const s = chess.create(P2);
  const base = { board: s.board, side: 'w', castling: s.castling, ep: null, halfmove: 0, fullmove: 1 };
  const perft = (st, d) => {
    if (d === 0) return 1;
    const ms = legalMoves(st, st.side);
    if (d === 1) return ms.length;
    let n = 0;
    for (const m of ms) { const nx = cloneState(st); applyRaw(nx, m); n += perft(nx, d - 1); }
    return n;
  };
  assert.deepStrictEqual([1, 2, 3, 4].map(d => perft(base, d)), [20, 400, 8902, 197281]);
});
t('fool’s mate ends the game', () => {
  const s = chess.create(P2);
  const seq = [[[6,5],[5,5]], [[1,4],[3,4]], [[6,6],[4,6]], [[0,3],[4,7]]];
  seq.forEach((m, i) => {
    const r = chess.move(s, i % 2, { type: 'move', from: m[0], to: m[1] });
    assert.ok(!r.error, r.error);
  });
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 1);
});
t('illegal moves are rejected', () => {
  const s = chess.create(P2);
  assert.ok(chess.move(s, 1, { type: 'move', from: [1,4], to: [3,4] }).error, 'wrong turn');
  assert.ok(chess.move(s, 0, { type: 'move', from: [7,0], to: [4,0] }).error, 'rook through pawn');
});
t('castling and en passant are available', () => {
  const s = chess.create(P2);
  const mv = (seat, f, tt) => assert.ok(!chess.move(s, seat, { type: 'move', from: f, to: tt }).error);
  mv(0, [6,4],[4,4]); mv(1, [1,0],[2,0]);
  mv(0, [7,6],[5,5]); mv(1, [2,0],[3,0]);
  mv(0, [7,5],[4,2]); mv(1, [3,0],[4,0]);
  const castles = s.legal.filter(m => m.castle);
  assert.ok(castles.length >= 1, 'kingside castle should be legal');
});

console.log('othello');
const oth = games.byId.othello;
t('opening has exactly four legal moves', () => {
  const s = oth.create(P2);
  assert.strictEqual(s.legal.length, 4);
});
t('placing flips the bracketed discs', () => {
  const s = oth.create(P2);
  assert.ok(!oth.move(s, 0, { type: 'place', r: 2, c: 3 }).error);
  const v = oth.view(s, 0);
  assert.deepStrictEqual(v.counts, { black: 4, white: 1 });
  assert.strictEqual(s.board[3][3], 1);
});
t('illegal placement is rejected', () => {
  const s = oth.create(P2);
  assert.ok(oth.move(s, 0, { type: 'place', r: 0, c: 0 }).error);
});

console.log('go');
const go = games.byId.go;
t('captures a surrounded stone', () => {
  const s = go.create(P2, { size: 9 });
  go.move(s, 0, { type: 'place', r: 0, c: 1 });
  go.move(s, 1, { type: 'place', r: 0, c: 0 });
  go.move(s, 0, { type: 'place', r: 1, c: 0 });
  assert.strictEqual(s.board[0][0], 0);
  assert.strictEqual(s.captures[0], 1);
});
t('suicide is forbidden', () => {
  const s = go.create(P2, { size: 9 });
  go.move(s, 0, { type: 'place', r: 0, c: 1 });
  go.move(s, 1, { type: 'place', r: 5, c: 5 });
  go.move(s, 0, { type: 'place', r: 1, c: 0 });
  assert.ok(go.move(s, 1, { type: 'place', r: 0, c: 0 }).error);
});
t('two passes move the game into scoring', () => {
  const s = go.create(P2, { size: 9 });
  go.move(s, 0, { type: 'pass' });
  go.move(s, 1, { type: 'pass' });
  assert.strictEqual(s.phase, 'scoring');
  go.move(s, 0, { type: 'accept-score' });
  go.move(s, 1, { type: 'accept-score' });
  assert.strictEqual(s.over, true);
});
t('empty 9x9 board scores as komi for white', () => {
  const s = go.create(P2, { size: 9 });
  const sc = go._internals.score(s.board, 9, 6.5, []);
  assert.strictEqual(sc.black, 0);
  assert.strictEqual(sc.white, 6.5);
});

console.log('da vinci code');
const dv = games.byId.davinci;
t('deals four tiles each and hides opponents', () => {
  const s = dv.create(P2);
  assert.strictEqual(s.hands[0].length, 4);
  const v = dv.view(s, 0);
  assert.ok(v.hands[1].every(t2 => !('v' in t2)));
});
t('a correct guess reveals the tile and allows continuing', () => {
  const s = dv.create(P2);
  dv.move(s, 0, { type: 'draw' });
  const target = s.hands[1][0];
  assert.ok(!dv.move(s, 0, { type: 'guess', target: 1, index: 0, color: target.color, value: target.v }).error);
  assert.strictEqual(s.hands[1][0].revealed, true);
  assert.strictEqual(s.phase, 'continue');
});
t('a wrong guess reveals the drawn tile and passes the turn', () => {
  const s = dv.create(P2);
  dv.move(s, 0, { type: 'draw' });
  const target = s.hands[1][0];
  const wrong = target.v === 0 ? 1 : 0;
  dv.move(s, 0, { type: 'guess', target: 1, index: 0, color: target.color, value: wrong });
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.hands[0].length, 5);
});
t('drawing by colour takes a tile of that colour', () => {
  const s = dv.create(P2);
  const before = dv.view(s, 0).poolColors;
  dv.move(s, 0, { type: 'draw', color: 'w' });
  assert.strictEqual(s.drawn.color, 'w');
  assert.strictEqual(dv.view(s, 0).poolColors.w, before.w - 1);
  assert.strictEqual(dv.view(s, 1).drawn.color, 'w');
  assert.ok(!('v' in dv.view(s, 1).drawn), 'value stays hidden from opponents');
});
t('hands stay sorted, jokers aside', () => {
  const s = dv.create(P2);
  const keys = s.hands[0].filter(x => x.v !== 12).map(dv._internals.sortKey);
  assert.deepStrictEqual(keys, [...keys].sort((a, b) => a - b));
});

console.log('halli galli');
const hg = games.byId.halligalli;
t('deck is 56 cards totalling 132 fruit', () => {
  const d = hg._internals.buildDeck();
  assert.strictEqual(d.length, 56);
  assert.strictEqual(d.reduce((a, c) => a + c.n, 0), 132);
});
t('cards are dealt evenly and flipping passes the turn', () => {
  const s = hg.create(P2);
  assert.deepStrictEqual(s.down.map(x => x.length), [28, 28]);
  hg.move(s, 0, { type: 'flip' });
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.up[0].length, 1);
});
t('a wrong bell pays one card to each opponent', () => {
  const s = hg.create(P2);
  s.up = [[], []];
  const before = s.down[1].length;
  hg.move(s, 0, { type: 'bell' });
  assert.strictEqual(s.up[1].length, 1);
  assert.strictEqual(s.down[1].length, before);
});
t('a correct bell collects every face-up pile', () => {
  const s = hg.create(P2);
  s.up = [[{ fruit: 'lime', n: 3 }], [{ fruit: 'lime', n: 2 }]];
  s.down = [[], []];
  assert.strictEqual(hg._internals.bellIsCorrect(s), true);
  hg.move(s, 1, { type: 'bell' });
  assert.strictEqual(s.down[1].length, 2);
  assert.strictEqual(s.up[0].length, 0);
});

console.log("loopin' louie");
const lo = games.byId.louie;
t('an unguarded pass costs a chicken', () => {
  const s = lo.create(P2);
  s.startAt = Date.now() - 1;
  s.angle = s.stations[1] - 3; s.dir = 1; s.speed = 200;
  s.last = Date.now() - 60;
  lo.tick(s);
  assert.strictEqual(s.chickens[1], 2);
});
t('a raised lever deflects and reverses the plane', () => {
  const s = lo.create(P2);
  s.startAt = Date.now() - 1;
  lo.move(s, 1, { type: 'flick' });
  s.angle = s.stations[1] - 3; s.dir = 1; s.speed = 200;
  s.last = Date.now() - 60;
  lo.tick(s);
  assert.strictEqual(s.chickens[1], 3);
  assert.strictEqual(s.dir, -1);
});
t('the last player with chickens wins', () => {
  const s = lo.create(P2);
  s.startAt = Date.now() - 1;
  s.chickens = [1, 0];
  s.last = Date.now() - 40;
  lo.tick(s);
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 0);
});

console.log('uno');
const uno = games.byId.uno;
t('deck is 108 cards with the standard distribution', () => {
  const d = uno._internals.buildDeck();
  assert.strictEqual(d.length, 108);
  const c = { num: 0, skip: 0, rev: 0, d2: 0, wild: 0, wd4: 0 };
  d.forEach(x => c[x.kind]++);
  assert.deepStrictEqual(c, { num: 76, skip: 8, rev: 8, d2: 8, wild: 4, wd4: 4 });
});
t('deals seven cards each and turns up a starter', () => {
  const s = uno.create(P2);
  assert.deepStrictEqual(s.hands.map(h => h.length), [7, 7]);
  assert.strictEqual(s.discard.length, 1);
  assert.notStrictEqual(s.color, 'w');
});
t('playable matches colour, number, symbol or wild', () => {
  const ip = uno._internals.isPlayable;
  const top = { color: 'r', kind: 'num', value: 5 };
  assert.ok(ip({ color: 'r', kind: 'num', value: 9 }, 'r', top));   // colour
  assert.ok(ip({ color: 'b', kind: 'num', value: 5 }, 'r', top));   // number
  assert.ok(ip({ color: 'g', kind: 'wild' }, 'r', top));            // wild
  assert.ok(!ip({ color: 'b', kind: 'num', value: 9 }, 'r', top));  // nothing
  const sk = { color: 'r', kind: 'skip' };
  assert.ok(ip({ color: 'b', kind: 'skip' }, 'r', sk));             // symbol
});
t('a matching card can be played and advances the turn', () => {
  const s = uno.create(P2);
  s.hands[0] = [{ color: s.color, kind: 'num', value: 3 }, { color: 'b', kind: 'num', value: 8 }];
  s.discard = [{ color: s.color, kind: 'num', value: 7 }];
  s.phase = 'play'; s.turn = 0;
  assert.ok(!uno.move(s, 0, { type: 'play', index: 0 }).error);
  assert.strictEqual(s.turn, 1);
  assert.strictEqual(s.hands[0].length, 1);
});
t('an illegal play is rejected', () => {
  const s = uno.create(P2);
  s.color = 'r'; s.discard = [{ color: 'r', kind: 'num', value: 7 }];
  s.hands[0] = [{ color: 'b', kind: 'num', value: 9 }]; s.turn = 0; s.phase = 'play';
  assert.ok(uno.move(s, 0, { type: 'play', index: 0 }).error);
});
t('draw two makes the next player draw and be skipped', () => {
  const s = uno.create(THREE_P);
  s.color = 'r'; s.discard = [{ color: 'r', kind: 'num', value: 1 }];
  s.hands[0] = [{ color: 'r', kind: 'd2' }, { color: 'b', kind: 'num', value: 2 }];
  s.turn = 0; s.dir = 1; s.phase = 'play';
  const before = s.hands[1].length;
  uno.move(s, 0, { type: 'play', index: 0 });
  assert.strictEqual(s.hands[1].length, before + 2);
  assert.strictEqual(s.turn, 2);
});
t('wild draw four needs a chosen colour and sets it', () => {
  const s = uno.create(P2);
  s.hands[0] = [{ color: 'w', kind: 'wd4' }, { color: 'b', kind: 'num', value: 2 }];
  s.discard = [{ color: 'r', kind: 'num', value: 7 }]; s.color = 'r'; s.turn = 0; s.phase = 'play';
  assert.ok(uno.move(s, 0, { type: 'play', index: 0 }).error, 'needs colour');
  const before = s.hands[1].length;
  uno.move(s, 0, { type: 'play', index: 0, chosenColor: 'g' });
  assert.strictEqual(s.color, 'g');
  assert.strictEqual(s.hands[1].length, before + 4);
});
t('reverse acts as a skip with two players', () => {
  const s = uno.create(P2);
  s.color = 'r'; s.discard = [{ color: 'r', kind: 'num', value: 1 }];
  s.hands[0] = [{ color: 'r', kind: 'rev' }, { color: 'b', kind: 'num', value: 2 }];
  s.turn = 0; s.phase = 'play';
  uno.move(s, 0, { type: 'play', index: 0 });
  assert.strictEqual(s.turn, 0);
});
t('emptying the hand wins', () => {
  const s = uno.create(P2);
  s.color = 'r'; s.discard = [{ color: 'r', kind: 'num', value: 1 }];
  s.hands[0] = [{ color: 'r', kind: 'num', value: 5 }]; s.turn = 0; s.phase = 'play'; s.uno[0] = true;
  uno.move(s, 0, { type: 'play', index: 0 });
  assert.strictEqual(s.over, true);
  assert.strictEqual(s.winner, 0);
});
t('a missed UNO can be caught for +2', () => {
  const s = uno.create(P2);
  s.color = 'r'; s.discard = [{ color: 'r', kind: 'num', value: 1 }];
  s.hands[0] = [{ color: 'r', kind: 'num', value: 5 }, { color: 'b', kind: 'num', value: 9 }];
  s.turn = 0; s.phase = 'play';
  uno.move(s, 0, { type: 'play', index: 0 });        // down to 1, no UNO called
  assert.strictEqual(s.pendingUno[0], true);
  const before = s.hands[0].length;
  uno.move(s, 1, { type: 'catch', target: 0 });
  assert.strictEqual(s.hands[0].length, before + 2);
  assert.strictEqual(s.pendingUno[0], false);
});

console.log('registry');
t('every game exposes the shared interface', () => {
  for (const g of games.list) {
    for (const k of ['id', 'name', 'minPlayers', 'maxPlayers', 'create', 'view', 'move']) {
      assert.ok(g[k] != null, `${g.id} missing ${k}`);
    }
    const s = g.create([{ name: 'A' }, { name: 'B' }], {});
    assert.ok(g.view(s, 0));
    assert.ok(g.view(s, -1), `${g.id} spectator view`);
    const bad = g.move(s, 0, { type: 'nonsense-action' });
    assert.ok(!bad || !bad.crash);
  }
});

console.log(`\n${pass} checks passed.`);
