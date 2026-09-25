import { renderers } from './games/index.js';
import { isMuted, setMuted } from './three3d/sound.js';

const socket = io();
const $ = s => document.querySelector(s);
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

const EMOJI = { chess: '♞', go: '⚫', othello: '⚪', davinci: '🔢', louie: '✈️', halligalli: '🔔', uno: '🃏' };
const DESC = {
  chess: '정식 체스 규칙 (캐슬링·앙파상·승격)',
  go: '19/13/9로 · 패 · 계가',
  othello: '8×8 정식 리버시',
  davinci: '숫자 추리 · 2~4인',
  louie: '실시간 반사신경 · 2~4인',
  halligalli: '실시간 종치기 · 2~6인',
  uno: '정식 108장 · 2~6인'
};

let me = { name: '', id: null };
let current = { room: null, seat: -1, gameId: null, renderer: null, state: null };
let gamesMeta = [];
let pendingGame = null;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}

// ------------------------------------------------------------------ identity
const savedName = localStorage.getItem('sjl-name') || '';
$('#nick').value = savedName;
$('#nick').addEventListener('change', () => {
  const v = $('#nick').value.trim();
  localStorage.setItem('sjl-name', v);
  socket.emit('lobby:join', v);
});

socket.on('connect', () => {
  $('#conn').textContent = '연결됨'; $('#conn').className = 'pill on';
  socket.emit('lobby:join', $('#nick').value.trim());
});
socket.on('disconnect', () => { $('#conn').textContent = '연결 끊김'; $('#conn').className = 'pill off'; });
socket.on('me', m => { me = m; if (!$('#nick').value) $('#nick').value = m.name; });

// --------------------------------------------------------------------- lobby
socket.on('lobby:games', list => { gamesMeta = list; renderGameGrid(); });
socket.on('lobby:rooms', rooms => renderRooms(rooms));

function renderGameGrid() {
  const g = $('#gameGrid'); g.innerHTML = '';
  for (const meta of gamesMeta) {
    const b = el('button', 'gcard');
    b.innerHTML = `<div class="emoji">${EMOJI[meta.id] || '🎲'}</div>
      <div class="nm">${meta.name}</div>
      <div class="sub">${DESC[meta.id] || ''}</div>
      <div class="sub">${meta.minPlayers === meta.maxPlayers ? meta.minPlayers + '인' : meta.minPlayers + '~' + meta.maxPlayers + '인'}${meta.realtime ? ' · 실시간' : ''}</div>`;
    b.onclick = () => openCreate(meta);
    g.appendChild(b);
  }
}

function openCreate(meta) {
  pendingGame = meta;
  $('#createBox').classList.remove('hidden');
  $('#createTitle').textContent = meta.name;
  const o = $('#createOpts'); o.innerHTML = '';
  if (meta.options && meta.options.size) {
    const sel = el('select'); sel.id = 'optSize';
    for (const s of meta.options.size) sel.appendChild(new Option(s + '로', s));
    o.appendChild(sel);
  }
}
$('#createCancel').onclick = () => { $('#createBox').classList.add('hidden'); pendingGame = null; };
$('#createBtn').onclick = () => {
  if (!pendingGame) return;
  const options = {};
  const sz = document.getElementById('optSize');
  if (sz) options.size = Number(sz.value);
  socket.emit('room:create', { gameId: pendingGame.id, name: $('#nick').value.trim(), options }, res => {
    if (res.error) return toast(res.error);
  });
};

function renderRooms(rooms) {
  const list = $('#roomList'); list.innerHTML = '';
  if (!rooms.length) { list.appendChild(el('p', 'muted', '아직 방이 없습니다. 위에서 새로 만들어 보세요.')); return; }
  for (const r of rooms) {
    const row = el('div', 'roomRow');
    row.innerHTML = `<div><b>${r.gameName}</b> <span class="code-badge">${r.code}</span><br>
      <span class="muted">${r.players.map(p => p.name).join(', ') || '비어 있음'} (${r.players.length}/${r.max})</span></div>`;
    const b = el('button', 'primary', '입장');
    b.onclick = () => joinRoom(r.code, false);
    row.appendChild(b);
    list.appendChild(row);
  }
}

function joinRoom(code, spectate) {
  socket.emit('room:join', { code: String(code || '').toUpperCase(), name: $('#nick').value.trim(), spectate }, res => {
    if (res.error) return toast(res.error);
  });
}
$('#joinBtn').onclick = () => joinRoom($('#joinCode').value, false);
$('#spectateBtn').onclick = () => joinRoom($('#joinCode').value, true);
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('#joinCode').value, false); });

// ---------------------------------------------------------------------- room
socket.on('room:info', info => {
  current.room = info;
  current.gameId = info.gameId;
  $('#lobby').classList.add('hidden');
  $('#room').classList.remove('hidden');
  $('#roomCode').textContent = info.code;
  $('#roomGame').textContent = info.gameName;
  const seats = $('#seatList'); seats.innerHTML = '';
  info.players.forEach((p, i) => {
    const s = el('div', 'seat' + (p.ready ? ' ready' : '') + (p.name === me.name ? ' me' : '') +
      (current.state && current.state.turn === i && !current.state.over ? ' turn' : ''));
    s.appendChild(el('span', 'dot'));
    s.appendChild(el('span', null, `${p.name}${p.connected ? '' : ' (접속끊김)'}`));
    seats.appendChild(s);
  });
  if (info.spectators) seats.appendChild(el('div', 'seat', `👁 관전 ${info.spectators}`));
  $('#readyBtn').classList.toggle('hidden', info.started);
  if (!info.started) {
    const mine = info.players.find(p => p.name === me.name);
    $('#readyBtn').textContent = mine && mine.ready ? '준비 취소' : '준비';
    $('#readyBtn').onclick = () => socket.emit('room:ready', !(mine && mine.ready));
    $('#status').innerHTML = `<b>대기 중</b><br>${info.players.length}/${info.max}명 · 최소 ${info.min}명<br>
      전원 "준비"를 누르면 시작합니다.<br><span class="muted">친구에게 코드 <b>${info.code}</b>를 알려주세요.</span>`;
    $('#board').innerHTML = '';
    $('#panelExtra').innerHTML = '';
    current.state = null;
    if (current.renderer && current.renderer.destroy) current.renderer.destroy();
    current.renderer = null;
  }
});

$('#leaveBtn').onclick = () => {
  if (current.renderer && current.renderer.destroy) current.renderer.destroy();
  current.renderer = null; current.state = null; current.room = null;
  socket.emit('room:leave');
  $('#room').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
};

socket.on('game:start', ({ gameId }) => {
  $('#board').innerHTML = '';
  $('#panelExtra').innerHTML = '';
  $('#rematchBtn').classList.add('hidden');
  if (current.renderer && current.renderer.destroy) current.renderer.destroy();
  const make = renderers[gameId];
  current.renderer = make ? make({
    root: $('#board'), extra: $('#panelExtra'), status: $('#status'),
    send: (action, cb) => socket.emit('game:action', action, res => {
      if (res && res.error) toast(res.error); else if (cb) cb(res);
    }),
    toast
  }) : null;
});

socket.on('game:state', ({ gameId, seat, state }) => {
  current.seat = seat; current.state = state; current.gameId = gameId;
  if (current.renderer) current.renderer.render(state, seat);
  // refresh turn highlight on the seat chips
  const chips = document.querySelectorAll('#seatList .seat');
  chips.forEach((c, i) => c.classList.toggle('turn', !state.over && state.turn === i));
});

socket.on('game:over', ({ result }) => {
  $('#rematchBtn').classList.remove('hidden');
  toast(result || '게임 종료');
});
$('#rematchBtn').onclick = () => socket.emit('room:rematch');
const syncMute = () => { $('#muteBtn').textContent = isMuted() ? '🔇' : '🔊'; };
$('#muteBtn').onclick = () => { setMuted(!isMuted()); syncMute(); };
syncMute();
socket.on('room:rematch-votes', ({ votes, need }) => {
  $('#rematchBtn').textContent = `한 판 더 (${votes}/${need})`;
});

// ---------------------------------------------------------------------- chat
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (!v) return;
  socket.emit('room:chat', v);
  $('#chatInput').value = '';
});
function addChat(m) {
  const log = $('#chatLog');
  const line = el('div');
  line.innerHTML = `<span class="nm"></span> <span class="tx"></span>`;
  line.querySelector('.nm').textContent = m.name + ':';
  line.querySelector('.tx').textContent = m.text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
socket.on('room:chat', addChat);
socket.on('room:chat-history', arr => { $('#chatLog').innerHTML = ''; arr.forEach(addChat); });
