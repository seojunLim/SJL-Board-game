import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Blokus: a grey 20x20 grid tray with translucent coloured plastic pieces.
// Your remaining pieces lie in front of you; pick one, hover the board to see
// a green/red ghost, R rotates, F flips, click places.

const N = 20, CS = 0.5, TOP = 0.22;
const COLORS = [0x2463d6, 0xf2c000, 0xe0302a, 0x2ea84a];
const COLOR_KO = ['파랑', '노랑', '빨강', '초록'];
const CORNERS = [[0, 0], [0, N - 1], [N - 1, N - 1], [N - 1, 0]];
const cellPos = (r, c, y = TOP) => new THREE.Vector3((c - (N - 1) / 2) * CS, y, (r - (N - 1) / 2) * CS);

function norm(cells) {
  const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
const keyOf = cells => JSON.stringify(norm(cells));

function canPlace(board, color, first, cells) {
  let corner = false;
  for (const [r, c] of cells) {
    if (r < 0 || c < 0 || r >= N || c >= N || board[r][c] !== -1) return false;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) return false; }
    if (first) { if (r === CORNERS[color][0] && c === CORNERS[color][1]) corner = true; }
    else for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N && board[rr][cc] === color) corner = true; }
  }
  return corner;
}

export default function blokus(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { aspect: 0.86, camera: { radius: 17, phi: 0.5, minR: 9, maxR: 30, target: [0, 0, 2.7] } });
  const S = stage.scene;

  // ------------------------------------------------------------ board
  const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x8e959c, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const tray = new THREE.Mesh(new RoundedBoxGeometry(N * CS + 0.7, TOP, N * CS + 0.7, 4, 0.12), trayMat);
  tray.position.y = TOP / 2 - 0.02; tray.castShadow = tray.receiveShadow = true; S.add(tray);
  const wellGeo = new RoundedBoxGeometry(CS * 0.9, 0.04, CS * 0.9, 2, 0.04);
  const wellMat = new THREE.MeshStandardMaterial({ color: 0xb7bdc3, roughness: 0.6 });
  const wells = new THREE.InstancedMesh(wellGeo, wellMat, N * N);
  const tmp = new THREE.Object3D();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { tmp.position.copy(cellPos(r, c, TOP - 0.01)); tmp.updateMatrix(); wells.setMatrixAt(r * N + c, tmp.matrix); }
  wells.receiveShadow = true; S.add(wells);
  CORNERS.forEach(([r, c], i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(CS * 0.18, CS * 0.32, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS[i], toneMapped: false }));
    m.position.copy(cellPos(r, c, TOP + 0.02)); S.add(m);
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(N * CS, N * CS).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  plane.position.y = TOP + 0.03; plane.userData.pick = { board: true }; S.add(plane);

  const cubeGeo = new RoundedBoxGeometry(CS * 0.96, 0.16, CS * 0.96, 2, 0.04);
  const pieceMats = COLORS.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, transmission: 0, transparent: true, opacity: 0.93, envMapIntensity: 0.9 }));
  const ghostOk = new THREE.MeshBasicMaterial({ color: 0x8cf0a6, transparent: true, opacity: 0.6, depthWrite: false });
  const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.5, depthWrite: false });
  const placed = new THREE.Group(); S.add(placed);
  const boardCubes = new Map();

  // ------------------------------------------------------------ state & pieces
  let st = null, seat = -1, sel = null, orient = 0, ghost = null, hoverCell = null, armed = null;
  const trays = new THREE.Group(); S.add(trays);

  function myTurnColor() { return st && !st.over && st.turn === seat ? st.turnColor : -1; }

  function pieceGroup(cells, color, scale = 1) {
    const g = new THREE.Group();
    for (const [r, c] of cells) {
      const m = new THREE.Mesh(cubeGeo, pieceMats[color]);
      m.position.set(c * CS * scale, 0.08, r * CS * scale); m.scale.setScalar(scale);
      m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
    return g;
  }

  function buildBoard(prevBoard) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const v = st.board[r][c], k = r * N + c;
      const had = boardCubes.get(k);
      if (v === -1) { if (had) { placed.remove(had); boardCubes.delete(k); } continue; }
      if (had && had.userData.color === v) continue;
      const m = new THREE.Mesh(cubeGeo, pieceMats[v]);
      m.position.copy(cellPos(r, c, TOP + 0.08)); m.castShadow = m.receiveShadow = true; m.userData.color = v;
      placed.add(m); boardCubes.set(k, m);
      if (prevBoard && prevBoard[r][c] === -1) {
        const y = m.position.y;
        stage.tween(320, t => { m.position.y = y + (1 - t) * 1.2; }, { ease: EASE.outBounce, done: () => sfx.tile(0.35) });
      }
    }
  }

  // Remaining pieces for my colours, laid out in rows in front of the board.
  function buildTrays() {
    trays.clear();
    // Show one tray: the colour I'm playing now, otherwise my next colour.
    const mine = st.myColors || [];
    const active = myTurnColor();
    const shown = active >= 0 ? active : mine.find(c => !st.colors[c].done);
    let z = N * CS / 2 + 0.75;
    (shown == null ? [] : [shown]).forEach((color) => {
      const left = st.colors[color].left;
      const scale = 0.5, X0 = -N * CS / 2 - 0.6, X1 = N * CS / 2 + 0.6;
      let x = X0, lineH = 0;
      for (const id of left) {
        const cells = st.orients[id][0];
        const w = (Math.max(...cells.map(p => p[1])) + 1) * CS * scale;
        const h = (Math.max(...cells.map(p => p[0])) + 1) * CS * scale;
        if (x + w > X1) { x = X0; z += lineH + 0.25; lineH = 0; }
        lineH = Math.max(lineH, h);
        const g = pieceGroup(cells, color, scale);
        g.position.set(x, -0.01, z);
        g.userData.pick = { piece: id, color };
        const active = myTurnColor() === color;
        if (!active) g.children.forEach(m => { m.material = m.material.clone(); m.material.opacity = 0.45; });
        if (sel && sel.id === id && sel.color === color) g.position.y += 0.25;
        trays.add(g);
        x += w + 0.26;
      }
      z += lineH + 0.7;
    });
  }

  function currentCells() {
    if (!sel) return null;
    return st.orients[sel.id][orient];
  }
  function handleOf(cells) {
    const cr = (Math.max(...cells.map(p => p[0]))) / 2, cc = (Math.max(...cells.map(p => p[1]))) / 2;
    let best = cells[0], bd = 1e9;
    for (const p of cells) { const d = (p[0] - cr) ** 2 + (p[1] - cc) ** 2; if (d < bd) { bd = d; best = p; } }
    return best;
  }
  function placementAt(cell) {
    const cells = currentCells(); if (!cells || !cell) return null;
    const [hr, hc] = handleOf(cells);
    const r0 = cell.r - hr, c0 = cell.c - hc;
    const abs = cells.map(([r, c]) => [r + r0, c + c0]);
    const first = st.colors[sel.color].left.length === 21;
    return { r: r0, c: c0, abs, ok: canPlace(st.board, sel.color, first, abs) };
  }
  function drawGhost() {
    if (ghost) { S.remove(ghost); ghost = null; }
    const p = placementAt(hoverCell);
    if (!p) return;
    ghost = new THREE.Group();
    for (const [r, c] of p.abs) {
      if (r < 0 || c < 0 || r >= N || c >= N) continue;
      const m = new THREE.Mesh(cubeGeo, p.ok ? ghostOk : ghostBad);
      m.position.copy(cellPos(r, c, TOP + 0.1)); ghost.add(m);
    }
    S.add(ghost);
  }
  function transform(kind) {
    if (!sel) return;
    const cur = st.orients[sel.id][orient];
    const t = kind === 'rot' ? cur.map(([r, c]) => [c, -r]) : cur.map(([r, c]) => [r, -c]);
    const k = keyOf(t);
    orient = st.orients[sel.id].findIndex(o => JSON.stringify(o) === k);
    if (orient < 0) orient = 0;
    drawGhost();
  }
  const cellFromPoint = pt => {
    const c = Math.round(pt.x / CS + (N - 1) / 2), r = Math.round(pt.z / CS + (N - 1) / 2);
    return r >= 0 && c >= 0 && r < N && c < N ? { r, c } : null;
  };

  stage.onHover = (pick, point) => {
    if (!sel || !point || !(pick && pick.board)) { if (hoverCell) { hoverCell = null; drawGhost(); } return; }
    const cell = cellFromPoint(point);
    if (cell && hoverCell && cell.r === hoverCell.r && cell.c === hoverCell.c) return;
    hoverCell = cell; drawGhost();
  };
  stage.onPick = (pick, point, obj, ptr) => {
    stage.finishTweens();
    if (!pick || !st) return;
    if (pick.piece) {
      if (myTurnColor() !== pick.color) { ctx.toast(st.turn === seat ? `지금은 ${COLOR_KO[st.turnColor]} 차례예요.` : '내 차례가 아니에요.'); return; }
      sel = { id: pick.piece, color: pick.color }; orient = 0; armed = null;
      buildTrays(); drawGhost(); sfx.tile(0.25);
      return;
    }
    if (pick.board && sel && point) {
      const cell = cellFromPoint(point);
      if (ptr === 'touch' && !(armed && cell && armed.r === cell.r && armed.c === cell.c)) { armed = cell; hoverCell = cell; drawGhost(); return; }
      armed = null;
      const p = placementAt(cell);
      if (!p) return;
      if (!p.ok) { ctx.toast(st.colors[sel.color].left.length === 21 ? '첫 조각은 내 색 모서리(동그라미) 칸을 덮어야 해요.' : '같은 색과는 꼭짓점으로만 닿아야 해요.'); return; }
      ctx.send({ type: 'place', piece: sel.id, orient, r: p.r, c: p.c });
      sel = null; hoverCell = null; drawGhost();
    }
  };

  const rotB = btn('⟳ 회전 (R)', '', () => transform('rot'));
  const flipB = btn('⇋ 뒤집기 (F)', '', () => transform('flip'));
  const cancelB = btn('선택 취소', 'ghost', () => { sel = null; drawGhost(); buildTrays(); });
  const resign = btn('포기', 'ghost', () => { if (confirm('남은 조각을 두고 포기할까요?')) ctx.send({ type: 'resign' }); });
  bar.append(rotB, flipB, cancelB, resign);
  const onKey = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R') transform('rot');
    if (e.key === 'f' || e.key === 'F') transform('flip');
    if (e.key === 'Escape') { sel = null; drawGhost(); buildTrays(); }
  };
  window.addEventListener('keydown', onKey);
  const hud = el('div', 'hud'); holder.appendChild(hud);

  let prevBoard = null, won = false;
  ctx.root.__test = {
    screen: k => {
      const [kind, rest] = k.split(':');
      if (kind === 'sq') { const [r, c] = rest.split(',').map(Number); return stage.screenOf(cellPos(r, c)); }
      if (kind === 'piece') { const g = trays.children.find(x => x.userData.pick.piece === rest && x.userData.pick.color === st.turnColor); if (!g) return null; const v = g.children[0].position.clone(); g.localToWorld(v); return stage.screenOf(v); }
      return null;
    },
    orient: i => { orient = i; drawGhost(); },
    sel: () => sel
  };
  return {
    render(state, mySeat) {
      stage.finishTweens();
      st = state; seat = mySeat;
      if (sel && myTurnColor() !== sel.color) { sel = null; hoverCell = null; drawGhost(); }
      buildBoard(prevBoard);
      prevBoard = st.board.map(r => r.slice());
      buildTrays();
      stage.setPickables([plane, ...trays.children]);
      const tc = st.turnColor;
      const myCols = (st.myColors || []).map(c => `<b style="color:#${COLORS[c].toString(16).padStart(6, '0')}">${COLOR_KO[c]}</b>`).join(', ');
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `차례: <b style="color:#${COLORS[tc].toString(16).padStart(6, '0')}">${COLOR_KO[tc]}</b> (${st.names[st.turn]})<br>내 색: ${myCols || '관전'}<br>
           <span class="muted">${myTurnColor() >= 0 ? (sel ? '판 위에서 위치를 고르고 클릭! R 회전 · F 뒤집기' : '앞에 놓인 내 조각을 클릭해 고르세요.') : '상대 차례…'}${MOBILE ? ' · 폰은 두 번 탭' : ''}</span>`;
      hud.innerHTML = st.order.map(c => {
        const col = st.colors[c];
        return `<span class="chip ${tc === c && !st.over ? 'turn' : ''} ${col.owner === seat ? 'me' : ''} ${col.done ? 'out' : ''}"><span style="color:#${COLORS[c].toString(16).padStart(6, '0')}">■</span> ${st.names[col.owner]} · ${col.left.length}개 · ${st.scores[c]}점</span>`;
      }).join('');
      rotB.disabled = flipB.disabled = cancelB.disabled = !sel;
      resign.disabled = st.over || seat < 0;
      fillLog(log, st.log);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
