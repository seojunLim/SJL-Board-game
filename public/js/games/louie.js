export default function louie(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '12px'; wrap.style.justifyItems = 'center'; wrap.style.width = '100%';
  const chickens = document.createElement('div'); chickens.className = 'chickenRow';
  const holder = document.createElement('div'); holder.className = 'louieWrap';
  const canvas = document.createElement('canvas'); holder.appendChild(canvas);
  const btn = document.createElement('button'); btn.className = 'flickBtn'; btn.textContent = '레버 치기! (Space)';
  wrap.append(chickens, holder, btn);
  ctx.root.appendChild(wrap);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  let st = null, seat = -1, raf = 0, lastLocal = 0;

  const flick = () => { if (st && !st.over && seat >= 0) ctx.send({ type: 'flick' }); };
  btn.onclick = flick;
  const onKey = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flick(); }
  };
  window.addEventListener('keydown', onKey);
  holder.addEventListener('pointerdown', flick);

  // Smooth the server angle locally between state pushes.
  let shownAngle = 0, targetAngle = 0, dir = 1, speed = 0, lastFrame = performance.now();

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(100, now - lastFrame) / 1000; lastFrame = now;
    if (!st) return;
    if (!st.over && st.startsIn <= 0) shownAngle = (shownAngle + dir * speed * dt + 360) % 360;
    // gently pull toward the authoritative angle
    let d = ((targetAngle - shownAngle + 540) % 360) - 180;
    shownAngle = (shownAngle + d * Math.min(1, dt * 6) + 360) % 360;
    paint();
  }

  function paint() {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(Math.min(holder.clientWidth, 640) * dpr);
    if (canvas.width !== size) canvas.width = canvas.height = size;
    const g = canvas.getContext('2d');
    const R = size / 2, cx = R, cy = R;
    g.clearRect(0, 0, size, size);

    // track
    g.strokeStyle = '#3c5a78'; g.lineWidth = size * 0.055;
    g.beginPath(); g.arc(cx, cy, R * 0.62, 0, Math.PI * 2); g.stroke();

    // stations
    st.stations.forEach((ang, i) => {
      const rad = (ang - 90) * Math.PI / 180;
      const x = cx + Math.cos(rad) * R * 0.78, y = cy + Math.sin(rad) * R * 0.78;
      const alive = st.chickens[i] > 0;
      g.save(); g.translate(x, y); g.rotate(rad + Math.PI / 2);
      g.fillStyle = i === seat ? '#4da3ff' : alive ? '#42627f' : '#2a343d';
      g.globalAlpha = alive ? 1 : .4;
      g.fillRect(-size * 0.075, -size * 0.03, size * 0.15, size * 0.06);
      // lever
      const up = st.lever[i] && st.lever[i].up;
      g.fillStyle = up ? '#ffd35c' : st.lever[i] && st.lever[i].cool ? '#7a4a4a' : '#8fa6b8';
      g.fillRect(-size * 0.012, up ? -size * 0.11 : -size * 0.055, size * 0.024, size * 0.06);
      g.restore();
      g.globalAlpha = 1;
      // chickens + name
      g.fillStyle = '#e8eef4'; g.textAlign = 'center';
      g.font = `${Math.round(size * 0.035)}px sans-serif`;
      const lx = cx + Math.cos(rad) * R * 0.94, ly = cy + Math.sin(rad) * R * 0.94;
      g.fillText(st.names[i], lx, ly);
      g.fillText('🐔'.repeat(Math.max(0, st.chickens[i])) || '💀', lx, ly + size * 0.04);
    });

    // plane
    const prad = (shownAngle - 90) * Math.PI / 180;
    const px = cx + Math.cos(prad) * R * 0.62, py = cy + Math.sin(prad) * R * 0.62;
    g.save(); g.translate(px, py); g.rotate(prad + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
    g.font = `${Math.round(size * 0.09)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('✈️', 0, 0);
    g.restore();

    // centre
    g.fillStyle = '#e8eef4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (st.startsIn > 0) {
      g.font = `bold ${Math.round(size * 0.14)}px sans-serif`;
      g.fillText(Math.ceil(st.startsIn / 1000), cx, cy);
    } else if (st.over) {
      g.font = `bold ${Math.round(size * 0.07)}px sans-serif`;
      g.fillText(st.result || '종료', cx, cy);
    }
  }

  function render(state, mySeat) {
    st = state; seat = mySeat;
    targetAngle = st.angle; dir = st.dir; speed = st.speed;
    if (!raf) { shownAngle = st.angle; lastFrame = performance.now(); raf = requestAnimationFrame(loop); }
    chickens.innerHTML = '';
    for (let i = 0; i < st.n; i++) {
      const c = document.createElement('div');
      c.className = 'c' + (i === seat ? ' me' : '') + (st.chickens[i] <= 0 ? ' dead' : '');
      c.textContent = `${st.names[i]} ${'🐔'.repeat(Math.max(0, st.chickens[i]))}`;
      chickens.appendChild(c);
    }
    const cool = st.lever[seat] && st.lever[seat].cool;
    btn.disabled = st.over || seat < 0;
    btn.textContent = st.over ? '게임 종료' : cool ? '레버 재장전 중…' : '레버 치기! (Space)';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : st.startsIn > 0
        ? `<b>${Math.ceil(st.startsIn / 1000)}초 후 시작!</b><br><span class="muted">루이가 내 자리에 오는 순간 레버를 치세요.</span>`
        : `속도 <b>${Math.round(st.speed)}</b>°/s<br>남은 닭: ${st.chickens[seat] != null ? st.chickens[seat] : '-'}<br>
           <span class="muted">너무 일찍 치면 재장전에 걸립니다.</span>`;
    log.innerHTML = '';
    st.log.forEach(l => log.appendChild(Object.assign(document.createElement('div'), { textContent: l })));
    log.scrollTop = log.scrollHeight;
  }

  return {
    render,
    destroy() {
      cancelAnimationFrame(raf); raf = 0;
      window.removeEventListener('keydown', onKey);
      ctx.root.innerHTML = ''; ctx.extra.innerHTML = '';
    }
  };
}
