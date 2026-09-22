const FRUIT_EMOJI = { banana: '🍌', strawberry: '🍓', lime: '🍋', plum: '🫐' };

export default function halligalli(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '14px'; wrap.style.justifyItems = 'center'; wrap.style.width = '100%';
  const totals = document.createElement('div'); totals.className = 'totals';
  const table = document.createElement('div'); table.className = 'hgTable';
  const controls = document.createElement('div'); controls.className = 'row';
  controls.style.justifyContent = 'center';
  const bell = document.createElement('button'); bell.className = 'bell'; bell.textContent = '🔔';
  const flip = document.createElement('button'); flip.className = 'primary'; flip.textContent = '카드 뒤집기 (F)';
  flip.style.padding = '18px 26px'; flip.style.fontSize = '18px';
  controls.append(flip, bell);
  wrap.append(totals, table, controls);
  ctx.root.appendChild(wrap);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  let st = null, seat = -1, lastFlash = 0;

  flip.onclick = () => ctx.send({ type: 'flip' });
  bell.onclick = () => ctx.send({ type: 'bell' });
  const onKey = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); ctx.send({ type: 'bell' }); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); ctx.send({ type: 'flip' }); }
  };
  window.addEventListener('keydown', onKey);

  function cardFace(card) {
    const d = document.createElement('div');
    if (!card) { d.className = 'card empty'; d.textContent = '없음'; return d; }
    d.className = 'card';
    for (let i = 0; i < card.n; i++) {
      const s = document.createElement('span'); s.className = 'f';
      s.textContent = FRUIT_EMOJI[card.fruit] || '🍎';
      d.appendChild(s);
    }
    return d;
  }

  function render() {
    totals.innerHTML = '';
    for (const f of Object.keys(st.totals)) {
      const t = document.createElement('div');
      t.className = 't' + (st.totals[f] === 5 ? ' five' : '');
      t.textContent = `${FRUIT_EMOJI[f]} ${st.totals[f]}`;
      totals.appendChild(t);
    }
    table.innerHTML = '';
    for (let i = 0; i < st.n; i++) {
      const s = document.createElement('div');
      s.className = 'hgSeat' + (st.turn === i && !st.over ? ' turn' : '') + (st.out[i] ? ' out' : '');
      const nm = document.createElement('div');
      nm.innerHTML = `<b>${st.names[i]}${i === seat ? ' (나)' : ''}</b>`;
      s.appendChild(nm);
      s.appendChild(cardFace(st.up[i].top));
      s.appendChild(Object.assign(document.createElement('div'), {
        className: 'muted',
        textContent: `뒷면 ${st.downCounts[i]}장 · 앞면 ${st.up[i].size}장`
      }));
      table.appendChild(s);
    }
    flip.disabled = st.over || st.turn !== seat || seat < 0;
    bell.disabled = st.over || seat < 0;

    if (st.flash && st.flash.t !== lastFlash) {
      lastFlash = st.flash.t;
      if (st.flash.type === 'bell-good') { bell.classList.add('flash-good'); setTimeout(() => bell.classList.remove('flash-good'), 500); }
      if (st.flash.type === 'bell-bad') { bell.classList.add('flash-bad'); setTimeout(() => bell.classList.remove('flash-bad'), 500); }
    }

    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${st.names[st.turn]}</b><br>나: ${seat >= 0 ? st.names[seat] : '관전'}<br>
         <span class="muted">F = 카드 뒤집기 · Space = 종 치기<br>같은 과일이 <b>정확히 5개</b> 보이면 종을 치세요!</span>`;

    log.innerHTML = '';
    st.log.forEach(l => log.appendChild(Object.assign(document.createElement('div'), { textContent: l })));
    log.scrollTop = log.scrollHeight;
  }

  return {
    render(state, mySeat) { st = state; seat = mySeat; render(); },
    destroy() { window.removeEventListener('keydown', onKey); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
