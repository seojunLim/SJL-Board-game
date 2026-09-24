const SYM = { skip: '⊘', rev: '⇄', d2: '+2', wild: '★', wd4: '+4' };
const COLOR_KO = { r: '빨강', y: '노랑', g: '초록', b: '파랑' };

export default function uno(ctx) {
  const wrap = document.createElement('div'); wrap.className = 'unoWrap';
  wrap.innerHTML = `
    <div class="unoOpps"></div>
    <div class="unoCenter">
      <div class="unoPile"><div class="drawPile"></div><span class="drawLbl"></span></div>
      <div class="unoDir"></div>
      <div class="unoPile"><div class="topCard"></div><span>버린 더미</span></div>
      <div class="unoColorWrap unoPile"><div class="unoColor"></div><span class="colName"></span></div>
    </div>
    <div class="unoHand"></div>
    <div class="unoActions"></div>`;
  ctx.root.appendChild(wrap);
  const opps = wrap.querySelector('.unoOpps');
  const drawPile = wrap.querySelector('.drawPile');
  const drawLbl = wrap.querySelector('.drawLbl');
  const dirEl = wrap.querySelector('.unoDir');
  const topEl = wrap.querySelector('.topCard');
  const colorEl = wrap.querySelector('.unoColor');
  const colName = wrap.querySelector('.colName');
  const handEl = wrap.querySelector('.unoHand');
  const actions = wrap.querySelector('.unoActions');
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  let st = null, seat = -1;

  function cardEl(card, small) {
    const d = document.createElement('div');
    d.className = 'ucard ' + card.color + (small ? ' small' : '');
    const inner = card.kind === 'num' ? String(card.value) : (SYM[card.kind] || '?');
    d.innerHTML = `<span class="sym">${inner}</span>`;
    return d;
  }

  function pickColor() {
    return new Promise(res => {
      const modal = document.createElement('div'); modal.className = 'colorPick';
      modal.innerHTML = `<div class="box"><strong>색을 선택하세요</strong>
        <div class="swatches">
          <div class="sw r" data-c="r"></div><div class="sw y" data-c="y"></div>
          <div class="sw g" data-c="g"></div><div class="sw b" data-c="b"></div>
        </div></div>`;
      modal.addEventListener('click', e => {
        const sw = e.target.closest('.sw');
        if (sw) { modal.remove(); res(sw.dataset.c); }
        else if (e.target === modal) { modal.remove(); res(null); }
      });
      document.body.appendChild(modal);
    });
  }

  async function playCard(i, card) {
    if (card.kind === 'wild' || card.kind === 'wd4') {
      const c = await pickColor();
      if (!c) return;
      ctx.send({ type: 'play', index: i, chosenColor: c });
    } else ctx.send({ type: 'play', index: i });
  }

  function render(state, mySeat) {
    st = state; seat = mySeat;

    // opponents (everyone except me, in seating order starting after me)
    opps.innerHTML = '';
    for (let k = 1; k < st.n; k++) {
      const i = (seat >= 0 ? seat + k : k) % st.n;
      const o = document.createElement('div');
      o.className = 'unoOpp' + (st.turn === i ? ' turn' : '');
      o.innerHTML = `<div>${st.names[i]}</div><div class="cnt">${st.counts[i]}</div>
        <div class="muted">${st.counts[i] === 1 ? (st.pendingUno[i] ? '⚠ UNO 미선언' : 'UNO') : '장'}</div>`;
      if (st.catchable[i]) {
        const b = document.createElement('button'); b.className = 'catch primary'; b.textContent = '잡기!';
        b.onclick = () => ctx.send({ type: 'catch', target: i });
        o.appendChild(b);
      }
      opps.appendChild(o);
    }

    drawPile.className = 'ucard w drawPile'; drawPile.innerHTML = '<span class="sym">UNO</span>';
    drawPile.style.cursor = st.canDraw ? 'pointer' : 'default';
    drawPile.onclick = () => { if (st.canDraw) ctx.send({ type: 'draw' }); };
    drawLbl.textContent = `뽑기 (${st.deckLeft})`;
    dirEl.textContent = st.dir === 1 ? '⟳' : '⟲';
    topEl.className = 'ucard ' + st.top.color + ' topCard';
    topEl.innerHTML = `<span class="sym">${st.top.kind === 'num' ? st.top.value : (SYM[st.top.kind] || '?')}</span>`;
    colorEl.style.background = { r: '#e0402f', y: '#f0c02a', g: '#3fa04a', b: '#3877d0' }[st.color] || '#888';
    colName.textContent = '현재 색: ' + (COLOR_KO[st.color] || '-');

    handEl.innerHTML = '';
    if (seat >= 0) st.hand.forEach((card, i) => {
      const d = cardEl(card);
      if (card.playable) { d.classList.add('play'); d.onclick = () => playCard(i, card); }
      else if (seat === st.turn) d.classList.add('dim');
      handEl.appendChild(d);
    });

    actions.innerHTML = '';
    if (st.canPass) {
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = '패스 (뽑은 카드 안 냄)';
      b.onclick = () => ctx.send({ type: 'pass' });
      actions.appendChild(b);
    }
    if (st.needUno) {
      const b = document.createElement('button'); b.className = 'unoBtn uno'; b.textContent = 'UNO!';
      b.onclick = () => ctx.send({ type: 'uno' });
      actions.appendChild(b);
    }

    const my = seat >= 0 ? st.names[seat] : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${st.names[st.turn]}</b> ${st.dir === 1 ? '⟳' : '⟲'}<br>나: ${my} · 내 카드 ${seat >= 0 ? st.counts[seat] : '-'}장<br>
         현재 색 <b>${COLOR_KO[st.color] || '-'}</b><br>
         <span class="muted">${st.turn === seat ? (st.canPass ? '낼 수 있으면 내거나 패스하세요.' : '낼 카드를 클릭하거나 더미에서 뽑으세요.') : '상대 차례…'}</span>`;

    log.innerHTML = '';
    st.log.forEach(l => log.appendChild(Object.assign(document.createElement('div'), { textContent: l })));
    log.scrollTop = log.scrollHeight;
  }

  return {
    render,
    destroy() { ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; document.querySelector('.colorPick')?.remove(); }
  };
}
