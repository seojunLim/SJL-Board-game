import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Quoridor: a dark walnut board with raised maple squares and grooves, turned
// wooden pawns in player colours, and wall slats that slot into the grooves.
// Walls show a green/red ghost before placing (client mirrors the server's
// overlap and path checks so the preview is honest).

const N = 9, CELL = 1, GAP = 0.24, PITCH = CELL + GAP;
const TOP = 0.42;
const WALL_LEN = CELL * 2 + GAP, WALL_T = 0.16, WALL_H = 0.5;
const COLORS = [0xd23b3b, 0x2f6fd6, 0xf2b632, 0x3fa34d];
const COLOR_KO = ['빨강', '파랑', '노랑', '초록'];
const cellPos = (r, c, y = TOP) => new THREE.Vector3((c - 4) * PITCH, y, (r - 4) * PITCH);
const crossPos = (r, c, y = TOP) => new THREE.Vector3((c - 3.5) * PITCH, y, (r - 3.5) * PITCH);
const GOALS = [p => p[0] === 0, p => p[1] === N - 1, p => p[0] === N - 1, p => p[1] === 0];

function blocked(walls, r, c, dr, dc) {
  const has = (wr, wc, o) => walls.some(w => w.r === wr && w.c === wc && w.o === o);
  if (dr === 1) return has(r, c, 'h') || has(r, c - 1, 'h');
  if (dr === -1) return has(r - 1, c, 'h') || has(r - 1, c - 1, 'h');
  if (dc === 1) return has(r, c, 'v') || has(r - 1, c, 'v');
  if (dc === -1) return has(r, c - 1, 'v') || has(r - 1, c - 1, 'v');
  return false;
}
function hasPath(walls, from, goal) {
  const seen = new Set([from[0] * N + from[1]]), q = [from];
  while (q.length) {
    const p = q.shift();
    if (goal(p)) return true;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = p[0] + dr, nc = p[1] + dc;
      if (nr < 0 || nc < 0 || nr >= N || nc >= N || blocked(walls, p[0], p[1], dr, dc) || seen.has(nr * N + nc)) continue;
      seen.add(nr * N + nc); q.push([nr, nc]);
    }
  }
  return false;
}
function wallOk(st, w) {
  if (w.r < 0 || w.c < 0 || w.r > N - 2 || w.c > N - 2) return false;
  for (const x of st.walls) {
    if (x.r === w.r && x.c === w.c) return false;
    if (x.o === w.o && w.o === 'h' && x.r === w.r && Math.abs(x.c - w.c) === 1) return false;
    if (x.o === w.o && w.o === 'v' && x.c === w.c && Math.abs(x.r - w.r) === 1) return false;
  }
  const walls = st.walls.concat([w]);
  return st.pos.every((p, i) => hasPath(walls, p, GOALS[st.side[i]]));
}

function pawnGeometry() {
  const pts = [[0, 0], [0.36, 0], [0.38, 0.05], [0.33, 0.1], [0.22, 0.18], [0.16, 0.35], [0.15, 0.5], [0.2, 0.56], [0.15, 0.6]];
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + 0.3 + (i / 12) * (Math.PI - 0.3); pts.push([Math.cos(a) * 0.2, 0.78 + Math.sin(a) * 0.2]); }
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y)), 40);
  g.computeVertexNormals(); return g;
}

export default function quoridor(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { camera: { radius: 18, phi: 0.66, minR: 10, maxR: 30, target: [0, 0, 0.8] } });
  const S = stage.scene;

  // ------------------------------------------------------------ board
  const walnut = woodTexture({ light: 0x5a331a, dark: 0x24120a, rings: 7, seed: 71, figure: 1.2 });
  const maple = woodTexture({ light: 0xeccf9b, dark: 0xcfa66b, rings: 5, seed: 72, figure: 0.7, size: 512 });
  const size = N * PITCH + 0.9;
  const base = new THREE.Mesh(new RoundedBoxGeometry(size, TOP - 0.08, size, 5, 0.12),
    new THREE.MeshPhysicalMaterial({ map: walnut.map, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.4 }));
  base.position.y = (TOP - 0.08) / 2; base.castShadow = base.receiveShadow = true; S.add(base);
  const tileGeo = new RoundedBoxGeometry(CELL, 0.12, CELL, 3, 0.05);
  const tileMat = new THREE.MeshPhysicalMaterial({ map: maple.map, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.4 });
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = new THREE.Mesh(tileGeo, tileMat);
    t.position.copy(cellPos(r, c, TOP - 0.06)); t.receiveShadow = true; t.castShadow = true;
    t.userData.pick = { r, c };
    S.add(t); cells.push(t);
  }
  // goal-row colour strips on each edge
  const stripGeo = new THREE.BoxGeometry(N * PITCH - GAP, 0.03, 0.14);
  const strips = [];
  function edgeStrip(side, color) {
    const m = new THREE.Mesh(stripGeo, new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4 }));
    const d = size / 2 - 0.22;
    if (side === 0) m.position.set(0, TOP - 0.06, -d);          // bottom player's goal is the top edge
    if (side === 2) m.position.set(0, TOP - 0.06, d);
    if (side === 1) { m.position.set(d, TOP - 0.06, 0); m.rotation.y = Math.PI / 2; }
    if (side === 3) { m.position.set(-d, TOP - 0.06, 0); m.rotation.y = Math.PI / 2; }
    S.add(m); strips.push(m);
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  plane.position.y = TOP; plane.userData.pick = { plane: true }; S.add(plane);

  // ------------------------------------------------------------ pawns & walls
  const pawnGeo = pawnGeometry();
  const pawnMats = COLORS.map(c => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.6 }));
  const wallGeo = new RoundedBoxGeometry(WALL_LEN, WALL_H, WALL_T, 2, 0.04);
  const wallWood = woodTexture({ light: 0xd9b07a, dark: 0xa77a45, rings: 9, seed: 73, size: 512 });
  const wallMat = new THREE.MeshPhysicalMaterial({ map: wallWood.map, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.4 });
  const ghostOk = new THREE.MeshBasicMaterial({ color: 0x6fe08a, transparent: true, opacity: 0.55, depthWrite: false });
  const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.45, depthWrite: false });

  let st = null, seat = -1, mode = 'move', ghost = null, ghostW = null, armed = null;
  const pawns = [], wallMeshes = new Map(), stocks = [];
  const hints = new THREE.Group(); S.add(hints);
  const hintGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 28);
  const hintMat = new THREE.MeshBasicMaterial({ color: 0x8cf0a6, transparent: true, opacity: 0.8, toneMapped: false });

  function wallTransform(m, w, y = TOP + WALL_H / 2 - 0.02) {
    m.position.copy(crossPos(w.r, w.c, y));
    m.rotation.set(0, w.o === 'v' ? Math.PI / 2 : 0, 0);
  }
  function makePawn(side) { const m = new THREE.Mesh(pawnGeo, pawnMats[side]); m.castShadow = m.receiveShadow = true; S.add(m); return m; }

  function buildStocks() {
    stocks.forEach(s => S.remove(s)); stocks.length = 0;
    st.side.forEach((side, i) => {
      const g = new THREE.Group();
      const n = st.wallsLeft[i];
      for (let k = 0; k < n; k++) {
        // spare walls lie flat in two neat stacks beside the board
        const m = new THREE.Mesh(wallGeo, wallMat); m.castShadow = true; m.receiveShadow = true;
        m.rotation.set(Math.PI / 2, (k % 2 ? 0.03 : -0.03), 0);
        m.position.set(0, WALL_T / 2 + Math.floor(k / 2) * WALL_T, (k % 2) * (WALL_H + 0.08));
        g.add(m);
      }
      const d = size / 2 + 1.0;
      if (side === 0) g.position.set(3, 0, d);
      if (side === 2) { g.position.set(-3, 0, -d); g.rotation.y = Math.PI; }
      if (side === 1) { g.position.set(-d, 0, 3); g.rotation.y = -Math.PI / 2; }
      if (side === 3) { g.position.set(d, 0, -3); g.rotation.y = Math.PI / 2; }
      S.add(g); stocks.push(g);
    });
  }

  function sync(prev) {
    while (pawns.length < st.n) pawns.push(makePawn(st.side[pawns.length]));
    st.pos.forEach((p, i) => {
      const to = cellPos(p[0], p[1]);
      const m = pawns[i];
      const old = prev && prev.pos[i];
      if (old && (old[0] !== p[0] || old[1] !== p[1])) {
        const from = m.position.clone();
        stage.tween(380, k => { m.position.lerpVectors(from, to, k); m.position.y = TOP + Math.sin(Math.PI * k) * 0.8; }, { ease: EASE.inOutCubic, done: () => sfx.knock(0.5) });
      } else m.position.copy(to);
    });
    for (const w of st.walls) {
      const key = `${w.r},${w.c},${w.o}`;
      if (wallMeshes.has(key)) continue;
      const m = new THREE.Mesh(wallGeo, wallMat); m.castShadow = m.receiveShadow = true;
      wallTransform(m, w);
      S.add(m); wallMeshes.set(key, m);
      if (prev) { const y1 = m.position.y; stage.tween(300, k => { m.position.y = y1 + (1 - k) * 1.6; }, { ease: EASE.outBounce, done: () => sfx.knock(0.6) }); }
    }
    hints.clear();
    if (st.turn === seat && !st.over) for (const [r, c] of st.moves) {
      const h = new THREE.Mesh(hintGeo, hintMat); h.position.copy(cellPos(r, c, TOP + 0.02)); h.userData.pick = { r, c }; hints.add(h);
    }
    if (!strips.length) st.side.forEach(s => edgeStrip(s, COLORS[s]));
    buildStocks();
    stage.setPickables([...hints.children, ...cells, plane]);
  }

  function nearestCross(point) {
    const c = Math.round(point.x / PITCH + 3.5), r = Math.round(point.z / PITCH + 3.5);
    if (r < 0 || c < 0 || r > N - 2 || c > N - 2) return null;
    return { r, c };
  }
  function showGhost(w) {
    if (ghost) { S.remove(ghost); ghost = null; ghostW = null; }
    if (!w) return;
    ghost = new THREE.Mesh(wallGeo, wallOk(st, w) ? ghostOk : ghostBad);
    wallTransform(ghost, w);
    ghostW = w; S.add(ghost);
  }

  stage.onHover = (pick, point) => {
    if (!st || st.over || st.turn !== seat || mode === 'move' || !point) return showGhost(null);
    const x = nearestCross(point);
    showGhost(x ? { r: x.r, c: x.c, o: mode } : null);
  };
  stage.onPick = (pick, point, obj, ptr) => {
    stage.finishTweens();
    if (!st || st.over || st.turn !== seat) return;
    if (mode === 'move') {
      if (pick && pick.r != null && st.moves.some(([r, c]) => r === pick.r && c === pick.c)) ctx.send({ type: 'move', r: pick.r, c: pick.c });
      return;
    }
    if (!point) return;
    const x = nearestCross(point); if (!x) return;
    const w = { r: x.r, c: x.c, o: mode };
    if (ptr === 'touch' && !(armed && armed.r === w.r && armed.c === w.c && armed.o === w.o)) { armed = w; showGhost(w); return; }
    armed = null;
    if (!wallOk(st, w)) { ctx.toast('여기에는 벽을 놓을 수 없어요.'); return; }
    ctx.send({ type: 'wall', r: w.r, c: w.c, o: w.o });
    showGhost(null);
  };

  const moveB = btn('🚶 말 이동', 'primary', () => setMode('move'));
  const hB = btn('▬ 가로 벽', '', () => setMode('h'));
  const vB = btn('▮ 세로 벽', '', () => setMode('v'));
  const resign = btn('기권', 'ghost', () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); });
  bar.append(moveB, hB, vB, resign);
  function setMode(m) {
    mode = m; armed = null; showGhost(null);
    moveB.className = m === 'move' ? 'primary' : ''; hB.className = m === 'h' ? 'primary' : ''; vB.className = m === 'v' ? 'primary' : '';
  }
  const onKey = e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'r' || e.key === 'R') setMode(mode === 'h' ? 'v' : 'h'); if (e.key === 'Escape') setMode('move'); };
  window.addEventListener('keydown', onKey);
  const hud = el('div', 'hud'); holder.appendChild(hud);

  let prev = null, oriented = false, won = false;
  ctx.root.__test = {
    screen: k => {
      const [kind, rest] = k.split(':');
      const [a, b] = rest.split(',');
      if (kind === 'sq') return stage.screenOf(cellPos(+a, +b));
      if (kind === 'cross') return stage.screenOf(crossPos(+a, +b));
      return null;
    }
  };
  return {
    render(state, mySeat) {
      stage.finishTweens();
      st = state; seat = mySeat;
      if (!oriented) {
        oriented = true;
        const side = seat >= 0 ? st.side[seat] : 0;
        stage.setView({ theta: [0, -Math.PI / 2, Math.PI, Math.PI / 2][side] }, false);
      }
      sync(prev);
      prev = { pos: st.pos.map(p => p.slice()) };
      if (st.turn !== seat) setMode('move');
      const my = seat >= 0 ? `나: <b style="color:#${COLORS[st.side[seat]].toString(16).padStart(6, '0')}">${COLOR_KO[st.side[seat]]}</b> · 목표 ${st.goals[seat]}` : '관전';
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `차례: <b>${st.names[st.turn]}</b><br>${my}<br><span class="muted">초록 점 = 갈 수 있는 칸 · 벽 버튼을 누르고 홈 위에 놓기 (R 키로 방향 전환)${MOBILE ? ' · 폰은 두 번 탭' : ''}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''}"><span style="color:#${COLORS[st.side[i]].toString(16).padStart(6, '0')}">●</span> ${nm} · 벽 ${st.wallsLeft[i]}</span>`).join('');
      const myTurn = st.turn === seat && !st.over;
      hB.disabled = vB.disabled = !myTurn || !st.wallsLeft[seat];
      resign.disabled = st.over || seat < 0;
      fillLog(log, st.history);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
