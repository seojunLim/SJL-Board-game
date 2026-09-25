import { Stage, THREE, EASE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, shellTexture, paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Go on a kaya table goban: grid and hoshi painted into the wood, biconvex
// slate & shell stones, paulownia-style bowls with lids that hold captures,
// stones that drop and settle, a ghost stone under the cursor, and territory
// markers during scoring.

const EXT = 8.6;            // grid span in world units (any board size)
const H = 0.9;              // goban thickness
const W = EXT + 1.1;        // goban footprint
const NB = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function gobanTop(n) {
  const kaya = woodTexture({ light: 0xf0cf8a, dark: 0xd2a860, rings: 10, seed: 41, figure: 0.55, streak: 0.22 });
  return paintedTexture('goban-' + n, 2048, 2048, (g, S) => {
    g.drawImage(kaya.canvas, 0, 0, S, S);
    const ppu = S / W;
    const o = (W - EXT) / 2 * ppu, step = EXT / (n - 1) * ppu;
    g.strokeStyle = 'rgba(30,18,6,0.92)';
    g.lineCap = 'square';
    for (let i = 0; i < n; i++) {
      g.lineWidth = i === 0 || i === n - 1 ? 5 : 2.6;
      g.beginPath(); g.moveTo(o + i * step, o); g.lineTo(o + i * step, o + (n - 1) * step); g.stroke();
      g.beginPath(); g.moveTo(o, o + i * step); g.lineTo(o + (n - 1) * step, o + i * step); g.stroke();
    }
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
    g.fillStyle = 'rgba(30,18,6,0.95)';
    const stars2 = n === 9 ? [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]] : stars.flatMap(a => stars.map(b => [a, b]));
    for (const [a, b] of stars2) { g.beginPath(); g.arc(o + a * step, o + b * step, step * 0.1, 0, Math.PI * 2); g.fill(); }
  });
}

// Biconvex stone profile (lens), UV mapped top-down so shell stripes run straight.
function stoneGeometry(r, h) {
  const pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = i / N;                       // 0 bottom centre -> 1 top centre
    const a = -Math.PI / 2 + t * Math.PI;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * h / 2 * (1 - 0.18 * Math.pow(Math.cos(a), 6)) + h / 2;
    pts.push(new THREE.Vector2(Math.max(0.0001, x), y));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * r) + 0.5, pos.getZ(i) / (2 * r) + 0.5);
  g.computeVertexNormals();
  return g;
}

function bowlGeometry() {
  const pts = [];
  const prof = [[0, 0], [0.9, 0], [1.05, 0.08], [1.28, 0.35], [1.36, 0.7], [1.3, 1.02], [1.18, 1.18], [1.1, 1.22],
    [1.06, 1.18], [1.14, 1.0], [1.18, 0.72], [1.1, 0.38], [0.86, 0.16], [0, 0.14]];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 48); g.computeVertexNormals(); return g;
}
function lidGeometry() {
  const prof = [[0, 0.16], [0.9, 0.12], [1.12, 0.03], [1.16, 0.0], [1.2, 0.02], [1.2, 0.08], [1.08, 0.2], [0.8, 0.28], [0, 0.3]];
  const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48); g.computeVertexNormals(); return g;
}

export default function go(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { camera: { radius: 17, phi: 0.62, minR: 9, maxR: 28, target: [0, H, 0.6] } });
  const S = stage.scene;

  // ------------------------------------------------------------ goban
  const side = woodTexture({ light: 0xe5bf78, dark: 0xc49250, rings: 16, seed: 42, figure: 0.4 });
  const bodyMat = new THREE.MeshPhysicalMaterial({ map: side.map, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.4 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(W, H, W, 5, 0.05), bodyMat);
  body.position.y = H / 2; body.castShadow = true; body.receiveShadow = true;
  S.add(body);
  const topMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.35 });
  const top = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, W - 0.1).rotateX(-Math.PI / 2), topMat);
  top.position.y = H + 0.001; top.receiveShadow = true;
  S.add(top);
  const pickPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  pickPlane.position.y = H + 0.01; pickPlane.userData.pick = { plane: true };
  S.add(pickPlane);
  stage.setPickables([pickPlane]);

  // ------------------------------------------------------------ stones
  const shell = shellTexture();
  const matB = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35, envMapIntensity: 0.55 });
  const matW = new THREE.MeshPhysicalMaterial({ map: shell.map, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 0.6 });
  const ghostB = matB.clone(); ghostB.transparent = true; ghostB.opacity = 0.45; ghostB.depthWrite = false;
  const ghostW = matW.clone(); ghostW.transparent = true; ghostW.opacity = 0.55; ghostW.depthWrite = false;
  const deadB = matB.clone(); deadB.transparent = true; deadB.opacity = 0.35;
  const deadW = matW.clone(); deadW.transparent = true; deadW.opacity = 0.35;

  let n = 19, step = EXT / 18, sr = step * 0.48, sh = sr * 0.52, stoneGeo = null;
  const toWorld = (r, c, y = H) => new THREE.Vector3(-EXT / 2 + c * step, y, -EXT / 2 + r * step);
  const nearest = pt => {
    const c = Math.round((pt.x + EXT / 2) / step), r = Math.round((pt.z + EXT / 2) / step);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return { r, c };
  };

  const stones = new Map();                    // 'r,c' -> { mesh, v }
  const stoneGroup = new THREE.Group(); S.add(stoneGroup);
  function makeStone(v, mat) {
    const m = new THREE.Mesh(stoneGeo, mat || (v === 1 ? matB : matW));
    m.castShadow = true; m.receiveShadow = true;
    // tiny random twist + offset: real stones never sit perfectly on the point
    m.rotation.y = Math.random() * Math.PI * 2;
    return m;
  }

  // ------------------------------------------------------------ bowls
  const bowlWood = woodTexture({ light: 0xb07a45, dark: 0x6d4220, rings: 14, seed: 43, figure: 0.7 });
  const bowlMat = new THREE.MeshPhysicalMaterial({ map: bowlWood.map, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.5 });
  const bowlG = bowlGeometry(), lidG = lidGeometry();
  const bowls = [], lids = [];
  // seat 0 (black) sits at +z, bowl to their right; seat 1 (white) at -z.
  const bowlPos = [new THREE.Vector3(W / 2 + 1.9, 0, W / 2 - 1.8), new THREE.Vector3(-W / 2 - 1.9, 0, -W / 2 + 1.8)];
  const lidPos = [new THREE.Vector3(W / 2 + 1.9, 0, W / 2 - 4.7), new THREE.Vector3(-W / 2 - 1.9, 0, -W / 2 + 4.7)];
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(bowlG, bowlMat); b.scale.setScalar(1.25); b.position.copy(bowlPos[i]);
    b.castShadow = b.receiveShadow = true; S.add(b); bowls.push(b);
    const l = new THREE.Mesh(lidG, bowlMat); l.scale.setScalar(1.25); l.position.copy(lidPos[i]);
    l.rotation.x = Math.PI; l.position.y = 0.3 * 1.25;       // lid upside-down, used as capture tray
    l.castShadow = l.receiveShadow = true; S.add(l); lids.push(l);
  }
  const bowlFill = [new THREE.Group(), new THREE.Group()];
  const lidFill = [new THREE.Group(), new THREE.Group()];
  bowlFill.forEach(g => S.add(g)); lidFill.forEach(g => S.add(g));

  function fillBowls() {
    for (let i = 0; i < 2; i++) {
      bowlFill[i].clear();
      const rnd = mulberry(7 + i);
      for (let k = 0; k < 26; k++) {
        const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 1.12;
        const m = makeStone(i === 0 ? 1 : 2);
        m.position.set(bowlPos[i].x + Math.cos(a) * rr, 1.05 + rnd() * 0.12 - rr * 0.12, bowlPos[i].z + Math.sin(a) * rr);
        m.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5);
        m.castShadow = false;
        bowlFill[i].add(m);
      }
    }
  }
  // Captured stones (the opponent's colour) lie in the lid.
  const lidCount = [0, 0];
  function fillLid(i, count) {
    if (lidCount[i] === count) return;
    lidCount[i] = count;
    lidFill[i].clear();
    const rnd = mulberry(99 + i);
    const shown = Math.min(count, 60);
    for (let k = 0; k < shown; k++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 1.05;
      const m = makeStone(i === 0 ? 2 : 1);
      m.position.set(lidPos[i].x + Math.cos(a) * rr, 0.07 + Math.floor(k / 22) * sh * 0.8 + rnd() * 0.02, lidPos[i].z + Math.sin(a) * rr);
      m.rotation.set((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3);
      lidFill[i].add(m);
    }
  }

  // ------------------------------------------------------------ markers
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.11, 0.17, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff4d3d, toneMapped: false, depthWrite: false, transparent: true }));
  marker.renderOrder = 5; marker.visible = false; S.add(marker);
  const terrGroup = new THREE.Group(); S.add(terrGroup);
  const terrB = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 });
  const terrW = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });
  let ghost = null, hover = null;

  let st = null, seat = -1, prevHist = -1;

  function rebuildGeometry(size) {
    n = size; step = EXT / (n - 1); sr = step * 0.485; sh = sr * 0.56;
    stoneGeo = stoneGeometry(sr, sh);
    topMat.map = gobanTop(n); topMat.needsUpdate = true;
    for (const s of stones.values()) stoneGroup.remove(s.mesh);
    stones.clear();
    fillBowls(); lidCount[0] = lidCount[1] = -1;
    stage.setView({ radius: n <= 9 ? 12.5 : n <= 13 ? 14 : 15.5 }, false);
  }

  function sync(state) {
    const dead = new Set(state.dead || []);
    const newHist = state.history.length;
    const placed = state.lastMove && newHist === prevHist + 1 ? state.lastMove : null;
    prevHist = newHist;
    const want = new Map();
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (state.board[r][c]) want.set(r + ',' + c, state.board[r][c]);
    // captured / removed stones fly to the capturer's lid
    for (const [k, s] of stones) {
      if (want.get(k) === s.v) continue;
      stones.delete(k);
      const m = s.mesh;
      const to = lidPos[s.v === 1 ? 1 : 0].clone(); to.y = 0.2;
      const from = m.position.clone();
      stage.tween(520, t => { m.position.lerpVectors(from, to, t); m.position.y = from.y + Math.sin(Math.PI * t) * 2 + (to.y - from.y) * t; },
        { delay: 180 + Math.random() * 160, ease: EASE.inOutCubic, done: () => stoneGroup.remove(m) });
    }
    for (const [k, v] of want) {
      let s = stones.get(k);
      const [r, c] = k.split(',').map(Number);
      if (!s) {
        const m = makeStone(v);
        const p = toWorld(r, c);
        p.x += (Math.random() - 0.5) * step * 0.05; p.z += (Math.random() - 0.5) * step * 0.05;
        m.position.copy(p);
        stoneGroup.add(m);
        s = { mesh: m, v }; stones.set(k, s);
        if (placed && placed.r === r && placed.c === c) {
          stage.tween(260, t => { m.position.y = H + (1 - t) * 1.2; m.rotation.x = (1 - t) * 0.4; },
            { ease: EASE.inOutCubic, done: () => { sfx.stone(); stage.tween(140, t => { m.position.y = H + Math.sin(Math.PI * t) * 0.04; }); } });
        }
      }
      s.mesh.material = dead.has(k) ? (v === 1 ? deadB : deadW) : (v === 1 ? matB : matW);
    }
    fillLid(0, state.captures[0]); fillLid(1, state.captures[1]);

    if (state.lastMove && state.lastMove.r != null && !state.over) {
      marker.position.copy(toWorld(state.lastMove.r, state.lastMove.c, H + sh + 0.004));
      marker.scale.setScalar(step / (EXT / 18));
      marker.visible = true;
    } else marker.visible = false;

    terrGroup.clear();
    if (state.phase === 'scoring' || (state.over && state.scoreInfo)) {
      const terr = territory(state.board, n, dead);
      const g = new THREE.BoxGeometry(step * 0.34, 0.03, step * 0.34);
      for (const [r, c, owner] of terr) {
        const m = new THREE.Mesh(g, owner === 1 ? terrB : terrW);
        m.position.copy(toWorld(r, c, H + 0.02)); m.castShadow = true;
        terrGroup.add(m);
      }
    }
  }

  stage.onHover = (pick, point) => {
    let g = null;
    if (st && !st.over && st.phase === 'play' && st.turn === seat && point) {
      g = nearest(point);
      if (g && st.board[g.r][g.c] !== 0) g = null;
    }
    if (g && hover && g.r === hover.r && g.c === hover.c) return;
    hover = g;
    if (ghost) { S.remove(ghost); ghost = null; }
    if (g) { ghost = makeStone(seat === 0 ? 1 : 2, seat === 0 ? ghostB : ghostW); ghost.castShadow = false; ghost.position.copy(toWorld(g.r, g.c)); S.add(ghost); }
  };
  stage.onPick = (pick, point) => {
    if (!st || st.over || !point) return;
    stage.finishTweens();
    const g = nearest(point); if (!g) return;
    if (st.phase === 'scoring') ctx.send({ type: 'toggle-dead', r: g.r, c: g.c });
    else if (st.turn === seat) { ctx.send({ type: 'place', r: g.r, c: g.c }); stage.onHover(null, null); }
  };

  // ------------------------------------------------------------ controls
  const passB = btn('패스', 'primary', () => ctx.send({ type: 'pass' }));
  const acceptB = btn('계가 동의', 'primary', () => ctx.send({ type: 'accept-score' }));
  const resumeB = btn('대국 재개', 'ghost', () => ctx.send({ type: 'resume' }));
  const resign = btn('기권', 'ghost', () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); });
  const topB = btn('⬒ 위에서 보기', 'ghost', () => stage.setView(stage.view.phi > 0.3 ? { phi: 0.12 } : { phi: 0.62 }));
  bar.append(passB, acceptB, resumeB, resign, topB);

  function status() {
    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    let s;
    if (st.over) s = `<b>게임 종료</b><br>${st.result}`;
    else if (st.phase === 'scoring') {
      const si = st.scoreInfo || { black: 0, white: 0 };
      s = `<b>계가 중</b> — 죽은 돌을 클릭해 표시<br>흑 ${si.black} : 백 ${si.white} (덤 ${st.komi})<br>
        <span class="muted">동의: ${st.scoreAccept.map((a, i) => (i === 0 ? '흑' : '백') + (a ? '✅' : '⬜')).join(' ')}</span>`;
    } else s = `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>따낸 돌 — 흑 ${st.captures[0]} / 백 ${st.captures[1]}<br>
      <span class="muted">덤 ${st.komi} · 드래그 회전 · 휠 확대</span>`;
    ctx.status.innerHTML = s;
    passB.classList.toggle('hidden', st.phase !== 'play'); passB.disabled = st.over || st.turn !== seat;
    acceptB.classList.toggle('hidden', st.phase !== 'scoring' || st.over); acceptB.disabled = seat < 0 || (st.scoreAccept && st.scoreAccept[seat]);
    resumeB.classList.toggle('hidden', st.phase !== 'scoring' || st.over);
    resign.disabled = st.over || seat < 0;
    fillLog(log, (st.history || []).slice(-80).map((h, i, a) => `${st.history.length - a.length + i + 1}. ${h}`));
  }

  let built = null, orientedFor = null;
  ctx.root.__test = { screen: k => { const [r, c] = k.split(':')[1].split(',').map(Number); return stage.screenOf(toWorld(r, c)); } };
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (built !== st.n) { built = st.n; rebuildGeometry(st.n); }
      if (orientedFor !== seat) { stage.setView({ theta: seat === 1 ? Math.PI : 0 }, false); orientedFor = seat; }
      sync(state);
      status();
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}

// Same flood fill as the server's area scoring, used to draw territory markers.
function territory(board, n, dead) {
  const b = board.map(r => r.slice());
  for (const k of dead) { const [r, c] = k.split(',').map(Number); b[r][c] = 0; }
  const seen = Array.from({ length: n }, () => new Array(n).fill(false));
  const out = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (b[r][c] || seen[r][c]) continue;
    const region = [], borders = new Set(), stack = [[r, c]];
    seen[r][c] = true;
    while (stack.length) {
      const [cr, cc] = stack.pop(); region.push([cr, cc]);
      for (const [dr, dc] of NB) {
        const rr = cr + dr, c2 = cc + dc;
        if (rr < 0 || c2 < 0 || rr >= n || c2 >= n) continue;
        if (b[rr][c2] === 0) { if (!seen[rr][c2]) { seen[rr][c2] = true; stack.push([rr, c2]); } }
        else borders.add(b[rr][c2]);
      }
    }
    if (borders.size === 1) { const o = [...borders][0]; for (const [x, y] of region) out.push([x, y, o]); }
  }
  // dead stones count as the opponent's territory too
  for (const k of dead) { const [r, c] = k.split(',').map(Number); out.push([r, c, board[r][c] === 1 ? 2 : 1]); }
  return out;
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
