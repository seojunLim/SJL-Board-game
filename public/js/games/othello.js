export default function othello(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '10px'; wrap.style.justifyItems = 'center';
  const boardEl = document.createElement('div'); boardEl.className = 'othello';
  const bar = document.createElement('div'); bar.className = 'row';
  wrap.append(boardEl, bar); ctx.root.appendChild(wrap);
  ctx.extra.innerHTML = '';

  const passB = document.createElement('button'); passB.textContent = '패스'; passB.className = 'primary';
  passB.onclick = () => ctx.send({ type: 'pass' });
  const resign = document.createElement('button'); resign.textContent = '기권'; resign.className = 'ghost';
  resign.onclick = () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); };
  bar.append(passB, resign);

  let st = null, seat = -1;

  function draw() {
    boardEl.innerHTML = '';
    const legal = new Set((st.legal || []).map(m => m.r + ',' + m.c));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const v = st.board[r][c];
      if (v) {
        const d = document.createElement('div');
        d.className = 'disc ' + (v === 1 ? 'b' : 'w');
        cell.appendChild(d);
      } else if (legal.has(r + ',' + c)) cell.classList.add('legal');
      if (st.lastMove && st.lastMove.r === r && st.lastMove.c === c) cell.classList.add('last');
      cell.onclick = () => { if (!st.over && st.turn === seat) ctx.send({ type: 'place', r, c }); };
      boardEl.appendChild(cell);
    }
    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}<br>흑 ${st.counts.black} : 백 ${st.counts.white}`
      : `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>
         흑 ${st.counts.black} : 백 ${st.counts.white}<br>
         <span class="muted">${st.turn === seat ? (st.mustPass ? '둘 곳이 없습니다 — 패스하세요.' : '놓을 자리를 고르세요.') : '상대를 기다리는 중…'}</span>`;
    passB.disabled = st.over || st.turn !== seat || !st.mustPass;
    resign.disabled = st.over || seat < 0;
  }

  return {
    render(state, mySeat) { st = state; seat = mySeat; draw(); },
    destroy() { ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
