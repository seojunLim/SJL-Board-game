const GLYPH = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };

export default function chess(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '10px'; wrap.style.justifyItems = 'center';
  const boardEl = document.createElement('div');
  boardEl.className = 'chessboard';
  const bar = document.createElement('div'); bar.className = 'row';
  wrap.appendChild(boardEl); wrap.appendChild(bar);
  ctx.root.appendChild(wrap);

  const moves = document.createElement('div'); moves.className = 'log moves';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(moves);

  let st = null, seat = -1, sel = null, flip = false, flipInit = false;

  const resign = document.createElement('button'); resign.textContent = '기권'; resign.className = 'ghost';
  resign.onclick = () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); };
  const drawB = document.createElement('button'); drawB.textContent = '무승부 제안'; drawB.className = 'ghost';
  drawB.onclick = () => ctx.send({ type: 'draw-offer' });
  const flipB = document.createElement('button'); flipB.textContent = '판 뒤집기'; flipB.className = 'ghost';
  flipB.onclick = () => { flip = !flip; draw(); };
  bar.append(resign, drawB, flipB);

  function movesFrom(r, c) {
    return (st.legal || []).filter(m => m.from[0] === r && m.from[1] === c);
  }

  function click(r, c) {
    if (!st || st.over || st.turn !== seat) return;
    if (sel && sel[0] === r && sel[1] === c) { sel = null; return draw(); }
    const opts = sel ? movesFrom(sel[0], sel[1]).filter(m => m.to[0] === r && m.to[1] === c) : [];
    if (opts.length) {
      let promo = null;
      if (opts.some(m => m.promo)) {
        const ans = prompt('승격할 기물을 고르세요: q(퀸) r(룩) b(비숍) n(나이트)', 'q');
        if (!ans) return;
        promo = String(ans).trim().toLowerCase();
        if (!['q','r','b','n'].includes(promo)) promo = 'q';
      }
      ctx.send({ type: 'move', from: sel, to: [r, c], promo });
      sel = null; return draw();
    }
    if (movesFrom(r, c).length) { sel = [r, c]; return draw(); }
    sel = null; draw();
  }

  function draw() {
    if (!st) return;
    boardEl.innerHTML = '';
    const rows = flip ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const cols = flip ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
    const hints = sel ? movesFrom(sel[0], sel[1]) : [];
    for (const r of rows) for (const c of cols) {
      const sq = document.createElement('div');
      sq.className = 'sq ' + ((r + c) % 2 === 0 ? 'l' : 'd');
      const p = st.board[r][c];
      if (p !== '.') sq.textContent = GLYPH[p];
      if (sel && sel[0] === r && sel[1] === c) sq.classList.add('sel');
      if (st.lastMove && ((st.lastMove.from[0] === r && st.lastMove.from[1] === c) ||
        (st.lastMove.to[0] === r && st.lastMove.to[1] === c))) sq.classList.add('last');
      const h = hints.find(m => m.to[0] === r && m.to[1] === c);
      if (h) {
        const dot = document.createElement('span');
        dot.className = 'hint' + (p !== '.' || h.ep ? ' cap' : '');
        sq.appendChild(dot);
      }
      if (st.check && p === (st.side === 'w' ? 'K' : 'k')) sq.classList.add('chk');
      sq.onclick = () => click(r, c);
      boardEl.appendChild(sq);
    }

    const turnName = st.turn === 0 ? '백' : '흑';
    const myName = seat === 0 ? '백' : seat === 1 ? '흑' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${turnName}</b>${st.check ? ' · 체크!' : ''}<br>
         나: ${myName}<br><span class="muted">${st.fullmove}수째 · 50수 규칙 ${st.halfmove}/100</span>`;

    moves.innerHTML = '';
    for (let i = 0; i < st.history.length; i += 2) {
      const s = document.createElement('div');
      s.innerHTML = `<span>${i / 2 + 1}.</span> <span>${st.history[i] || ''}</span> <span>${st.history[i + 1] || ''}</span>`;
      moves.appendChild(s);
    }
    moves.scrollTop = moves.scrollHeight;
    resign.disabled = st.over || seat < 0;
    drawB.disabled = st.over || seat < 0;
  }

  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (!flipInit) { flip = seat === 1; flipInit = true; }
      draw();
    },
    destroy() { ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
