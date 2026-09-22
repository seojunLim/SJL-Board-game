'use strict';
// End-to-end socket test: two clients create a room, play, and finish a game.
const assert = require('assert');
const { io } = require('socket.io-client');
const { server } = require('../server');

const wait = (sock, ev) => new Promise(res => sock.once(ev, res));

// Collects the latest per-seat state so tests never race the initial push.
function track(sock) {
  const box = { state: null, seat: null, waiters: [] };
  sock.on('game:state', m => {
    box.state = m.state; box.seat = m.seat;
    box.waiters.splice(0).forEach(fn => fn(m));
  });
  box.next = () => new Promise(res => box.waiters.push(res));
  return box;
}

(async () => {
  await new Promise(res => server.listen(0, res));
  const url = 'http://localhost:' + server.address().port;
  const a = io(url, { transports: ['websocket'] });
  const b = io(url, { transports: ['websocket'] });
  const aState = track(a), bState = track(b);
  await Promise.all([wait(a, 'connect'), wait(b, 'connect')]);
  a.emit('lobby:join', '앨리스');
  b.emit('lobby:join', '보브');
  await wait(a, 'lobby:rooms');

  const created = await new Promise(res => a.emit('room:create', { gameId: 'othello', name: '앨리스' }, res));
  assert.ok(created.ok, 'room created');
  const code = created.room.code;
  console.log('  ✓ room created:', code);

  const joined = await new Promise(res => b.emit('room:join', { code, name: '보브' }, res));
  assert.ok(joined.ok && joined.room.players.length === 2, 'both players seated');
  console.log('  ✓ second player joined');

  const started = wait(a, 'game:start');
  a.emit('room:ready', true);
  b.emit('room:ready', true);
  await started;
  console.log('  ✓ game started when both were ready');

  if (!aState.state) await aState.next();
  assert.strictEqual(aState.seat, 0);
  assert.strictEqual(aState.state.legal.length, 4);
  console.log('  ✓ per-seat state delivered');

  const bad = await new Promise(res => b.emit('game:action', { type: 'place', r: 2, c: 3 }, res));
  assert.ok(bad.error, 'out-of-turn move refused');
  console.log('  ✓ out-of-turn move refused:', bad.error);

  const bNext = bState.next();
  const ok = await new Promise(res => a.emit('game:action', { type: 'place', r: 2, c: 3 }, res));
  assert.ok(ok.ok);
  await bNext;
  assert.deepStrictEqual(bState.state.counts, { black: 4, white: 1 });
  console.log('  ✓ move applied and broadcast to both seats');

  const over = wait(b, 'game:over');
  a.emit('game:action', { type: 'resign' }, () => {});
  const res = await over;
  assert.strictEqual(res.winner, 1);
  console.log('  ✓ resignation ends the game:', res.result);

  const chat = wait(a, 'room:chat');
  b.emit('room:chat', '좋은 게임이었어요');
  assert.strictEqual((await chat).text, '좋은 게임이었어요');
  console.log('  ✓ chat relayed');

  a.close(); b.close();
  server.close();
  console.log('\nserver e2e: all checks passed.');
  process.exit(0);
})().catch(e => { console.error('✗', e); process.exit(1); });
