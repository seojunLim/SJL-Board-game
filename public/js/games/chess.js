import { Stage, THREE } from '../three3d/scene.js';
import { buildPiece } from '../three3d/pieces.js';

const sqWorld = (r, c) => [c - 3.5, r - 3.5];   // (r,c) -> (x, z)

export default function chess(ctx) {
  const holder = document.createElement('div');
  holder.style.width = '100%';
  const bar = document.createElement('div'); bar.className = 'row'; bar.style.marginTop = '10px';
  ctx.root.appendChild(holder); ctx.root.appendChild(bar);
  const moves = document.createElement('div'); moves.className = 'log moves';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(moves);

  const stage = new Stage(holder, { radius: 11, minR: 7, maxR: 18, phi: 0.82, targetY: -0.1 });

  // Board + frame ---------------------------------------------------------
  const boardGroup = new THREE.Group();
  stage.scene.add(boardGroup);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.6, metalness: 0.1 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.5, 9.2), frameMat);
  frame.position.y = -0.3; frame.receiveShadow = true; boardGroup.add(frame);

  const lightMat = new THREE.MeshStandardMaterial({ color: 0xead8b6, roughness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0xa5733f, roughness: 0.55 });
  const tiles = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 1), (r + c) % 2 === 0 ? lightMat : darkMat);
    const [x, z] = sqWorld(r, c);
    t.position.set(x, -0.02, z);
    t.receiveShadow = true;
    t.userData.pick = { r, c };
    boardGroup.add(t); tiles.push(t);
  }

  // Piece materials -------------------------------------------------------
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf3ede0, roughness: 0.35, metalness: 0.05 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.4, metalness: 0.15 });

  // Highlight overlays ----------------------------------------------------
  const overlays = new THREE.Group(); stage.scene.add(overlays);
  const selMat = new THREE.MeshBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.55 });
  const moveMat = new THREE.MeshBasicMaterial({ color: 0x2e7d32, transparent: true, opacity: 0.7 });
  const capMat = new THREE.MeshBasicMaterial({ color: 0xd23b3b, transparent: true, opacity: 0.7 });
  const lastMat = new THREE.MeshBasicMaterial({ color: 0xffcf4d, transparent: true, opacity: 0.4 });
  const chkMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.55 });

  let st = null, seat = -1, sel = null;
  let pieces = [];               // { mesh, r, c }
  const tween = { mesh: null, from: null, to: null, t0: 0, dur: 200 };

  stage.tick = () => {
    if (tween.mesh) {
      const k = Math.min(1, (performance.now() - tween.t0) / tween.dur);
      const e = 1 - Math.pow(1 - k, 3);
      tween.mesh.position.x = tween.from[0] + (tween.to[0] - tween.from[0]) * e;
      tween.mesh.position.z = tween.from[1] + (tween.to[1] - tween.from[1]) * e;
      tween.mesh.position.y = Math.sin(k * Math.PI) * 0.35;
      if (k >= 1) { tween.mesh.position.y = 0; tween.mesh = null; }
    }
  };

  function movesFrom(r, c) { return (st.legal || []).filter(m => m.from[0] === r && m.from[1] === c); }

  function rebuildPieces() {
    for (const p of pieces) stage.scene.remove(p.mesh);
    pieces = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const ch = st.board[r][c];
      if (ch === '.') continue;
      const white = ch === ch.toUpperCase();
      const mesh = buildPiece(ch.toLowerCase(), white ? whiteMat : blackMat);
      const [x, z] = sqWorld(r, c);
      mesh.position.set(x, 0, z);
      mesh.userData.pick = { r, c };
      mesh.scale.setScalar(1.15);
      stage.scene.add(mesh);
      pieces.push({ mesh, r, c });
    }
    // Animate the piece that just moved.
    if (st.lastMove) {
      const p = pieces.find(p => p.r === st.lastMove.to[0] && p.c === st.lastMove.to[1]);
      if (p) {
        tween.mesh = p.mesh;
        tween.from = sqWorld(st.lastMove.from[0], st.lastMove.from[1]);
        tween.to = sqWorld(st.lastMove.to[0], st.lastMove.to[1]);
        tween.t0 = performance.now();
      }
    }
    stage.setPickables([...tiles, ...pieces.map(p => p.mesh)]);
  }

  function ring(mat) {
    const g = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 12, 32), mat);
    g.rotation.x = Math.PI / 2; return g;
  }
  function disc(mat) {
    const g = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), mat); return g;
  }
  function tile(mat) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 1), mat); return g;
  }

  function drawOverlays() {
    overlays.clear();
    const add = (mesh, r, c, y) => { const [x, z] = sqWorld(r, c); mesh.position.set(x, y ?? 0.08, z); overlays.add(mesh); };
    if (st.lastMove) { add(tile(lastMat), st.lastMove.from[0], st.lastMove.from[1], 0.05); add(tile(lastMat), st.lastMove.to[0], st.lastMove.to[1], 0.05); }
    if (st.check) {
      const k = st.side === 'w' ? 'K' : 'k';
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c] === k) add(tile(chkMat), r, c, 0.055);
    }
    if (sel) {
      add(tile(selMat), sel[0], sel[1], 0.06);
      for (const m of movesFrom(sel[0], sel[1])) {
        const cap = st.board[m.to[0]][m.to[1]] !== '.' || m.ep;
        add(cap ? ring(capMat) : disc(moveMat), m.to[0], m.to[1], 0.12);
      }
    }
  }

  function pick(sq) {
    if (!st || st.over || st.turn !== seat) return;
    const { r, c } = sq;
    if (sel && sel[0] === r && sel[1] === c) { sel = null; return drawOverlays(); }
    const opts = sel ? movesFrom(sel[0], sel[1]).filter(m => m.to[0] === r && m.to[1] === c) : [];
    if (opts.length) {
      let promo = null;
      if (opts.some(m => m.promo)) {
        const ans = prompt('승격할 기물: q(퀸) r(룩) b(비숍) n(나이트)', 'q');
        if (!ans) return;
        promo = String(ans).trim().toLowerCase();
        if (!['q', 'r', 'b', 'n'].includes(promo)) promo = 'q';
      }
      ctx.send({ type: 'move', from: sel, to: [r, c], promo });
      sel = null; return drawOverlays();
    }
    sel = movesFrom(r, c).length ? [r, c] : null;
    drawOverlays();
  }
  stage.onPick = pick;

  // Controls --------------------------------------------------------------
  const resign = document.createElement('button'); resign.textContent = '기권'; resign.className = 'ghost';
  resign.onclick = () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); };
  const drawB = document.createElement('button'); drawB.textContent = '무승부 제안'; drawB.className = 'ghost';
  drawB.onclick = () => ctx.send({ type: 'draw-offer' });
  const flipB = document.createElement('button'); flipB.textContent = '시점 반대'; flipB.className = 'ghost';
  flipB.onclick = () => { stage.theta += Math.PI; };
  bar.append(resign, drawB, flipB);

  function status() {
    const turnName = st.turn === 0 ? '백' : '흑';
    const myName = seat === 0 ? '백' : seat === 1 ? '흑' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${turnName}</b>${st.check ? ' · 체크!' : ''}<br>나: ${myName}<br>
         <span class="muted">${st.fullmove}수째 · 50수 ${st.halfmove}/100 · 드래그로 회전, 휠로 확대</span>`;
    moves.innerHTML = '';
    for (let i = 0; i < st.history.length; i += 2) {
      const s = document.createElement('div');
      s.innerHTML = `<span>${i / 2 + 1}.</span> <span>${st.history[i] || ''}</span> <span>${st.history[i + 1] || ''}</span>`;
      moves.appendChild(s);
    }
    moves.scrollTop = moves.scrollHeight;
    resign.disabled = st.over || seat < 0; drawB.disabled = st.over || seat < 0;
  }

  let orientedFor = null;
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (orientedFor !== seat) { stage.theta = seat === 1 ? Math.PI : 0; orientedFor = seat; }
      rebuildPieces(); drawOverlays(); status();
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
