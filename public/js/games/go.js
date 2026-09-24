import { Stage, THREE } from '../three3d/scene.js';

export default function go(ctx) {
  const holder = document.createElement('div'); holder.style.width = '100%';
  const bar = document.createElement('div'); bar.className = 'row'; bar.style.marginTop = '10px';
  ctx.root.appendChild(holder); ctx.root.appendChild(bar);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { radius: 12, minR: 7, maxR: 20, phi: 0.62, targetY: 0 });

  const EXT = 8;                              // playable span in world units
  let n = 19, spacing = EXT / 18, sr = 0.2;   // set per game
  const origin = -EXT / 2;
  const toWorld = (r, c) => [origin + c * spacing, origin + r * spacing];
  const nearest = (pt) => {
    const c = Math.round((pt.x - origin) / spacing), r = Math.round((pt.z - origin) / spacing);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return { r, c };
  };

  // Kaya-wood board.
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.65 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(EXT + 1.6, 0.6, EXT + 1.6), boardMat);
  board.position.y = -0.3; board.receiveShadow = true; stage.scene.add(board);
  const gridGroup = new THREE.Group(); stage.scene.add(gridGroup);
  const stonesGroup = new THREE.Group(); stage.scene.add(stonesGroup);
  const overlay = new THREE.Group(); stage.scene.add(overlay);

  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.25, metalness: 0.1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2f1ea, roughness: 0.4 });
  const stoneGeo = new THREE.SphereGeometry(1, 24, 18);   // scaled per placement

  function buildGrid() {
    gridGroup.clear();
    const mat = new THREE.LineBasicMaterial({ color: 0x5a3d12 });
    const a0 = origin, a1 = origin + (n - 1) * spacing;
    for (let i = 0; i < n; i++) {
      const p = origin + i * spacing;
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p, 0.02, a0), new THREE.Vector3(p, 0.02, a1)]), mat));
      gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a0, 0.02, p), new THREE.Vector3(a1, 0.02, p)]), mat));
    }
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : n === 9 ? [2, 4, 6] : [];
    const dotMat = new THREE.MeshStandardMaterial({ color: 0x3a2606 });
    for (const a of stars) for (const b of stars) {
      const [x, z] = toWorld(a, b);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(spacing * 0.09, spacing * 0.09, 0.03, 16), dotMat);
      d.position.set(x, 0.03, z); gridGroup.add(d);
    }
    // One large invisible pick plane covering the board.
    const plane = gridGroup.getObjectByName('pick') || new THREE.Mesh(
      new THREE.PlaneGeometry(EXT + 1.2, EXT + 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ visible: false }));
    plane.name = 'pick'; plane.position.y = 0.02; plane.userData.pick = { plane: true };
    gridGroup.add(plane);
    stage.setPickables([plane]);
  }

  function stone(color, r, c, opts = {}) {
    const m = new THREE.Mesh(stoneGeo, color === 1 ? blackMat : whiteMat);
    m.scale.set(sr, sr * 0.42, sr);
    const [x, z] = toWorld(r, c); m.position.set(x, sr * 0.42, z);
    m.castShadow = true; m.receiveShadow = true;
    if (opts.ghost) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.45; m.castShadow = false; }
    if (opts.dead) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 0.3; }
    return m;
  }

  let st = null, seat = -1, hover = null, ghost = null;

  function sync() {
    stonesGroup.clear(); overlay.clear();
    const dead = new Set(st.dead || []);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = st.board[r][c];
      if (v) stonesGroup.add(stone(v, r, c, { dead: dead.has(r + ',' + c) }));
    }
    if (st.lastMove && st.lastMove.r != null) {
      const [x, z] = toWorld(st.lastMove.r, st.lastMove.c);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(sr * 0.5, sr * 0.08, 8, 24).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff4d4d }));
      ring.position.set(x, sr * 0.85, z); overlay.add(ring);
    }
    drawStatus();
  }

  stage.onHover = (pick, point) => {
    if (!st || st.over || st.phase !== 'play' || st.turn !== seat || !point) { setGhost(null); return; }
    const g = nearest(point);
    if (g && st.board[g.r][g.c] === 0) setGhost(g); else setGhost(null);
  };
  function setGhost(g) {
    if ((g && hover && g.r === hover.r && g.c === hover.c) || (!g && !hover)) return;
    hover = g;
    if (ghost) { stage.scene.remove(ghost); ghost = null; }
    if (g) { ghost = stone(seat === 0 ? 1 : 2, g.r, g.c, { ghost: true }); stage.scene.add(ghost); }
  }

  stage.onPick = (pick, point) => {
    if (!st || st.over || !point) return;
    const g = nearest(point); if (!g) return;
    if (st.phase === 'scoring') ctx.send({ type: 'toggle-dead', r: g.r, c: g.c });
    else if (st.turn === seat) { ctx.send({ type: 'place', r: g.r, c: g.c }); setGhost(null); }
  };

  const passB = mkBtn('패스', 'primary', () => ctx.send({ type: 'pass' }));
  const acceptB = mkBtn('계가 동의', 'primary', () => ctx.send({ type: 'accept-score' }));
  const resumeB = mkBtn('대국 재개', 'ghost', () => ctx.send({ type: 'resume' }));
  const resign = mkBtn('기권', 'ghost', () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); });
  bar.append(passB, acceptB, resumeB, resign);
  function mkBtn(t, cls, fn) { const b = document.createElement('button'); b.textContent = t; b.className = cls; b.onclick = fn; return b; }

  function drawStatus() {
    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    let s;
    if (st.over) s = `<b>게임 종료</b><br>${st.result}`;
    else if (st.phase === 'scoring') {
      const si = st.scoreInfo || { black: 0, white: 0 };
      s = `<b>계가 중</b> — 죽은 돌을 클릭해 표시<br>흑 ${si.black} : 백 ${si.white} (덤 ${st.komi})<br>
        <span class="muted">동의: ${st.scoreAccept.map((a, i) => (i === 0 ? '흑' : '백') + (a ? '✅' : '⬜')).join(' ')}</span>`;
    } else s = `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>따냄 — 흑 ${st.captures[0]} / 백 ${st.captures[1]}<br>덤 ${st.komi} · <span class="muted">드래그 회전</span>`;
    ctx.status.innerHTML = s;
    passB.classList.toggle('hidden', st.phase !== 'play'); passB.disabled = st.over || st.turn !== seat;
    acceptB.classList.toggle('hidden', st.phase !== 'scoring' || st.over); acceptB.disabled = seat < 0 || (st.scoreAccept && st.scoreAccept[seat]);
    resumeB.classList.toggle('hidden', st.phase !== 'scoring' || st.over);
    resign.disabled = st.over || seat < 0;
    log.innerHTML = '';
    (st.history || []).slice(-60).forEach(h => log.appendChild(Object.assign(document.createElement('div'), { textContent: h })));
    log.scrollTop = log.scrollHeight;
  }

  let built = null, orientedFor = null;
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (built !== st.n) {
        n = st.n; spacing = EXT / (n - 1); sr = spacing * 0.47; built = n; buildGrid();
        stage.radius = n <= 9 ? 10 : n <= 13 ? 12 : 14;
      }
      if (orientedFor !== seat) { stage.theta = seat === 1 ? Math.PI : 0; orientedFor = seat; }
      sync();
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
