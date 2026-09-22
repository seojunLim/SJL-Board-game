const COLOR_KO = { b: '검정', w: '흰색' };

export default function davinci(ctx) {
  const wrap = document.createElement('div');
  wrap.style.display = 'grid'; wrap.style.gap = '12px'; wrap.style.width = '100%';
  const rows = document.createElement('div'); rows.className = 'dvRows';
  const actions = document.createElement('div'); actions.className = 'guessBox';
  wrap.append(rows, actions); ctx.root.appendChild(wrap);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  let st = null, seat = -1;
  let pick = null;              // { target, index }
  let guessColor = null, guessValue = null;

  function tileEl(t, opts) {
    const d = document.createElement('div');
    d.className = 'tile ' + (t.color === 'b' ? 'b' : 'w');
    if (t.revealed) d.classList.add('revealed');
    if (!('v' in t)) { d.classList.add('hidden-t'); d.textContent = '?'; }
    else d.textContent = t.v === 12 ? '-' : t.v;
    if (opts && opts.pickable) {
      d.classList.add('pick');
      if (pick && pick.target === opts.target && pick.index === opts.index) d.classList.add('sel');
      d.onclick = opts.onClick;
    }
    return d;
  }

  function render() {
    rows.innerHTML = '';
    st.hands.forEach((hand, i) => {
      const box = document.createElement('div');
      box.className = 'dvRow' + (st.turn === i && !st.over ? ' turn' : '');
      const hd = document.createElement('div'); hd.className = 'hd';
      hd.innerHTML = `<span>${st.names[i]}${i === seat ? ' (나)' : ''}${st.out[i] ? ' — 탈락' : ''}</span>
        <span>${hand.filter(t => !t.revealed).length}장 비공개</span>`;
      const tl = document.createElement('div'); tl.className = 'tiles';
      hand.forEach((t, idx) => {
        const pickable = !st.over && st.phase === 'guess' && st.turn === seat && i !== seat && !t.revealed;
        const ownReveal = !st.over && st.phase === 'reveal-own' && st.turn === seat && i === seat && !t.revealed;
        tl.appendChild(tileEl(t, (pickable || ownReveal) ? {
          pickable: true, target: i, index: idx,
          onClick: () => {
            if (ownReveal) return ctx.send({ type: 'reveal-own', index: idx });
            pick = { target: i, index: idx }; render();
          }
        } : null));
      });
      box.append(hd, tl);
      rows.appendChild(box);
    });

    actions.innerHTML = '';
    const mine = st.turn === seat && !st.over;
    const drawnInfo = document.createElement('div');
    if (st.drawn) {
      drawnInfo.className = 'row';
      drawnInfo.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: '뽑은 타일: ' }));
      if (st.drawn.hidden) drawnInfo.append(tileEl({ color: 'b' }));
      else drawnInfo.append(tileEl(st.drawn));
      actions.appendChild(drawnInfo);
    }

    if (!mine) {
      actions.appendChild(Object.assign(document.createElement('div'), {
        className: 'muted',
        textContent: st.over ? (st.result || '') : `${st.names[st.turn]}의 차례를 기다리는 중…`
      }));
    } else if (st.phase === 'draw') {
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = `타일 뽑기 (남은 ${st.poolLeft}장)`;
      b.onclick = () => ctx.send({ type: 'draw' });
      actions.appendChild(b);
    } else if (st.phase === 'guess') {
      const hint = document.createElement('div');
      hint.className = 'muted';
      hint.textContent = pick
        ? `${st.names[pick.target]}의 ${pick.index + 1}번째 타일 — 색과 숫자를 고르세요.`
        : '상대의 비공개 타일을 클릭해 고르세요.';
      actions.appendChild(hint);
      if (pick) {
        const colorRow = document.createElement('div'); colorRow.className = 'row';
        for (const c of ['b', 'w']) {
          const b = document.createElement('button');
          b.textContent = COLOR_KO[c];
          b.className = guessColor === c ? 'primary' : '';
          b.onclick = () => { guessColor = c; render(); };
          colorRow.appendChild(b);
        }
        const nums = document.createElement('div'); nums.className = 'numGrid';
        for (let v = 0; v <= 11; v++) {
          const b = document.createElement('button');
          b.textContent = v;
          b.className = guessValue === v ? 'primary' : '';
          b.onclick = () => { guessValue = v; render(); };
          nums.appendChild(b);
        }
        const jk = document.createElement('button'); jk.textContent = '조커(-)';
        jk.className = guessValue === 'joker' ? 'primary' : '';
        jk.onclick = () => { guessValue = 'joker'; render(); };
        nums.appendChild(jk);
        const go = document.createElement('button'); go.className = 'primary'; go.textContent = '추측!';
        go.disabled = !guessColor || guessValue == null;
        go.onclick = () => {
          const place = askPlace();
          ctx.send({ type: 'guess', target: pick.target, index: pick.index, color: guessColor, value: guessValue, place });
          pick = null; guessColor = null; guessValue = null;
        };
        actions.append(colorRow, nums, go);
      }
    } else if (st.phase === 'continue') {
      const info = document.createElement('div');
      info.textContent = '적중! 계속 추측하거나, 턴을 마치고 뽑은 타일을 비공개로 놓을 수 있습니다.';
      const cont = document.createElement('button'); cont.className = 'primary'; cont.textContent = '계속 추측';
      cont.onclick = () => ctx.send({ type: 'continue' });
      const stop = document.createElement('button'); stop.textContent = '턴 종료';
      stop.onclick = () => ctx.send({ type: 'stop', place: askPlace() });
      const row = document.createElement('div'); row.className = 'row'; row.append(cont, stop);
      actions.append(info, row);
    } else if (st.phase === 'reveal-own') {
      actions.appendChild(Object.assign(document.createElement('div'), {
        textContent: '추측이 틀렸고 뽑을 타일이 없습니다. 자신의 타일 하나를 클릭해 공개하세요.'
      }));
    }

    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${st.names[st.turn]}</b><br>남은 타일 ${st.poolLeft}장<br>
         <span class="muted">같은 숫자는 검정이 왼쪽, 조커(-)는 어디든 놓을 수 있습니다.</span>`;

    log.innerHTML = '';
    st.log.forEach(l => log.appendChild(Object.assign(document.createElement('div'), { textContent: l })));
    log.scrollTop = log.scrollHeight;
  }

  // Jokers may be inserted at any position in your own row.
  function askPlace() {
    if (!st.drawn || st.drawn.hidden || st.drawn.v !== 12) return -1;
    const n = st.hands[seat].length;
    const a = prompt(`조커를 놓을 위치를 고르세요 (0 = 맨 왼쪽 … ${n} = 맨 오른쪽)`, String(n));
    const v = Number(a);
    return Number.isInteger(v) && v >= 0 && v <= n ? v : -1;
  }

  return {
    render(state, mySeat) { st = state; seat = mySeat; render(); },
    destroy() { ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
