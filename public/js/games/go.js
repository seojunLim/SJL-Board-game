export default function go(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '10px'; wrap.style.justifyItems = 'center';
  const holder = document.createElement('div'); holder.className = 'goboard';
  const canvas = document.createElement('canvas');
  holder.appendChild(canvas);
  const bar = document.createElement('div'); bar.className = 'row';
  wrap.append(holder, bar); ctx.root.appendChild(wrap);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const passB = document.createElement('button'); passB.textContent = '패스'; passB.className = 'primary';
  passB.onclick = () => ctx.send({ type: 'pass' });
  const acceptB = document.createElement('button'); acceptB.textContent = '계가 동의'; acceptB.className = 'primary hidden';
  acceptB.onclick = () => ctx.send({ type: 'accept-score' });
  const resumeB = document.createElement('button'); resumeB.textContent = '대국 재개'; resumeB.className = 'ghost hidden';
  resumeB.onclick = () => ctx.send({ type: 'resume' });
  const resign = document.createElement('button'); resign.textContent = '기권'; resign.className = 'ghost';
  resign.onclick = () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); };
  bar.append(passB, acceptB, resumeB, resign);

  let st = null, seat = -1, hover = null;

  function geom() {
    const px = canvas.width;
    const pad = px / (st.n + 1);
    const step = (px - pad * 2) / (st.n - 1);
    return { pad, step, r: step * 0.46 };
  }
  function toXY(r, c) { const g = geom(); return [g.pad + c * g.step, g.pad + r * g.step]; }
  function fromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * scale, y = (e.clientY - rect.top) * scale;
    const g = geom();
    const c = Math.round((x - g.pad) / g.step), r = Math.round((y - g.pad) / g.step);
    if (r < 0 || c < 0 || r >= st.n || c >= st.n) return null;
    const [px, py] = toXY(r, c);
    if (Math.hypot(px - x, py - y) > g.step * 0.62) return null;
    return { r, c };
  }

  function starPoints(n) {
    if (n === 19) return [3, 9, 15];
    if (n === 13) return [3, 6, 9];
    if (n === 9) return [2, 4, 6];
    return [];
  }

  function draw() {
    if (!st) return;
    const size = Math.min(holder.clientWidth, 900) * (window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(size)) { canvas.width = canvas.height = Math.round(size); }
    const g2 = canvas.getContext('2d');
    const px = canvas.width;
    const g = geom();
    g2.clearRect(0, 0, px, px);
    g2.strokeStyle = '#3c2b17'; g2.lineWidth = Math.max(1, px / 700);
    for (let i = 0; i < st.n; i++) {
      const p = g.pad + i * g.step;
      g2.beginPath(); g2.moveTo(g.pad, p); g2.lineTo(px - g.pad, p); g2.stroke();
      g2.beginPath(); g2.moveTo(p, g.pad); g2.lineTo(p, px - g.pad); g2.stroke();
    }
    g2.fillStyle = '#3c2b17';
    for (const a of starPoints(st.n)) for (const b of starPoints(st.n)) {
      const [x, y] = toXY(a, b);
      g2.beginPath(); g2.arc(x, y, Math.max(2, g.step * 0.09), 0, 7); g2.fill();
    }
    const deadSet = new Set(st.dead || []);
    for (let r = 0; r < st.n; r++) for (let c = 0; c < st.n; c++) {
      const v = st.board[r][c];
      if (!v) continue;
      const [x, y] = toXY(r, c);
      const dead = deadSet.has(r + ',' + c);
      g2.globalAlpha = dead ? 0.3 : 1;
      const grd = g2.createRadialGradient(x - g.r * .35, y - g.r * .4, g.r * .1, x, y, g.r);
      if (v === 1) { grd.addColorStop(0, '#5a5a5a'); grd.addColorStop(1, '#080808'); }
      else { grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#c2c2c2'); }
      g2.fillStyle = grd;
      g2.beginPath(); g2.arc(x, y, g.r, 0, 7); g2.fill();
      g2.globalAlpha = 1;
      if (st.lastMove && st.lastMove.r === r && st.lastMove.c === c) {
        g2.strokeStyle = '#ff5252'; g2.lineWidth = Math.max(2, px / 320);
        g2.beginPath(); g2.arc(x, y, g.r * 0.45, 0, 7); g2.stroke();
      }
    }
    if (hover && !st.over && st.phase === 'play' && st.turn === seat && !st.board[hover.r][hover.c]) {
      const [x, y] = toXY(hover.r, hover.c);
      g2.globalAlpha = 0.45;
      g2.fillStyle = seat === 0 ? '#000' : '#fff';
      g2.beginPath(); g2.arc(x, y, g.r, 0, 7); g2.fill();
      g2.globalAlpha = 1;
    }

    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    let s;
    if (st.over) s = `<b>게임 종료</b><br>${st.result}`;
    else if (st.phase === 'scoring') {
      const si = st.scoreInfo || { black: 0, white: 0 };
      s = `<b>계가 중</b><br>죽은 돌을 클릭해 표시한 뒤 동의하세요.<br>
        흑 ${si.black} : 백 ${si.white} (덤 ${st.komi})<br>
        <span class="muted">동의: ${st.scoreAccept.map((a, i) => (i === 0 ? '흑' : '백') + (a ? '✅' : '⬜')).join(' ')}</span>`;
    } else {
      s = `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>
        따낸 돌 — 흑 ${st.captures[0]} / 백 ${st.captures[1]}<br>덤 ${st.komi}`;
    }
    ctx.status.innerHTML = s;
    passB.classList.toggle('hidden', st.phase !== 'play');
    passB.disabled = st.over || st.turn !== seat;
    acceptB.classList.toggle('hidden', st.phase !== 'scoring' || st.over);
    acceptB.disabled = seat < 0 || (st.scoreAccept && st.scoreAccept[seat]);
    resumeB.classList.toggle('hidden', st.phase !== 'scoring' || st.over);
    resign.disabled = st.over || seat < 0;

    log.innerHTML = '';
    st.history.slice(-60).forEach((h, i) => log.appendChild(Object.assign(document.createElement('div'), { textContent: h })));
    log.scrollTop = log.scrollHeight;
  }

  canvas.addEventListener('mousemove', e => { const p = fromEvent(e); const ch = JSON.stringify(p) !== JSON.stringify(hover); hover = p; if (ch) draw(); });
  canvas.addEventListener('mouseleave', () => { hover = null; draw(); });
  canvas.addEventListener('click', e => {
    const p = fromEvent(e);
    if (!p || !st || st.over) return;
    if (st.phase === 'scoring') ctx.send({ type: 'toggle-dead', r: p.r, c: p.c });
    else if (st.turn === seat) ctx.send({ type: 'place', r: p.r, c: p.c });
  });
  const onResize = () => draw();
  window.addEventListener('resize', onResize);

  return {
    render(state, mySeat) { st = state; seat = mySeat; draw(); },
    destroy() { window.removeEventListener('resize', onResize); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
