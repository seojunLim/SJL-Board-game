import { renderers } from './games/index.js';
import { isMuted, setMuted, sfx } from './three3d/sound.js';
import { RULES, showRules, rulesSeen } from './rules.js';

const socket = io();
const $ = s => document.querySelector(s);
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

// A stable per-device id lets a phone that locked its screen reclaim its seat.
let pid = store.get('sjl-pid');
if (!pid) { pid = 'p' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set('sjl-pid', pid); }

let myName = store.get('sjl-name');
let current = { room: null, seat: -1, gameId: null, renderer: null, state: null, overShown: false };
let gamesMeta = [];
let pendingRoom = new URLSearchParams(location.search).get('room');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2600);
}
function setUrl(code) {
  const u = code ? `${location.pathname}?room=${code}` : location.pathname;
  try { history.replaceState(null, '', u); } catch {}
}

// ------------------------------------------------------------------ nickname
function renderNick() {
  $('#nickLabel').textContent = myName || '닉네임 정하기';
  $('#nickAv').textContent = myName ? myName.slice(0, 1) : '?';
}
function askName(force) {
  return new Promise(res => {
    if (myName && !force) return res(myName);
    document.querySelector('.nameModal')?.remove();
    const m = el('div', 'nameModal modalBack', `
      <form class="sheet small">
        <div class="big">👋</div>
        <h2>닉네임을 정해 주세요</h2>
        <p class="muted">게임에서 다른 사람에게 보이는 이름이에요.</p>
        <input name="n" maxlength="12" placeholder="예: 서준" autocomplete="off" value="${esc(myName)}">
        <button class="primary big" type="submit">시작하기</button>
      </form>`);
    const form = m.querySelector('form');
    const inp = m.querySelector('input');
    form.onsubmit = e => {
      e.preventDefault();
      const v = inp.value.trim().slice(0, 12);
      if (!v) { inp.focus(); return; }
      myName = v; store.set('sjl-name', v); renderNick();
      socket.emit('lobby:join', { name: myName, pid });
      m.remove(); res(myName);
    };
    if (myName) m.addEventListener('click', e => { if (e.target === m) { m.remove(); res(myName); } });
    document.body.appendChild(m);
    setTimeout(() => inp.focus(), 50);
  });
}
$('#nickBtn').onclick = () => askName(true);
renderNick();

// ---------------------------------------------------------------- connection
socket.on('connect', async () => {
  $('#conn').textContent = '연결됨'; $('#conn').className = 'pill on';
  socket.emit('lobby:join', { name: myName, pid });
  // Came back after a drop (phone locked, Wi-Fi blip): go straight back in.
  if (current.room) joinRoom(current.room.code, false, true);
  else if (pendingRoom) {
    await askName();
    const code = pendingRoom; pendingRoom = null;
    joinRoom(code, false);
  }
});
socket.on('disconnect', () => { $('#conn').textContent = '재연결 중…'; $('#conn').className = 'pill off'; });
socket.on('me', m => { if (!myName) { myName = m.name; renderNick(); } });

// --------------------------------------------------------------------- lobby
socket.on('lobby:games', list => { gamesMeta = list; renderGameGrid(); });
socket.on('lobby:rooms', rooms => renderRooms(rooms));

const playersLabel = m => (m.minPlayers === m.maxPlayers ? `${m.minPlayers}인` : `${m.minPlayers}~${m.maxPlayers}인`);

function renderGameGrid() {
  const g = $('#gameGrid'); g.innerHTML = '';
  for (const meta of gamesMeta) {
    const r = RULES[meta.id] || {};
    const card = el('button', 'gameCard', `
      <div class="cover"><img src="/img/covers/${meta.id}.jpg" alt="" loading="lazy" onerror="this.remove()"><span class="fallback">${r.emoji || '🎲'}</span></div>
      <div class="info">
        <div class="nm">${esc(meta.name)}</div>
        <div class="tag">${esc(r.tagline || '')}</div>
        <div class="chips"><span>👥 ${playersLabel(meta)}</span>${meta.realtime ? '<span class="rt">⚡ 실시간</span>' : ''}</div>
      </div>`);
    card.onclick = () => openGameSheet(meta);
    g.appendChild(card);
  }
}

function openGameSheet(meta) {
  const r = RULES[meta.id] || {};
  document.querySelector('.gameSheet')?.remove();
  const sizes = meta.options && meta.options.size;
  const m = el('div', 'gameSheet modalBack', `
    <div class="sheet">
      <div class="sheetCover"><img src="/img/covers/${meta.id}.jpg" alt="" onerror="this.remove()"><button class="closeX" aria-label="닫기">✕</button></div>
      <h2>${r.emoji || ''} ${esc(meta.name)}</h2>
      <div class="tag">${esc(r.tagline || '')}</div>
      <div class="facts"><span>👥 ${playersLabel(meta)}</span><span>⏱ ${r.time || ''}</span></div>
      <p class="goal">🏆 ${r.goal || ''}</p>
      ${sizes ? `<div class="sizePick">${sizes.slice().reverse().map(s => `<label><input type="radio" name="sz" value="${s}" ${s === 9 ? 'checked' : ''}><span>${s}줄${s === 9 ? ' (추천)' : ''}</span></label>`).join('')}</div>` : ''}
      <div class="sheetBtns">
        <button class="ghost big rulesOpen">📖 규칙 보기</button>
        <button class="primary big" id="createBtn">방 만들기</button>
      </div>
    </div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('.closeX')) m.remove(); });
  m.querySelector('.rulesOpen').onclick = () => showRules(meta.id, meta.name);
  m.querySelector('#createBtn').onclick = async () => {
    await askName();
    const options = {};
    const sz = m.querySelector('input[name=sz]:checked');
    if (sz) options.size = Number(sz.value);
    socket.emit('room:create', { gameId: meta.id, name: myName, options, pid }, res => {
      if (res.error) return toast(res.error);
      m.remove();
    });
  };
  document.body.appendChild(m);
}

function renderRooms(rooms) {
  const list = $('#roomList'); list.innerHTML = '';
  if (!rooms.length) { list.appendChild(el('p', 'muted empty', '아직 열린 방이 없어요. 위에서 게임을 골라 방을 만들어 보세요!')); return; }
  for (const r of rooms) {
    const emoji = (RULES[r.gameId] || {}).emoji || '🎲';
    const row = el('button', 'roomRow', `<span class="re">${emoji}</span>
      <span class="ri"><b>${esc(r.gameName)}</b> <span class="code-badge">${r.code}</span><br>
      <span class="muted">${r.players.map(p => esc(p.name)).join(', ') || '비어 있음'} · ${r.players.length}/${r.max}명</span></span>
      <span class="go">입장 ›</span>`);
    row.onclick = () => joinRoom(r.code, false);
    list.appendChild(row);
  }
}

async function joinRoom(code, spectate, silent) {
  code = String(code || '').trim().toUpperCase();
  if (code.length !== 4) { if (!silent) toast('방 코드 4자리를 입력하세요.'); return; }
  await askName();
  socket.emit('room:join', { code, name: myName, spectate, pid }, res => {
    if (res.error) {
      if (silent || current.room) { leaveToLobby(); }
      toast(res.error);
    }
  });
}
$('#joinForm').onsubmit = e => { e.preventDefault(); joinRoom($('#joinCode').value, false); };
$('#spectateBtn').onclick = () => joinRoom($('#joinCode').value, true);
$('#brandLink').onclick = e => { e.preventDefault(); if (current.room) { if (confirm('방에서 나갈까요?')) $('#leaveBtn').click(); } };

// ---------------------------------------------------------------- invite / QR
let lanBase = null;
fetch('/api/info').then(r => r.json()).then(j => { lanBase = (j.lan || [])[0] || null; }).catch(() => {});
function inviteUrl(code) {
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const base = local && lanBase ? lanBase : location.origin;
  return `${base}/?room=${code}`;
}
function qrSvg(text) {
  try {
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  } catch { return ''; }
}
function inviteHtml(code) {
  const url = inviteUrl(code);
  return `<div class="invite">
    <div class="qr">${qrSvg(url)}</div>
    <div class="inviteText">
      <div class="muted">폰 카메라로 QR을 찍거나, 방 코드를 입력하세요</div>
      <div class="bigCode">${code}</div>
      <div class="url">${esc(url.replace(/^https?:\/\//, ''))}</div>
    </div>
  </div>`;
}
$('#inviteBtn').onclick = () => {
  if (!current.room) return;
  const m = el('div', 'modalBack', `<div class="sheet small">${inviteHtml(current.room.code)}<button class="primary big closeInv">닫기</button></div>`);
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('.closeInv')) m.remove(); });
  document.body.appendChild(m);
};

// ---------------------------------------------------------------------- room
function myPlayer(info) { return info.players.find(p => p.mine); }

socket.on('room:info', info => {
  const entering = !current.room || current.room.code !== info.code;
  current.room = info;
  current.gameId = info.gameId;
  setUrl(info.code);
  $('#lobby').classList.add('hidden');
  $('#room').classList.remove('hidden');
  document.body.classList.add('inRoom');
  const r = RULES[info.gameId] || {};
  $('#roomCode').textContent = info.code;
  $('#roomGame').textContent = info.gameName;
  $('#roomEmoji').textContent = r.emoji || '🎲';
  const seats = $('#seatList'); seats.innerHTML = '';
  info.players.forEach((p, i) => {
    const s = el('div', 'seat' + (p.ready ? ' ready' : '') + (p.mine ? ' me' : '') + (p.connected ? '' : ' away') +
      (current.state && current.state.turn === i && !current.state.over ? ' turn' : ''));
    s.appendChild(el('span', 'dot'));
    s.appendChild(el('span', null, esc(p.name) + (p.mine ? ' (나)' : '') + (p.connected ? '' : ' · 재접속 대기')));
    seats.appendChild(s);
  });
  if (info.spectators) seats.appendChild(el('div', 'seat', `👁 관전 ${info.spectators}`));
  $('#readyBtn').classList.toggle('hidden', info.started);
  if (!info.started) {
    const mine = myPlayer(info);
    $('#readyBtn').classList.toggle('hidden', !mine);
    $('#readyBtn').textContent = mine && mine.ready ? '준비 취소' : '준비 완료!';
    $('#readyBtn').onclick = () => socket.emit('room:ready', !(mine && mine.ready));
    if (current.renderer && current.renderer.destroy) current.renderer.destroy();
    current.renderer = null; current.state = null;
    renderWaiting(info);
  }
  if (entering && !rulesSeen(info.gameId)) showRules(info.gameId, info.gameName);
});

function renderWaiting(info) {
  const mine = myPlayer(info);
  const need = Math.max(0, info.min - info.players.length);
  $('#board').innerHTML = '';
  const w = el('div', 'waiting', `
    ${inviteHtml(info.code)}
    <div class="waitList">
      ${info.players.map(p => `<div class="wp ${p.ready ? 'ok' : ''}"><span class="av">${esc(p.name.slice(0, 1))}</span>${esc(p.name)}${p.mine ? ' (나)' : ''}<span class="st">${p.ready ? '✅ 준비' : '⏳ 대기'}</span></div>`).join('')}
      ${Array.from({ length: Math.max(0, info.max - info.players.length) }, () => '<div class="wp emptySeat"><span class="av">+</span>빈 자리</div>').join('')}
    </div>
    <div class="waitMsg">${need ? `최소 <b>${info.min}명</b>이 필요해요. ${need}명 더 들어오면 시작할 수 있어요.` : '모두 <b>준비 완료</b>를 누르면 바로 시작해요!'}</div>
    ${mine ? `<button class="primary huge" id="readyBig">${mine.ready ? '준비 취소' : '준비 완료!'}</button>` : '<div class="muted">관전 중이에요.</div>'}
    <button class="ghost" id="rulesBig">📖 ${esc(info.gameName)} 규칙 보기</button>`);
  $('#board').appendChild(w);
  const rb = $('#readyBig');
  if (rb) rb.onclick = () => socket.emit('room:ready', !mine.ready);
  $('#rulesBig').onclick = () => showRules(info.gameId, info.gameName);
  $('#status').innerHTML = `<b>대기 중</b> · ${info.players.length}/${info.max}명`;
  $('#panelExtra').innerHTML = '';
}

function leaveToLobby() {
  if (current.renderer && current.renderer.destroy) current.renderer.destroy();
  current.renderer = null; current.state = null; current.room = null;
  document.querySelector('.overlayWin')?.remove();
  document.body.classList.remove('inRoom');
  setUrl(null);
  $('#room').classList.add('hidden');
  $('#lobby').classList.remove('hidden');
}
$('#leaveBtn').onclick = () => { socket.emit('room:leave'); leaveToLobby(); };
$('#rulesBtn').onclick = () => current.room && showRules(current.room.gameId, current.room.gameName);

function startRenderer(gameId) {
  $('#board').innerHTML = '';
  $('#panelExtra').innerHTML = '';
  $('#rematchBtn').classList.add('hidden');
  document.querySelector('.overlayWin')?.remove();
  current.overShown = false;
  if (current.renderer && current.renderer.destroy) current.renderer.destroy();
  const make = renderers[gameId];
  current.renderer = make ? make({
    root: $('#board'), extra: $('#panelExtra'), status: $('#status'),
    send: (action, cb) => socket.emit('game:action', action, res => {
      if (res && res.error) toast(res.error); else if (cb) cb(res);
    }),
    toast
  }) : null;
}
socket.on('game:start', ({ gameId }) => startRenderer(gameId));

socket.on('game:state', ({ gameId, seat, state }) => {
  current.seat = seat; current.state = state; current.gameId = gameId;
  // (re)joining a game already in progress: no game:start was sent to us
  if (!current.renderer && renderers[gameId]) startRenderer(gameId);
  if (current.renderer) current.renderer.render(state, seat);
  const chips = document.querySelectorAll('#seatList .seat');
  chips.forEach((c, i) => c.classList.toggle('turn', !state.over && state.turn === i));
  if (state.over && !current.overShown) {
    current.overShown = true;
    $('#rematchBtn').classList.remove('hidden');
    setTimeout(() => showWin(state), 900);
  }
});

function showWin(state) {
  if (!current.room) return;
  document.querySelector('.overlayWin')?.remove();
  const meWon = state.winner != null && state.winner === current.seat;
  const draw = state.winner == null;
  const kind = draw ? 'draw' : meWon ? 'win' : current.seat >= 0 ? 'lose' : 'watch';
  const title = { win: '🏆 승리!', lose: '아쉬워요!', draw: '🤝 무승부', watch: '게임 종료' }[kind];
  const o = el('div', 'overlayWin ' + kind, `
    <div class="confetti">${kind === 'win' ? Array.from({ length: 40 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--d:${(Math.random() * 1.5).toFixed(2)}s;--c:${['#ffc861', '#ff6b6b', '#4da3ff', '#4ade80', '#c084fc'][i % 5]}"></i>`).join('') : ''}</div>
    <div class="winCard">
      <div class="wt">${title}</div>
      <div class="wr">${esc(state.result || '')}</div>
      <div class="wb">
        <button class="primary big" id="winRematch">🔁 한 판 더</button>
        <button class="ghost big" id="winView">판 보기</button>
        <button class="ghost big" id="winLeave">나가기</button>
      </div>
    </div>`);
  document.body.appendChild(o);
  o.querySelector('#winRematch').onclick = () => { socket.emit('room:rematch'); o.querySelector('#winRematch').textContent = '다른 사람을 기다리는 중…'; };
  o.querySelector('#winView').onclick = () => o.remove();
  o.querySelector('#winLeave').onclick = () => { o.remove(); $('#leaveBtn').click(); };
  if (kind === 'win') sfx.win();
}

$('#rematchBtn').onclick = () => socket.emit('room:rematch');
const syncMute = () => { $('#muteBtn').textContent = isMuted() ? '🔇' : '🔊'; };
$('#muteBtn').onclick = () => { setMuted(!isMuted()); syncMute(); };
syncMute();
socket.on('room:rematch-votes', ({ votes, need }) => {
  $('#rematchBtn').textContent = `한 판 더 (${votes}/${need})`;
  const b = document.querySelector('#winRematch');
  if (b) b.textContent = `🔁 한 판 더 (${votes}/${need})`;
});

// ---------------------------------------------------------------------- chat
let unread = 0;
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (!v) return;
  socket.emit('room:chat', v);
  $('#chatInput').value = '';
});
$('#chatBox').addEventListener('toggle', () => { if ($('#chatBox').open) { unread = 0; $('#chatBadge').classList.add('hidden'); } });
function addChat(m, live) {
  const log = $('#chatLog');
  const line = el('div');
  line.innerHTML = `<span class="nm"></span> <span class="tx"></span>`;
  line.querySelector('.nm').textContent = m.name + ':';
  line.querySelector('.tx').textContent = m.text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  if (live && !$('#chatBox').open) { unread++; $('#chatBadge').textContent = unread; $('#chatBadge').classList.remove('hidden'); }
}
socket.on('room:chat', m => addChat(m, true));
socket.on('room:chat-history', arr => { $('#chatLog').innerHTML = ''; arr.forEach(m => addChat(m, false)); });

// Opened without a saved name and without an invite link: ask once.
if (!myName && !pendingRoom) setTimeout(() => askName(), 300);
