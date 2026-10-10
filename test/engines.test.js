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

console.log('gomoku');
const gm = games.byId.gomoku;
t('five in a row wins, six does not', () => {
  const s = gm.create(P2);
  const seq = [[7, 3], [0, 0], [7, 4], [0, 2], [7, 5], [0, 4], [7, 6], [0, 6]];
  seq.forEach(([r, c], i) => assert.ok(!gm.move(s, i % 2, { type: 'place', r, c }).error));
  gm.move(s, 0, { type: 'place', r: 7, c: 7 });
  assert.strictEqual(s.over, true); assert.strictEqual(s.winner, 0);
  assert.strictEqual(s.line.length, 5);
  const s2 = gm.create(P2);
  // black: 7,1 7,2 7,3 _ 7,5 7,6 then fills 7,4 -> six in a row: no win
  const b = [[7, 1], [7, 2], [7, 3], [7, 5], [7, 6]], w = [[0, 0], [0, 2], [0, 4], [0, 6], [0, 8]];
  for (let i = 0; i < 5; i++) { gm.move(s2, 0, { type: 'place', r: b[i][0], c: b[i][1] }); gm.move(s2, 1, { type: 'place', r: w[i][0], c: w[i][1] }); }
  gm.move(s2, 0, { type: 'place', r: 7, c: 4 });
  assert.strictEqual(s2.over, false, 'overline is not a win');
});
t('black cannot play a double three; white can', () => {
  const s = gm.create(P2);
  s.board[7][5] = 1; s.board[7][6] = 1; s.board[5][7] = 1; s.board[6][7] = 1;
  assert.ok(gm.move(s, 0, { type: 'place', r: 7, c: 7 }).error);
  const s2 = gm.create(P2); s2.turn = 1;
  s2.board[7][5] = 2; s2.board[7][6] = 2; s2.board[5][7] = 2; s2.board[6][7] = 2;
  assert.ok(!gm.move(s2, 1, { type: 'place', r: 7, c: 7 }).error);
});

console.log('quoridor');
const qd = games.byId.quoridor;
t('pawns step, jump, and walls block', () => {
  const s = qd.create(P2);
  assert.ok(!qd.move(s, 0, { type: 'move', r: 7, c: 4 }).error);
  assert.ok(qd.move(s, 1, { type: 'move', r: 3, c: 3 }).error, 'no diagonal step');
  assert.ok(!qd.move(s, 1, { type: 'wall', r: 6, c: 3, o: 'h' }).error);
  assert.deepStrictEqual(qd.view(s, 0).moves.map(m => m.join()).sort(), ['7,3', '7,5', '8,4'].sort());
});
t('straight jump over an adjacent pawn', () => {
  const s = qd.create(P2);
  s.pos = [[5, 4], [4, 4]];
  const m = qd.view(s, 0).moves.map(x => x.join());
  assert.ok(m.includes('3,4'));
});
t('a wall may not cut a player off', () => {
  const s = qd.create(P2);
  s.walls = [{ r: 7, c: 0, o: 'h' }, { r: 7, c: 2, o: 'h' }, { r: 7, c: 4, o: 'h' }, { r: 7, c: 6, o: 'h' }];
  const e = qd.move(s, 0, { type: 'wall', r: 6, c: 7, o: 'v' });
  assert.ok(!e.error, 'legal while a gap remains');
  const s2 = qd.create(P2);
  s2.walls = [{ r: 7, c: 0, o: 'h' }, { r: 7, c: 2, o: 'h' }, { r: 7, c: 4, o: 'h' }, { r: 7, c: 6, o: 'h' }];
  const err = qd.move(s2, 0, { type: 'wall', r: 7, c: 7, o: 'v' }).error;
  assert.ok(err && err.includes('길'), 'sealing the last gap is refused: ' + err);
});
t('overlapping walls are refused and reaching the far row wins', () => {
  const s = qd.create(P2);
  qd.move(s, 0, { type: 'wall', r: 3, c: 3, o: 'h' });
  assert.ok(qd.move(s, 1, { type: 'wall', r: 3, c: 3, o: 'v' }).error);
  assert.ok(qd.move(s, 1, { type: 'wall', r: 3, c: 4, o: 'h' }).error);
  s.pos = [[1, 0], [8, 8]]; s.turn = 0;
  qd.move(s, 0, { type: 'move', r: 0, c: 0 });
  assert.strictEqual(s.over, true); assert.strictEqual(s.winner, 0);
});

console.log('blokus');
const bk = games.byId.blokus;
t('21 pieces, 89 squares, correct orientation counts', () => {
  const { PIECES, ORIENTS } = bk._internals;
  assert.strictEqual(Object.keys(PIECES).length, 21);
  assert.strictEqual(Object.values(PIECES).reduce((a, p) => a + p.length, 0), 89);
  assert.strictEqual(ORIENTS.I1.length, 1); assert.strictEqual(ORIENTS.X5.length, 1);
  assert.strictEqual(ORIENTS.F5.length, 8); assert.strictEqual(ORIENTS.I5.length, 2);
  assert.strictEqual(Object.values(ORIENTS).reduce((a, o) => a + o.length, 0), 91);
});
t('first piece must cover the corner; then corner-only contact', () => {
  const s = bk.create(P2);
  assert.ok(bk.move(s, 0, { type: 'place', piece: 'I1', orient: 0, r: 5, c: 5 }).error);
  assert.ok(!bk.move(s, 0, { type: 'place', piece: 'O4', orient: 0, r: 0, c: 0 }).error);
  // yellow (seat 1), red (seat 0), green (seat 1) take their corners
  assert.ok(!bk.move(s, 1, { type: 'place', piece: 'I1', orient: 0, r: 0, c: 19 }).error);
  assert.ok(!bk.move(s, 0, { type: 'place', piece: 'I1', orient: 0, r: 19, c: 19 }).error);
  assert.ok(!bk.move(s, 1, { type: 'place', piece: 'I1', orient: 0, r: 19, c: 0 }).error);
  assert.ok(bk.move(s, 0, { type: 'place', piece: 'I2', orient: 0, r: 0, c: 2 }).error, 'edge contact refused');
  assert.ok(!bk.move(s, 0, { type: 'place', piece: 'I2', orient: 0, r: 2, c: 2 }).error, 'corner contact ok');
});
t('scoring: leftover squares, +15 all placed, +5 monomino last', () => {
  const { scoreOf } = bk._internals;
  assert.strictEqual(scoreOf({ left: ['I1', 'I5'] }), -6);
  assert.strictEqual(scoreOf({ left: [], lastPiece: 'I1' }), 20);
  assert.strictEqual(scoreOf({ left: [], lastPiece: 'F5' }), 15);
});

console.log('rummikub');
const rk = games.byId.rummikub;
const T = rk._internals.TILES;
const tid = (color, n, copy = 0) => T.find(x => x.color === color && x.n === n && x.id >= copy * 52 && x.id < (copy + 1) * 52).id;
const JOKER = 104;
t('106 tiles; 14 each', () => {
  assert.strictEqual(T.length, 106);
  const s = rk.create(P2);
  assert.deepStrictEqual(s.racks.map(r => r.length), [14, 14]);
});
t('set validation: groups, runs, jokers', () => {
  const a = rk._internals.analyseSet;
  assert.ok(a([tid('r', 7), tid('b', 7), tid('k', 7)]).ok);
  assert.ok(!a([tid('r', 7), tid('r', 7, 1), tid('k', 7)]).ok, 'duplicate colour in group');
  assert.ok(a([tid('y', 3), tid('y', 4), tid('y', 5), tid('y', 6)]).ok);
  assert.ok(!a([tid('y', 3), tid('y', 5), tid('y', 6)]).ok, 'gap');
  const j = a([tid('y', 3), JOKER, tid('y', 5)]);
  assert.ok(j.ok); assert.strictEqual(j.points, 12);
  assert.ok(!a([tid('b', 12), tid('b', 13), tid('b', 1)]).ok, 'no wrap-around');
});
t('first lay needs 30 points; drawing passes the turn', () => {
  const s = rk.create(P2);
  s.racks[0] = [tid('r', 10), tid('b', 10), tid('k', 10), tid('r', 1), tid('r', 2), tid('r', 3)];
  assert.ok(rk.move(s, 0, { type: 'play', table: [[tid('r', 1), tid('r', 2), tid('r', 3)]] }).error, '6 points is too few');
  assert.ok(!rk.move(s, 0, { type: 'play', table: [[tid('r', 10), tid('b', 10), tid('k', 10)]] }).error);
  assert.strictEqual(s.melded[0], true);
  assert.strictEqual(s.turn, 1);
  const before = s.racks[1].length;
  rk.move(s, 1, { type: 'draw' });
  assert.strictEqual(s.racks[1].length, before + 1);
});
t('after melding you may rearrange the table; table tiles cannot go home', () => {
  const s = rk.create(P2);
  s.melded[0] = true;
  s.table = [[tid('y', 4), tid('y', 5), tid('y', 6), tid('y', 7)]];
  s.racks[0] = [tid('b', 7), tid('k', 7), tid('r', 1)];
  assert.ok(rk.move(s, 0, { type: 'play', table: [[tid('y', 4), tid('y', 5), tid('y', 6)]] }).error, 'took a table tile');
  assert.ok(!rk.move(s, 0, { type: 'play', table: [[tid('y', 4), tid('y', 5), tid('y', 6)], [tid('y', 7), tid('b', 7), tid('k', 7)]] }).error);
  assert.strictEqual(s.racks[0].length, 1);
});
t('emptying the rack wins', () => {
  const s = rk.create(P2);
  s.melded[0] = true;
  s.racks[0] = [tid('y', 1), tid('y', 2), tid('y', 3)];
  rk.move(s, 0, { type: 'play', table: [[tid('y', 1), tid('y', 2), tid('y', 3)]] });
  assert.strictEqual(s.over, true); assert.strictEqual(s.winner, 0);
});

console.log('dobble');
const db = games.byId.dobble;
t('57 cards of 8 symbols; every pair shares exactly one', () => {
  const { CARDS, SYMBOLS } = db._internals;
  assert.strictEqual(CARDS.length, 57);
  assert.strictEqual(new Set(SYMBOLS).size, 57);
  for (const c of CARDS) assert.strictEqual(new Set(c).size, 8);
  for (let i = 0; i < 57; i++) for (let j = i + 1; j < 57; j++) {
    assert.strictEqual(CARDS[i].filter(x => CARDS[j].includes(x)).length, 1);
  }
});
t('right claim takes the centre card; wrong claim locks out', () => {
  const { CARDS } = db._internals;
  const s = db.create(P2);
  const mine = CARDS[s.tops[0]], mid = CARDS[s.center];
  const common = mine.find(x => mid.includes(x));
  const wrong = mine.find(x => !mid.includes(x));
  db.move(s, 1, { type: 'claim', symbol: CARDS[s.tops[1]].find(x => !mid.includes(x)) });
  assert.ok(db.move(s, 1, { type: 'claim', symbol: 0 }).error, 'locked out');
  const center = s.center;
  db.move(s, 0, { type: 'claim', symbol: common });
  assert.strictEqual(s.piles[0], 2);
  assert.strictEqual(s.tops[0], center);
  void wrong;
});

console.log('splendor');
const spl = games.byId.splendor;
t('deck has 90 cards, 10 nobles, bank sized by players', () => {
  assert.strictEqual(spl._internals.CARDS.length, 90);
  assert.strictEqual(spl._internals.NOBLES.length, 10);
  const s = spl.create(P2, {});
  assert.strictEqual(s.bank.w, 4); assert.strictEqual(s.bank.o, 5); assert.strictEqual(s.nobles.length, 3); assert.strictEqual(s.target, 15);
  assert.strictEqual(spl.create(THREE_P, { target: 10 }).target, 10);
});
t('take rules: 3 different, 2 same only from a pile of 4, no gold', () => {
  const s = spl.create(P2, {});
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['w', 'w', 'u'] }).error);
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['o'] }).error);
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['w', 'u'] }).error);
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['w', 'w'] }).ok);
  assert.ok(spl.move(s, 1, { type: 'take', gems: ['w', 'w'] }).error, 'only 2 white left');
  assert.ok(spl.move(s, 1, { type: 'take', gems: ['u', 'g', 'r'] }).ok);
  assert.strictEqual(s.turn, 0);
});
t('reserve gives gold, buy uses bonuses and gold, refill market', () => {
  const s = spl.create(P2, {});
  const id = s.market[1][0];
  assert.ok(spl.move(s, 0, { type: 'reserve', card: id }).ok);
  assert.strictEqual(s.players[0].tokens.o, 1);
  assert.notStrictEqual(s.market[1][0], id);
  const p = s.players[0];
  const cost = spl._internals.CARDS[id].cost;
  const total = Object.values(cost).reduce((a, b) => a + b, 0);
  // give exactly cost minus one, the gold covers the rest
  let skipped = false;
  for (const [c, n] of Object.entries(cost)) { p.tokens[c] = n - (skipped ? 0 : 1); skipped = true; }
  s.turn = 0;
  assert.ok(spl.move(s, 0, { type: 'buy', card: id }).ok, 'buy reserved');
  assert.strictEqual(p.tokens.o, 0);
  assert.strictEqual(p.cards.length, 1);
  assert.ok(total > 0);
});
t('more than 10 tokens forces a discard before the turn passes', () => {
  const s = spl.create(P2, {});
  s.players[0].tokens = { w: 3, u: 3, g: 2, r: 0, k: 0, o: 0 };
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['r', 'k', 'w'] }).ok);
  assert.ok(s.discard); assert.strictEqual(s.turn, 0);
  assert.ok(spl.move(s, 0, { type: 'take', gems: ['u'] }).error);
  assert.ok(spl.move(s, 0, { type: 'discard', gems: { w: 1 } }).ok);
  assert.strictEqual(s.turn, 1);
});
t('nobles visit and reaching the target finishes the round', () => {
  const s = spl.create(P2, { target: 10 });
  const C = spl._internals.CARDS, N = spl._internals.NOBLES;
  const noble = N[s.nobles[0]];
  const p = s.players[1];
  for (const [c, n] of Object.entries(noble.req)) p.cards.push(...C.filter(x => x.color === c && x.level === 1 && x.points === 0).slice(0, n).map(x => x.id));
  p.cards.push(...C.filter(x => x.level === 3 && x.points >= 4).slice(0, 2).map(x => x.id));
  spl.move(s, 0, { type: 'take', gems: ['w', 'u', 'g'] });
  spl.move(s, 1, { type: 'take', gems: ['w', 'u', 'g'] });
  assert.ok(p.nobles.includes(noble.id));
  assert.ok(s.over, 'seat 1 was last in the round');
  assert.strictEqual(s.winner, 1);
});

console.log('onecard');
const oc = games.byId.onecard;
const C = (suit, rank) => ({ suit, rank });
t('deck has 54 cards and play follows suit or rank', () => {
  assert.strictEqual(oc._internals.buildDeck().length, 54);
  const s = oc.create(P2);
  s.discard = [C('h', 5)]; s.suit = 'h';
  s.hands[0] = [C('s', 9), C('s', 5), C('d', 4)];
  assert.ok(oc.move(s, 0, { type: 'play', index: 0 }).error);
  assert.ok(oc.move(s, 0, { type: 'play', index: 1 }).ok);
  assert.strictEqual(s.suit, 's'); assert.strictEqual(s.turn, 1);
});
t('attacks stack, can be defended, and are taken by drawing', () => {
  const s = oc.create(P2);
  s.discard = [C('h', 5)]; s.suit = 'h';
  s.hands[0] = [C('h', 2), C('c', 9), C('c', 8)];
  s.hands[1] = [C('s', 2), C('h', 1), C('d', 9)];
  assert.ok(oc.move(s, 0, { type: 'play', index: 0 }).ok);
  assert.strictEqual(s.attack, 2);
  assert.ok(oc.move(s, 1, { type: 'play', index: 2 }).error, 'plain card cannot answer an attack');
  assert.ok(oc.move(s, 1, { type: 'play', index: 1 }).ok, 'A of the same suit defends');
  assert.strictEqual(s.attack, 5);
  const before = s.hands[0].length;
  assert.ok(oc.move(s, 0, { type: 'draw' }).ok);
  assert.strictEqual(s.hands[0].length, before + 5);
  assert.strictEqual(s.attack, 0);
});
t('a 3 of the same suit blocks a 2; 7 changes the suit; K plays again; J skips', () => {
  const s = oc.create(THREE_P);
  s.discard = [C('h', 5)]; s.suit = 'h';
  s.hands[0] = [C('h', 2), C('c', 9)];
  s.hands[1] = [C('h', 3), C('h', 7), C('s', 4)];
  oc.move(s, 0, { type: 'play', index: 0 });
  assert.ok(oc.move(s, 1, { type: 'play', index: 0 }).ok);
  assert.strictEqual(s.attack, 0);
  s.turn = 1; s.hands[1] = [C('h', 7), C('s', 13), C('s', 11), C('d', 4)];
  assert.ok(oc.move(s, 1, { type: 'play', index: 0 }).error, 'must choose a suit');
  assert.ok(oc.move(s, 1, { type: 'play', index: 0, chosenColor: 's' }).ok);
  assert.strictEqual(s.suit, 's'); assert.strictEqual(s.turn, 2);
  s.turn = 1;
  assert.ok(oc.move(s, 1, { type: 'play', index: 0 }).ok);
  assert.strictEqual(s.turn, 1, 'K: same player again');
  assert.ok(oc.move(s, 1, { type: 'play', index: 0 }).ok);
  assert.strictEqual(s.turn, 0, 'J skips player 2');
});
t('20 cards in hand means bankruptcy', () => {
  const s = oc.create(P2);
  s.attack = 7; s.hands[1] = Array.from({ length: 14 }, () => C('c', 9));
  s.turn = 1;
  oc.move(s, 1, { type: 'draw' });
  assert.ok(s.out[1]); assert.ok(s.over); assert.strictEqual(s.winner, 0);
});

console.log('jenga');
const jg = games.byId.jenga;
t('top layers are off limits and pulled blocks go on top', () => {
  const s = jg.create(P2);
  assert.ok(jg.move(s, 0, { type: 'pull', layer: 17, slot: 0, steady: 1 }).error);
  const v = jg.view(s, 0);
  assert.strictEqual(v.risks[17][0], null);
  assert.ok(v.risks[16][1] != null);
  // retry until it survives (risk is tiny at the start)
  let s2;
  for (let k = 0; k < 20; k++) { s2 = jg.create(P2); jg.move(s2, 0, { type: 'pull', layer: 5, slot: 1, steady: 1 }); if (!s2.over) break; }
  assert.strictEqual(s2.layers.length, 19);
  assert.deepStrictEqual(s2.layers[18], [true, false, false]);
  assert.strictEqual(s2.turn, 1);
  assert.ok(jg.move(s2, 1, { type: 'pull', layer: 17, slot: 0, steady: 1 }).error, 'layer under an unfinished top is off limits');
});
t('leaving a lone edge block always topples the tower', () => {
  const s = jg.create(P2);
  s.layers[3] = [true, false, true];
  assert.strictEqual(jg._internals.riskOf(s, 3, 0), 1);
  jg.move(s, 0, { type: 'pull', layer: 3, slot: 0, steady: 1 });
  assert.ok(s.over && s.collapsed); assert.strictEqual(s.loser, 0); assert.strictEqual(s.winner, 1);
});

console.log('penguin');
const pg = games.byId.penguin;
t('blocks cut off from the frame fall, the penguin needs two neighbours', () => {
  const s = pg.create(P2);
  const never = () => 1;
  // cut a ring around the centre 3x3: everything inside drops
  const ring = [];
  for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) if (r === 1 || r === 5 || c === 1 || c === 5) ring.push([r, c]);
  for (const [r, c] of ring.slice(0, -1)) s.ice[r][c] = false;
  const [lr, lc] = ring[ring.length - 1];
  pg.move(s, 0, { type: 'hit', r: lr, c: lc }, never);
  assert.ok(s.over, 'the inner island dropped with the penguin');
  assert.strictEqual(s.loser, 0);
  const s2 = pg.create(P2);
  s2.ice[2][3] = false; s2.ice[3][2] = false;
  pg.move(s2, 0, { type: 'hit', r: 4, c: 3 }, never);
  assert.ok(s2.over, 'one neighbour left: the penguin falls');
  const s3 = pg.create(P2);
  assert.ok(pg.move(s3, 0, { type: 'hit', r: 0, c: 0 }, never).ok);
  assert.ok(!s3.over); assert.strictEqual(s3.turn, 1);
  assert.ok(pg.move(s3, 1, { type: 'hit', r: 0, c: 0 }, never).error);
});

console.log('yacht');
const ya = games.byId.yacht;
t('category scores follow the Yacht rules', () => {
  const f = ya._internals.scoreFor;
  assert.strictEqual(f('threes', [3, 3, 1, 3, 6]), 9);
  assert.strictEqual(f('fourKind', [5, 5, 5, 5, 2]), 22);
  assert.strictEqual(f('fourKind', [5, 5, 5, 2, 2]), 0);
  assert.strictEqual(f('fullHouse', [2, 2, 6, 6, 6]), 22);
  assert.strictEqual(f('smallStraight', [1, 3, 4, 2, 6]), 15);
  assert.strictEqual(f('largeStraight', [2, 3, 4, 5, 6]), 30);
  assert.strictEqual(f('yacht', [4, 4, 4, 4, 4]), 50);
  assert.strictEqual(ya._internals.totalOf({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }), 63 + 35);
});
t('three rolls, holds kept, then score and pass the turn', () => {
  const s = ya.create(P2);
  assert.ok(ya.move(s, 0, { type: 'score', cat: 'choice' }).error, 'must roll first');
  ya.move(s, 0, { type: 'roll' });
  const kept = s.dice[0];
  ya.move(s, 0, { type: 'hold', index: 0 });
  ya.move(s, 0, { type: 'roll' }); ya.move(s, 0, { type: 'roll' });
  assert.strictEqual(s.dice[0], kept);
  assert.ok(ya.move(s, 0, { type: 'roll' }).error);
  assert.ok(ya.move(s, 0, { type: 'score', cat: 'yacht' }).ok);
  assert.strictEqual(s.turn, 1);
  assert.ok(ya.move(s, 0, { type: 'roll' }).error);
});

console.log('pirate');
const pi = games.byId.pirate;
t('the trigger slot pops the pirate; option decides win or lose', () => {
  const s = pi.create(P2, {});
  assert.strictEqual(pi.view(s, 0).trigger, null, 'trigger stays secret');
  const safe = s.trigger === 0 ? 1 : 0;
  assert.ok(pi.move(s, 0, { type: 'stab', slot: safe }).ok);
  assert.ok(pi.move(s, 1, { type: 'stab', slot: safe }).error);
  pi.move(s, 1, { type: 'stab', slot: s.trigger });
  assert.ok(s.over); assert.strictEqual(s.loser, 1); assert.strictEqual(s.winner, 0);
  const w = pi.create(THREE_P, { mode: 1 });
  pi.move(w, 0, { type: 'stab', slot: w.trigger });
  assert.strictEqual(w.winner, 0);
});

console.log('sixnimmt');
const sn = games.byId.sixnimmt;
t('bull heads and the sixth-card rule', () => {
  const h = sn._internals.heads;
  assert.deepStrictEqual([1, 5, 10, 11, 55, 100].map(h), [1, 2, 3, 5, 7, 3]);
  const s = sn.create(P2, {});
  s.rows = [[10, 20, 30, 40, 50], [60], [70], [80]];
  s.hands = [[55, 1], [61, 2]];
  sn.move(s, 0, { type: 'choose', card: 55 });
  assert.strictEqual(s.phase, 'choose');
  sn.move(s, 1, { type: 'choose', card: 61 });
  assert.deepStrictEqual(s.rows[0], [55]);
  assert.deepStrictEqual(s.taken[0], [10, 20, 30, 40, 50]);
  assert.deepStrictEqual(s.rows[1], [60, 61]);
});
t('a card below every row makes its player pick a row', () => {
  const s = sn.create(P2, {});
  s.rows = [[10, 20], [30], [40], [50]];
  s.hands = [[5, 99], [45, 98]];
  sn.move(s, 0, { type: 'choose', card: 5 });
  sn.move(s, 1, { type: 'choose', card: 45 });
  assert.strictEqual(s.phase, 'pickRow'); assert.strictEqual(s.picker, 0);
  assert.ok(sn.move(s, 1, { type: 'pickRow', row: 0 }).error);
  sn.move(s, 0, { type: 'pickRow', row: 1 });
  assert.deepStrictEqual(s.taken[0], [30]);
  assert.deepStrictEqual(s.rows[1], [5]);
  assert.deepStrictEqual(s.rows[2], [40, 45]);
  assert.strictEqual(s.phase, 'choose');
});
t('one-hand game ends after ten rounds', () => {
  const s = sn.create(THREE_P, {});
  for (let r = 0; r < 10 && !s.over; r++) {
    for (let i = 0; i < 3; i++) sn.move(s, i, { type: 'choose', card: s.hands[i][0] });
    while (s.phase === 'pickRow') sn.move(s, s.picker, { type: 'pickRow', row: 0 });
  }
  assert.ok(s.over);
});

console.log('marble');
const mb = games.byId.marble;
function withDice(vals, fn) {
  const r = Math.random; let k = 0;
  Math.random = () => (vals[k++ % vals.length] - 1) / 6 + 0.01;
  try { fn(); } finally { Math.random = r; }
}
t('buying, building, salary and rent', () => {
  const s = mb.create(P2, {});
  s.players[0].pos = 37;
  withDice([1, 6], () => mb.move(s, 0, { type: 'roll' }));     // 37 + 7 -> 4 (마닐라)
  assert.strictEqual(s.players[0].pos, 4);
  assert.strictEqual(s.players[0].cash, 320, 'salary for passing the start');
  assert.strictEqual(s.phase, 'buy');
  mb.move(s, 0, { type: 'buy' });
  assert.strictEqual(s.owner[4], 0); assert.strictEqual(s.phase, 'build');
  mb.move(s, 0, { type: 'build' });
  assert.strictEqual(s.level[4], 1); assert.strictEqual(s.turn, 1);
  const rent = mb._internals.rentOf(s, 4);
  const c0 = s.players[0].cash, c1 = s.players[1].cash;
  withDice([1, 3], () => mb.move(s, 1, { type: 'roll' }));     // 0 + 4 -> 마닐라
  assert.strictEqual(s.players[1].cash, c1 - rent);
  assert.strictEqual(s.players[0].cash, c0 + rent);
});
t('three doubles send you to the island; the island holds you', () => {
  const s = mb.create(P2, {});
  withDice([1], () => {
    for (let k = 0; k < 3; k++) { if (s.phase !== 'roll') mb.move(s, 0, { type: 'pass' }); mb.move(s, 0, { type: 'roll' }); }
  });
  assert.strictEqual(s.players[0].pos, 10);
  assert.strictEqual(s.players[0].island, 3);
  assert.strictEqual(s.turn, 1);
});
t('running out of money sells property, then bankrupts', () => {
  const s = mb.create(P2, {});
  s.owner[39] = 1;                    // 서울, rent 50
  s.owner[1] = 0; s.level[1] = 1;     // 타이베이 with a villa
  s.players[0].cash = 10; s.players[0].pos = 33;
  const c1 = s.players[1].cash;
  withDice([3, 3], () => mb.move(s, 0, { type: 'roll' }));     // 33 + 6 -> 서울
  assert.ok(s.players[0].out);
  assert.strictEqual(s.owner[1], -1);
  assert.ok(s.players[1].cash > c1 + 10, 'the owner got the cash and the sale money');
  assert.ok(s.over); assert.strictEqual(s.winner, 1);
});

console.log('siege');
const sg = games.byId.siege;
const tower = []; for (let l = 0; l < 8; l++) for (let k = -1; k <= 1; k++) tower.push(l % 2 ? { k: 'b', o: 1, x: k, z: 0 } : { k: 'b', o: 0, x: 0, z: k });
tower.push({ k: 'f', x: 0, z: 0 });
t('building: stacking, budget, flag and minimum height are enforced', () => {
  const r = sg._internals.stack([{ k: 'b', o: 0, x: 0, z: 0 }, { k: 'b', o: 1, x: 0, z: 0 }, { k: 'f', x: 0, z: 0 }], 24);
  assert.deepStrictEqual(r.items.map(i => +i.y.toFixed(3)), [0.3, 0.9, 1.6]);
  assert.ok(sg._internals.stack([{ k: 'b', o: 0, x: 2.5, z: 0 }], 24).error, 'off the plot');
  const s = sg.create(P2, {});
  assert.ok(sg.move(s, 0, { type: 'submit', items: tower.slice(0, -1) }).error, 'flag required');
  assert.ok(sg.move(s, 0, { type: 'submit', items: [{ k: 'b', o: 0, x: 0, z: 0 }, { k: 'f', x: 0, z: 0 }] }).error, 'too low');
  assert.ok(sg.move(s, 0, { type: 'submit', items: [...tower.slice(0, 24), { k: 'b', o: 0, x: 0, z: 2 }, tower[24]] }).error, 'over budget');
  assert.strictEqual(sg.view(s, 1).myDraft.length, 0, 'drafts stay private');
});
t('the tower survives settling and shots are simulated on the server', () => {
  const s = sg.create(P2, {});
  sg.move(s, 0, { type: 'submit', items: tower });
  sg.move(s, 1, { type: 'submit', items: tower });
  assert.strictEqual(s.phase, 'attack');
  assert.ok(s.heights[0] > 5 && s.alive.every(Boolean));
  const p = s.plots[0], o = s.plots[1];
  const n = s.bodies.length;
  assert.ok(sg.move(s, 1, { type: 'shoot', yaw: 0, pitch: 0.3, power: 0.5 }).error, 'not your turn');
  assert.ok(sg.move(s, 0, { type: 'shoot', yaw: Math.atan2(o.cx - p.sx, o.cz - p.sz), pitch: 0.12, power: 0.75 }).ok);
  assert.strictEqual(s.bodies.length, n + 1, 'ammo stays on the table');
  assert.ok(s.replay.frames.length > 5 && s.replay.ids.length > 0);
  assert.ok(s.over || s.turn === 1);
});
t('a flag knocked off the pedestal eliminates its owner', () => {
  const s = sg.create(P2, {});
  sg.move(s, 0, { type: 'submit', items: tower }); sg.move(s, 1, { type: 'submit', items: tower });
  const flag = s.bodies.find(b => b.owner === 1 && b.kind === 'f');
  flag.p = [s.plots[1].cx + 6, 0.4, s.plots[1].cz];
  sg._internals.judge(s);
  assert.ok(!s.alive[1]); assert.ok(s.over); assert.strictEqual(s.winner, 0);
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
