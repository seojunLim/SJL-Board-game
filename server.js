'use strict';
const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const games = require('./games');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = process.env.PORT || 3000;

// Keep the site out of search engines (deploy-only, unlisted).
app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex');
  next();
});
app.get('/robots.txt', (_req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));
app.get('/api/games', (_req, res) => res.json(games.meta));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));
// LAN addresses, so a laptop running the server offline can show a QR code
// that phones on the same Wi-Fi/hotspot can open.
app.get('/api/info', (_req, res) => {
  const lan = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
    if (a.family === 'IPv4' && !a.internal) lan.push(`http://${a.address}:${PORT}`);
  }
  res.json({ lan });
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------------------------------------------------------------- room model
const rooms = new Map();          // code -> room
const sockets = new Map();        // socket.id -> { name, roomCode }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode() {
  let code;
  do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

const EMPTY_ROOM_GRACE_MS = 10 * 60_000;   // keep a started game this long with nobody connected

function sanitizePid(p) { return typeof p === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(p) ? p : null; }

function sanitizeName(n) {
  const s = String(n || '').trim().slice(0, 16).replace(/[\u0000-\u001f<>]/g, '');
  return s || '손님' + Math.floor(Math.random() * 1000);
}

function createRoom(gameId, hostName, opts) {
  const game = games.byId[gameId];
  if (!game) return null;
  const code = newCode();
  const room = {
    code, gameId, game, options: opts || {},
    players: [],            // { id, name, seat, connected, ready }
    spectators: [],
    state: null, started: false, createdAt: Date.now(), timer: null,
    chat: [], rematchVotes: new Set()
  };
  rooms.set(code, room);
  return room;
}

function roomInfo(room, forSocket) {
  return {
    code: room.code, gameId: room.gameId, gameName: room.game.name,
    players: room.players.map(p => ({ name: p.name, seat: p.seat, connected: p.connected, ready: p.ready, mine: !!forSocket && p.id === forSocket })),
    spectators: room.spectators.length,
    started: room.started, max: room.game.maxPlayers, min: room.game.minPlayers,
    options: room.options
  };
}

function lobbyList() {
  return [...rooms.values()]
    .filter(r => !r.started && r.players.length < r.game.maxPlayers && r.players.some(p => p.connected))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40)
    .map(roomInfo);
}

function broadcastLobby() { io.to('lobby').emit('lobby:rooms', lobbyList()); }

// Each member gets the room with their own seat marked (`mine`).
function pushRoom(room) {
  for (const p of room.players) if (p.connected) io.to(p.id).emit('room:info', roomInfo(room, p.id));
  for (const s of room.spectators) io.to(s.id).emit('room:info', roomInfo(room, s.id));
}

function pushState(room) {
  if (!room.state) return;
  for (const p of room.players) {
    if (!p.connected) continue;
    io.to(p.id).emit('game:state', { gameId: room.gameId, seat: p.seat, state: room.game.view(room.state, p.seat) });
  }
  for (const s of room.spectators) {
    io.to(s.id).emit('game:state', { gameId: room.gameId, seat: -1, state: room.game.view(room.state, -1) });
  }
}

function startGame(room) {
  room.started = true;
  room.rematchVotes = new Set();
  room.state = room.game.create(room.players.map(p => ({ name: p.name })), room.options);
  io.to(room.code).emit('game:start', { gameId: room.gameId });
  pushRoom(room);
  pushState(room);
  if (room.game.tick) {
    clearInterval(room.timer);
    room.timer = setInterval(() => {
      if (!room.state || room.state.over) { clearInterval(room.timer); room.timer = null; pushState(room); return; }
      if (room.game.tick(room.state)) pushState(room);
    }, room.game.tickMs || 50);
  }
  broadcastLobby();
}

function destroyRoom(room) {
  clearInterval(room.timer);
  rooms.delete(room.code);
  broadcastLobby();
}

function leaveRoom(socket) {
  const meta = sockets.get(socket.id);
  if (!meta || !meta.roomCode) return;
  const room = rooms.get(meta.roomCode);
  meta.roomCode = null;
  if (!room) return;
  socket.leave(room.code);
  const p = room.players.find(x => x.id === socket.id);
  if (p) {
    if (room.started) { p.connected = false; }
    else { room.players = room.players.filter(x => x.id !== socket.id); room.players.forEach((q, i) => { q.seat = i; }); }
  }
  room.spectators = room.spectators.filter(x => x.id !== socket.id);
  const anyone = room.players.some(x => x.connected) || room.spectators.length > 0;
  // A game in progress survives everyone dropping out briefly (phones locking,
  // flaky school Wi-Fi); the sweeper removes it after the grace period.
  if (!anyone && !room.started) destroyRoom(room);
  else {
    if (!anyone) room.emptySince = Date.now();
    pushRoom(room); broadcastLobby();
  }
}

io.on('connection', (socket) => {
  sockets.set(socket.id, { name: '손님', roomCode: null, pid: null });

  socket.on('lobby:join', (arg) => {
    const meta = sockets.get(socket.id);
    const o = arg && typeof arg === 'object' ? arg : { name: arg };
    meta.name = sanitizeName(o.name);
    meta.pid = sanitizePid(o.pid) || meta.pid;
    socket.join('lobby');
    socket.emit('lobby:games', games.meta);
    socket.emit('lobby:rooms', lobbyList());
    socket.emit('me', { name: meta.name, id: socket.id });
  });

  socket.on('room:create', ({ gameId, name, options, pid } = {}, cb) => {
    const meta = sockets.get(socket.id);
    meta.name = sanitizeName(name || meta.name);
    meta.pid = sanitizePid(pid) || meta.pid;
    const room = createRoom(gameId, meta.name, options);
    if (!room) return cb && cb({ error: '없는 게임입니다.' });
    doJoin(socket, room, cb);
  });

  socket.on('room:join', ({ code, name, spectate, pid } = {}, cb) => {
    const meta = sockets.get(socket.id);
    meta.name = sanitizeName(name || meta.name);
    meta.pid = sanitizePid(pid) || meta.pid;
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return cb && cb({ error: '방을 찾을 수 없습니다.' });
    doJoin(socket, room, cb, spectate);
  });

  function doJoin(socket, room, cb, spectate) {
    const meta = sockets.get(socket.id);
    if (meta.roomCode && meta.roomCode !== room.code) leaveRoom(socket);
    socket.leave('lobby');
    socket.join(room.code);
    meta.roomCode = room.code;

    // Reclaim a seat held by this device (pid), even if the old socket has not
    // timed out yet; fall back to the name for clients without a pid.
    const ghost = meta.pid
      ? room.players.find(p => p.pid === meta.pid)
      : room.players.find(p => !p.connected && !p.pid && p.name === meta.name);
    if (ghost) {
      if (ghost.connected && ghost.id !== socket.id) {
        const old = io.sockets.sockets.get(ghost.id);
        if (old) { const om = sockets.get(old.id); if (om) om.roomCode = null; old.leave(room.code); }
      }
      ghost.id = socket.id; ghost.connected = true; ghost.name = meta.name;
      room.emptySince = null;
    }
    else if (!spectate && !room.started && room.players.length < room.game.maxPlayers) {
      room.players.push({ id: socket.id, pid: meta.pid, name: meta.name, seat: room.players.length, connected: true, ready: false });
    } else {
      room.spectators.push({ id: socket.id, name: meta.name });
    }
    cb && cb({ ok: true, room: roomInfo(room, socket.id) });
    socket.emit('room:chat-history', room.chat.slice(-50));
    pushRoom(room);
    if (room.started) pushState(room);
    broadcastLobby();
  }

  socket.on('room:ready', (ready) => {
    const meta = sockets.get(socket.id);
    const room = rooms.get(meta && meta.roomCode);
    if (!room || room.started) return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;
    p.ready = !!ready;
    pushRoom(room);
    const enough = room.players.length >= room.game.minPlayers;
    if (enough && room.players.every(x => x.ready && x.connected)) startGame(room);
  });

  socket.on('room:options', (opts) => {
    const meta = sockets.get(socket.id);
    const room = rooms.get(meta && meta.roomCode);
    if (!room || room.started) return;
    if (room.players[0] && room.players[0].id !== socket.id) return;
    room.options = Object.assign({}, room.options, opts || {});
    room.players.forEach(p => { p.ready = false; });
    pushRoom(room);
    broadcastLobby();
  });

  socket.on('game:action', (action, cb) => {
    const meta = sockets.get(socket.id);
    const room = rooms.get(meta && meta.roomCode);
    if (!room || !room.state) return cb && cb({ error: '게임이 시작되지 않았습니다.' });
    const p = room.players.find(x => x.id === socket.id);
    if (!p) return cb && cb({ error: '관전자는 조작할 수 없습니다.' });
    let res;
    try { res = room.game.move(room.state, p.seat, action || {}); }
    catch (e) { console.error('move error', room.gameId, e); res = { error: '내부 오류가 발생했습니다.' }; }
    if (res && res.error) return cb && cb({ error: res.error });
    cb && cb({ ok: true });
    pushState(room);
    if (room.state.over) {
      clearInterval(room.timer); room.timer = null;
      io.to(room.code).emit('game:over', { result: room.state.result, winner: room.state.winner });
    }
  });

  socket.on('room:rematch', () => {
    const meta = sockets.get(socket.id);
    const room = rooms.get(meta && meta.roomCode);
    if (!room || !room.state || !room.state.over) return;
    room.rematchVotes.add(socket.id);
    const active = room.players.filter(p => p.connected);
    io.to(room.code).emit('room:rematch-votes', { votes: room.rematchVotes.size, need: active.length });
    if (active.length >= room.game.minPlayers && active.every(p => room.rematchVotes.has(p.id))) {
      room.players = active;
      room.players.forEach((p, i) => { p.seat = i; p.ready = true; });
      startGame(room);
    }
  });

  socket.on('room:leave', () => { leaveRoom(socket); socket.join('lobby'); socket.emit('lobby:rooms', lobbyList()); });

  socket.on('room:chat', (text) => {
    const meta = sockets.get(socket.id);
    const room = rooms.get(meta && meta.roomCode);
    if (!room) return;
    const msg = { name: meta.name, text: String(text || '').slice(0, 300), t: Date.now() };
    if (!msg.text) return;
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    io.to(room.code).emit('room:chat', msg);
  });

  socket.on('disconnect', () => { leaveRoom(socket); sockets.delete(socket.id); });
});

// Sweep rooms that have been empty/idle for a while.
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    const live = room.players.some(p => p.connected) || room.spectators.length;
    if (live) continue;
    if (room.started ? now - (room.emptySince || now) > EMPTY_ROOM_GRACE_MS : now - room.createdAt > 60_000) destroyRoom(room);
  }
}, 60_000);

if (require.main === module) {
  server.listen(PORT, () => console.log(`SJL Board Game listening on http://localhost:${PORT}`));
}
module.exports = { app, server, io, rooms };
