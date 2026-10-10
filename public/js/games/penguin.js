import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Penguin ice breaker: a blue plastic frame on legs holding a sheet of ice
// cubes, a penguin on the middle one. Hover a cube to see what would drop
// with it (red), click to swing your hammer. Knocked-out cubes tumble onto
// the table and stay there.

const N = 7, CS = 0.8, IH = 0.5;
const PLAYER_COLORS = [0xe0402f, 0x2f7de0, 0xf2c230, 0x3ab25a];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Deterministic part of the server's hold model (no random slips).
function preview(ice, r0, c0, C) {
  const g = ice.map(r => r.slice());
  g[r0][c0] = false;
  const nb = (r, c) => DIRS.reduce((k, [dr, dc]) => k + (g[r + dr] && g[r + dr][c + dc] ? 1 : 0), 0);
  const edge = (r, c) => r === 0 || c === 0 || r === N - 1 || c === N - 1;
  const corner = (r, c) => (r === 0 || r === N - 1) && (c === 0 || c === N - 1);
  const drop = [];
  for (let pass = 0; pass < 20; pass++) {
    const held = g.map(r => r.map(() => false));
    const q = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c] && edge(r, c) && (corner(r, c) || nb(r, c) > 0)) { held[r][c] = true; q.push([r, c]); }
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of DIRS) { const rr = r + dr, cc = c + dc; if (g[rr] && g[rr][cc] && !held[rr][cc]) { held[rr][cc] = true; q.push([rr, cc]); } }
    }
    if (g[C][C] && nb(C, C) < 2) held[C][C] = false;
    let ch = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c] && !held[r][c]) { g[r][c] = false; drop.push([r, c]); ch = true; }
    if (!ch) break;
  }
  return drop;
}

function buildPenguin() {
  const g = new THREE.Group();
  const black = new THREE.MeshPhysicalMaterial({ color: 0x1c2230, roughness: 0.35, clearcoat: 0.8 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf6f6f2, roughness: 0.4, clearcoat: 0.6 });
  const orange = new THREE.MeshPhysicalMaterial({ color: 0xff9a1f, roughness: 0.4, clearcoat: 0.5 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 32, 24);
  add(sph, black, 0, 0.42, 0, 0.3, 0.38, 0.27);
  add(sph, white, 0, 0.38, 0.08, 0.23, 0.3, 0.22);
  add(sph, black, 0, 0.86, 0.01, 0.21, 0.2, 0.2);
  add(sph, white, -0.075, 0.88, 0.14, 0.08, 0.09, 0.06);
  add(sph, white, 0.075, 0.88, 0.14, 0.08, 0.09, 0.06);
  add(sph, black, -0.07, 0.89, 0.19, 0.032, 0.04, 0.02);
  add(sph, black, 0.07, 0.89, 0.19, 0.032, 0.04, 0.02);
  const beak = add(new THREE.ConeGeometry(0.06, 0.15, 16), orange, 0, 0.82, 0.24); beak.rotation.x = Math.PI / 2;
  const fl = add(sph, black, -0.29, 0.46, 0, 0.05, 0.22, 0.12); fl.rotation.z = -0.35;
  const fr = add(sph, black, 0.29, 0.46, 0, 0.05, 0.22, 0.12); fr.rotation.z = 0.35;
  add(sph, orange, -0.1, 0.04, 0.08, 0.1, 0.04, 0.14);
  add(sph, orange, 0.1, 0.04, 0.08, 0.1, 0.04, 0.14);
  // a little red scarf
  const scarf = add(new THREE.TorusGeometry(0.17, 0.045, 10, 28), new THREE.MeshStandardMaterial({ color: 0xd8333a, roughness: 0.8 }), 0, 0.68, 0);
  scarf.rotation.x = Math.PI / 2;
  g.userData.flippers = [fl, fr];
  return g;
}

function buildHammer(color) {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0xf2e4c4, roughness: 0.6 }));
  handle.position.y = 0.8; handle.castShadow = true;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 24), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8 }));
  head.rotation.z = Math.PI / 2; head.position.y = 1.65; head.castShadow = true;
  g.add(handle, head);
  return g;
}

export default function penguin(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 12.5, phi: 0.82, minR: 5, maxR: 22, target: [0, 1.2, 0.7], maxPhi: 1.4 },
    mat: { w: 12, h: 10, r: 1.2, color: 0x16324f, sheen: 0x5f8fbf }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;
  const ICE_Y = Y0 + 2.0;                 // top of the frame
  const span = N * CS;

  // ------------------------------------------------------------ frame
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x0f5fc4, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.1 });
  const frame = new THREE.Group(); S.add(frame);
  const rail = (w, d, x, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.32, d, 3, 0.08), blue); m.position.set(x, ICE_Y - 0.1, z); m.castShadow = m.receiveShadow = true; frame.add(m); };
  const B = 0.55;
  rail(span + B * 2, B, 0, -(span + B) / 2); rail(span + B * 2, B, 0, (span + B) / 2);
  rail(B, span, -(span + B) / 2, 0); rail(B, span, (span + B) / 2, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, ICE_Y - Y0, 20), blue);
    leg.position.set(sx * (span / 2 + B / 2), Y0 + (ICE_Y - Y0) / 2 - 0.1, sz * (span / 2 + B / 2)); leg.castShadow = true; frame.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.1, 24), blue);
    foot.position.set(leg.position.x, Y0 + 0.05, leg.position.z); foot.receiveShadow = foot.castShadow = true; frame.add(foot);
  }
  // snowy dashes along the rails
  const frost = paintedTexture('pg-frost', 256, 256, (g, W) => {
    g.fillStyle = '#e8f6ff'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 260; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.5})`; g.lineWidth = Math.random() * 2;
      const x = Math.random() * W, y = Math.random() * W, a = Math.random() * Math.PI;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); g.stroke();
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,200,235,${Math.random() * 0.3})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * W, Math.random() * 18, 0, 7); g.fill(); }
  });
  const iceMat = new THREE.MeshPhysicalMaterial({ map: frost, color: 0xa9d8f5, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: MOBILE ? 0.88 : 0.78, envMapIntensity: 0.9 });
  const hiMat = iceMat.clone(); hiMat.color.set(0xfff3b0); hiMat.emissive = new THREE.Color(0x8a6a00); hiMat.emissiveIntensity = 0.4;
  const dropMat = iceMat.clone(); dropMat.color.set(0xff9a9a); dropMat.emissive = new THREE.Color(0x8a1010); dropMat.emissiveIntensity = 0.35;
  const cubeGeo = new RoundedBoxGeometry(CS * 0.97, IH, CS * 0.97, 3, 0.08);
  const cellPos = (r, c) => new THREE.Vector3((c - (N - 1) / 2) * CS, ICE_Y - IH / 2 + 0.02, (r - (N - 1) / 2) * CS);

  const sheet = new THREE.Group(); S.add(sheet);
  const pile = new THREE.Group(); S.add(pile);
  const peng = buildPenguin(); S.add(peng);
  let cubes = new Map();
  let st = null, seat = -1, hover = null, armed = null, prevSeq = -1, penguinGone = false, won = false;
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;

  // where a knocked-out cube comes to rest on the table
  function restOf(r, c) {
    const rnd = seeded(r * 97 + c * 13 + 5);
    const p = cellPos(r, c);
    return { pos: new THREE.Vector3(p.x * 1.05 + (rnd() - 0.5) * 0.9, Y0 + IH * 0.5 - 0.02, p.z * 1.05 + (rnd() - 0.5) * 0.9), rot: new THREE.Euler(0, rnd() * Math.PI, (rnd() < 0.3 ? Math.PI / 2 : 0)) };
  }
  function build() {
    sheet.clear(); pile.clear(); cubes = new Map();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (st.ice[r][c]) {
        const m = new THREE.Mesh(cubeGeo, iceMat);
        m.position.copy(cellPos(r, c)); m.castShadow = m.receiveShadow = true;
        m.userData = { pick: { r, c } };
        sheet.add(m); cubes.set(r + ',' + c, m);
      } else {
        const m = new THREE.Mesh(cubeGeo, iceMat);
        const rs = restOf(r, c); m.position.copy(rs.pos); m.rotation.copy(rs.rot); m.castShadow = m.receiveShadow = true;
        pile.add(m);
      }
    }
    const [pr, pc] = st.penguin;
    if (!penguinGone) { peng.position.copy(cellPos(pr, pc)).setY(ICE_Y + 0.02); peng.rotation.set(0, 0, 0); }
    stage.setPickables(st.over ? [] : [...cubes.values()]);
    paint();
  }
  function paint() {
    for (const m of cubes.values()) m.material = iceMat;
    const target = armed || hover;
    if (!target || !myTurn() || !st.ice[target.r][target.c]) { dangerTag(null); return; }
    const k = cubes.get(target.r + ',' + target.c); if (k) k.material = hiMat;
    const d = preview(st.ice, target.r, target.c, st.penguin[0]);
    for (const [r, c] of d) { const m = cubes.get(r + ',' + c); if (m) m.material = dropMat; }
    const pengDrops = (target.r === st.penguin[0] && target.c === st.penguin[1]) || d.some(([r, c]) => r === st.penguin[0] && c === st.penguin[1]);
    dangerTag(pengDrops ? '🐧 펭귄이 떨어져요!' : d.length ? `${d.length}개가 같이 떨어져요` : null, pengDrops);
  }
  const warn = el('div', 'pgWarn hidden'); holder.appendChild(warn);
  function dangerTag(t, bad) { warn.textContent = t || ''; warn.classList.toggle('hidden', !t); warn.classList.toggle('bad', !!bad); }

  // ------------------------------------------------------------ animations
  function swing(seatIdx, r, c, done) {
    const outer = new THREE.Group(), h = buildHammer(PLAYER_COLORS[seatIdx % 4]);
    outer.add(h);
    const p = cellPos(r, c);
    // come in from whichever side faces the camera
    const cam = stage.camera.position;
    const dirOut = new THREE.Vector3(cam.x - p.x, 0, cam.z - p.z).normalize();
    outer.position.set(p.x + dirOut.x * 1.65, ICE_Y + 0.2, p.z + dirOut.z * 1.65);
    outer.rotation.y = Math.atan2(-dirOut.x, -dirOut.z);     // local +z points at the cube
    S.add(outer);
    h.rotation.x = -0.2;
    stage.tween(260, k => { h.rotation.x = -0.2 - k * 0.35; }, { ease: EASE.outCubic });
    stage.tween(170, k => { h.rotation.x = -0.55 + k * (Math.PI / 2 + 0.47); }, { delay: 260, ease: EASE.inCubic, done: () => { sfx.stone(0.7); sfx.tile(0.4); done(); } });
    stage.tween(420, k => { outer.position.y = ICE_Y + 0.2 + k * 1.2; for (const m of h.children) { m.material.transparent = true; m.material.opacity = 1 - k; } },
      { delay: 520, done: () => S.remove(outer) });
  }
  function dropCube(r, c, delay) {
    const m = new THREE.Mesh(cubeGeo, iceMat);
    const from = cellPos(r, c); const rs = restOf(r, c);
    m.position.copy(from); m.castShadow = true; S.add(m);
    const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion().setFromEuler(rs.rot);
    stage.tween(620, k => { m.position.lerpVectors(from, rs.pos, k); m.position.y = from.y + (rs.pos.y - from.y) * k * k + Math.sin(k * Math.PI) * 0.2; m.quaternion.slerpQuaternions(q0, q1, k); },
      { delay, ease: k => k, done: () => { S.remove(m); sfx.tile(0.3); } });
    return m;
  }
  function dropPenguin(delay) {
    penguinGone = true;
    const from = peng.position.clone();
    const to = new THREE.Vector3(from.x + 0.6, Y0 + 0.28, from.z + 0.5);
    stage.tween(900, k => {
      peng.position.lerpVectors(from, to, k); peng.position.y = from.y + (to.y - from.y) * k * k;
      peng.rotation.z = k * 1.55; peng.rotation.y = k * 2;
    }, { delay, ease: k => k, done: () => { sfx.buzz(0.3); } });
  }
  function playLast(last) {
    const [hr, hc] = last.hit;
    // the cube is still drawn until the hammer lands
    const ghost = new THREE.Mesh(cubeGeo, iceMat); ghost.position.copy(cellPos(hr, hc)); S.add(ghost);
    const ghosts = last.dropped.map(([r, c]) => { const m = new THREE.Mesh(cubeGeo, iceMat); m.position.copy(cellPos(r, c)); S.add(m); return m; });
    // hide their table copies until they land
    const landed = pile.children.filter(m => [last.hit, ...last.dropped].some(([r, c]) => restOf(r, c).pos.distanceTo(m.position) < 1e-3));
    landed.forEach(m => { m.visible = false; });
    if (last.fell) { peng.position.y = ICE_Y + 0.02; }
    swing(last.seat, hr, hc, () => {
      S.remove(ghost); dropCube(hr, hc, 0);
      ghosts.forEach((g, i) => { setTimeout(() => S.remove(g), 120 + i * 90); dropCube(last.dropped[i][0], last.dropped[i][1], 120 + i * 90); });
      setTimeout(() => landed.forEach(m => { m.visible = true; }), 760 + last.dropped.length * 90);
      if (last.fell) dropPenguin(150);
    });
  }

  stage.onHover = pick => {
    const h = pick && pick.r != null ? pick : null;
    if ((h && hover && h.r === hover.r && h.c === hover.c) || (!h && !hover)) return;
    hover = h; paint();
  };
  stage.onPick = (pick, pt, obj, ptr) => {
    if (!pick || !st || pick.r == null) return;
    if (!myTurn()) { ctx.toast(st.over ? '게임이 끝났어요.' : '내 차례가 아니에요.'); return; }
    stage.finishTweens();
    if (ptr === 'touch' && !(armed && armed.r === pick.r && armed.c === pick.c)) { armed = pick; paint(); ctx.toast('한 번 더 누르면 깨요!'); return; }
    armed = null;
    ctx.send({ type: 'hit', r: pick.r, c: pick.c });
  };

  const resign = btn('포기', 'ghost', () => { if (confirm('정말 포기할까요?')) ctx.send({ type: 'resign' }); });
  bar.append(resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);

  stage.tick = () => {
    if (penguinGone || !st) return;
    const t = performance.now() / 1000;
    // the fewer neighbours the penguin has, the more nervous it gets
    const [pr, pc] = st.penguin;
    const nb = DIRS.reduce((k, [dr, dc]) => k + (st.ice[pr + dr] && st.ice[pr + dr][pc + dc] ? 1 : 0), 0);
    const nerv = (4 - nb) / 4;
    peng.rotation.y = Math.sin(t * 0.8) * 0.5;
    peng.rotation.z = Math.sin(t * (6 + nerv * 14)) * (0.01 + nerv * 0.06);
    const [fl, fr] = peng.userData.flippers;
    fl.rotation.z = -0.35 - Math.max(0, Math.sin(t * (2 + nerv * 10))) * nerv * 0.8;
    fr.rotation.z = 0.35 + Math.max(0, Math.sin(t * (2 + nerv * 10) + 1)) * nerv * 0.8;
  };

  ctx.root.__test = {
    screen: k => {
      const [kind, rest] = k.split(':');
      if (kind !== 'ice') return null;
      const [r, c] = rest.split(',').map(Number);
      return stage.screenOf(cellPos(r, c).setY(ICE_Y));
    },
    state: () => st
  };

  return {
    winDelay: 2400,
    render(state, mySeat) {
      stage.finishTweens();
      const before = st;
      st = state; seat = mySeat;
      armed = null;
      const fresh = before && state.seq !== prevSeq && state.last;
      if (fresh && state.last.fell) penguinGone = false;   // stay up until the animation knocks it off
      build();
      if (fresh) playLast(state.last);
      else if (!before && state.over && state.last && state.last.fell) { penguinGone = true; peng.position.set(0.6, Y0 + 0.28, 0.5); peng.rotation.set(0, 2, 1.55); }
      prevSeq = state.seq;
      const left = st.ice.flat().filter(Boolean).length;
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''}<br>남은 얼음 ${left}개<br>
           <span class="muted">${myTurn() ? `깰 얼음을 고르세요. 빨갛게 보이는 얼음은 같이 떨어져요.${MOBILE ? ' (두 번 탭)' : ''}` : '상대 차례…'}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${st.loser === i ? 'out' : ''}"><span style="color:#${PLAYER_COLORS[i % 4].toString(16).padStart(6, '0')}">🔨</span> ${nm}</span>`).join('');
      resign.disabled = st.over || seat < 0;
      fillLog(log, st.log);
      if (st.over && !won) { won = true; if (st.loser !== seat && seat >= 0) setTimeout(() => sfx.win(), 1300); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
