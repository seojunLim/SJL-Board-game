import { Stage, THREE, EASE, MOBILE, textSprite } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// 블록 공성전 (original game by 임서준).
// Build: your stone pedestal, a ghost block follows the pointer, click to
// drop it; R rotates, F places the flag; other castles hide under fog.
// Attack: drag back from your slingshot like Angry Birds and let go. The
// server simulates the physics and every screen replays the same motion.

const PLAYER_COLORS = [0xe0402f, 0x2f7de0, 0xf2c230, 0x3ab25a];
const hex = c => '#' + c.toString(16).padStart(6, '0');

export default function siege(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 27, phi: 0.82, minR: 8, maxR: 40, target: [0, 1.5, 0], maxPhi: 1.45 },
    mat: { w: 34, h: 34, r: 17, color: 0x3d5a2a, sheen: 0x9fc27a }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  let C = null;                         // constants from the server
  let st = null, seat = -1, built = false, won = false;
  const sizeOf = it => (it.k === 'f' ? C.FLAG : C.SIZES[it.o]);

  // ------------------------------------------------------------ materials
  const wood = woodTexture({ light: 0xeccf9c, dark: 0xc49a5e, rings: 5, size: 512, seed: 9, figure: 0.8 });
  const woodMat = new THREE.MeshPhysicalMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.5, roughness: 0.55, clearcoat: 0.15 });
  const endMats = PLAYER_COLORS.map(c => new THREE.MeshPhysicalMaterial({ map: wood.map, color: c, roughness: 0.5, clearcoat: 0.3 }));
  const ammoMat = new THREE.MeshPhysicalMaterial({ map: wood.map, color: 0x6a4a2a, roughness: 0.5, clearcoat: 0.3 });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: 0xf2c230, metalness: 0.7, roughness: 0.25, clearcoat: 0.6 });
  const stoneTex = paintedTexture('siege-stone', 512, 512, (g, W) => {
    g.fillStyle = '#8d8a83'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 1800; i++) { const v = 110 + Math.random() * 60; g.fillStyle = `rgba(${v},${v - 4},${v - 10},.35)`; g.fillRect(Math.random() * W, Math.random() * W, 3 + Math.random() * 6, 3 + Math.random() * 6); }
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 2;
    for (let k = 0; k <= 12; k++) { const p = (k / 12) * W; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, W); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
  });
  const stoneMat = new THREE.MeshPhysicalMaterial({ map: stoneTex, roughness: 0.85 });
  const geoCache = new Map();
  function boxGeo(size) {
    const k = size.join(',');
    if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(size[0], size[1] * 0.98, size[2], 2, Math.min(0.05, size[1] / 5)));
    return geoCache.get(k);
  }
  // wood block whose two end faces carry the owner's colour
  function blockMesh(kind, size, owner) {
    if (kind === 'f') {
      const g = new THREE.Group();
      const cube = new THREE.Mesh(boxGeo(size), goldMat); cube.castShadow = cube.receiveShadow = true;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0x5a4030 }));
      pole.position.y = size[1] / 2 + 0.8; pole.castShadow = true;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 8, 1), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[owner], side: THREE.DoubleSide, roughness: 0.7 }));
      cloth.position.set(0.42, size[1] / 2 + 1.35, 0); cloth.castShadow = true;
      g.add(cube, pole, cloth); g.userData.cloth = cloth;
      return g;
    }
    const long = size.indexOf(Math.max(...size));
    const mats = [0, 1, 2, 3, 4, 5].map(f => (Math.floor(f / 2) === long ? (kind === 'a' ? ammoMat : endMats[owner]) : (kind === 'a' ? ammoMat : woodMat)));
    const m = new THREE.Mesh(boxGeo(size), mats);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // ------------------------------------------------------------ arena
  const pedestals = [], slings = [], fogs = [], tags = [], gauges = [];
  const plane = new THREE.Group(); S.add(plane);
  const bodiesG = new THREE.Group(); S.add(bodiesG);
  const myG = new THREE.Group(); S.add(myG);
  const meshes = new Map();

  function buildArena() {
    st.plots.forEach((p, s) => {
      const ped = new THREE.Mesh(new RoundedBoxGeometry(C.HALF * 2 + 0.6, C.PED_TOP, C.HALF * 2 + 0.6, 3, 0.12), [stoneMat, stoneMat, stoneMat, stoneMat, stoneMat, stoneMat]);
      ped.position.set(p.cx, Y0 + C.PED_TOP / 2, p.cz); ped.castShadow = ped.receiveShadow = true; S.add(ped);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(C.HALF * 2 + 0.7, 0.12, C.HALF * 2 + 0.7), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[s], roughness: 0.5 }));
      trim.position.set(p.cx, Y0 + 0.08, p.cz); S.add(trim);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(C.HALF * 2, C.HALF * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
      top.position.set(p.cx, Y0 + C.PED_TOP + 0.001, p.cz); top.userData.pick = { plot: s }; S.add(top);
      pedestals.push(top);
      slings.push(buildSling(p, s));
      // fog that hides the castle while building
      const fog = new THREE.Group();
      const fm = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, transparent: true, opacity: 0.92, roughness: 1 });
      for (let k = 0; k < 14; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random() * 1.1, 16, 12), fm);
        b.position.set((Math.random() - 0.5) * 5, 1.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5);
        fog.add(b);
      }
      fog.position.set(p.cx, Y0 + C.PED_TOP, p.cz); fog.visible = false; S.add(fog); fogs.push(fog);
    });
  }
  function buildSling(p, s) {
    const g = new THREE.Group();
    const wd = new THREE.MeshPhysicalMaterial({ map: wood.map, color: 0x8a5a32, roughness: 0.6 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.5, 12), wd); stem.position.y = 0.75;
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 10), wd); armL.position.set(-0.32, 1.9, 0); armL.rotation.z = 0.5;
    const armR = armL.clone(); armR.position.x = 0.32; armR.rotation.z = -0.5;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 8, 20), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[s] })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05;
    for (const m of [stem, armL, armR]) m.castShadow = true;
    g.add(stem, armL, armR, ring);
    g.position.set(p.sx, Y0, p.sz);
    g.rotation.y = p.yaw;            // local +z toward the centre
    const tipL = new THREE.Vector3(-0.58, 2.4, 0), tipR = new THREE.Vector3(0.58, 2.4, 0);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 });
    const band = new THREE.Mesh(new THREE.BufferGeometry(), bandMat);
    g.add(band);
    g.userData = { tipL, tipR, band };
    setBand(g, new THREE.Vector3(0, 2.2, 0));
    S.add(g);
    return g;
  }
  function setBand(g, pocket) {
    const { tipL, tipR, band } = g.userData;
    const tube = (a, b) => new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.035, 5);
    band.geometry.dispose();
    const ga = tube(tipL, pocket), gb = tube(pocket, tipR);
    const merged = new THREE.BufferGeometry();
    const pa = ga.attributes.position.array, pb = gb.attributes.position.array;
    const pos = new Float32Array(pa.length + pb.length); pos.set(pa); pos.set(pb, pa.length);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const ia = ga.index.array, ib = gb.index.array, off = pa.length / 3;
    merged.setIndex([...ia, ...Array.from(ib, v => v + off)]);
    merged.computeVertexNormals();
    band.geometry = merged;
  }

  // ------------------------------------------------------------ build mode
  let items = [], orient = 0, flagMode = false, ghost = null, hoverLocal = null, sentAt = 0, draftT = 0;
  const myPlot = () => st.plots[seat];
  function stackLocal(list) {
    const out = [];
    for (const raw of list) {
      const it = { ...raw };
      const [sx, sy, sz] = sizeOf(it);
      let bottom = 0;
      for (const o of out) {
        const [ox, , oz] = sizeOf(o); const oy = sizeOf(o)[1];
        const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;
        if (ov(it.x - sx / 2, it.x + sx / 2, o.x - ox / 2, o.x + ox / 2) && ov(it.z - sz / 2, it.z + sz / 2, o.z - oz / 2, o.z + oz / 2)) bottom = Math.max(bottom, o.y + oy / 2);
      }
      it.y = bottom + sy / 2;
      out.push(it);
    }
    return out;
  }
  const blocksUsed = () => items.filter(i => i.k !== 'f').length;
  const hasFlag = () => items.some(i => i.k === 'f');
  const heightOf = list => list.reduce((m, it) => Math.max(m, it.y + sizeOf(it)[1] / 2), 0);
  function rebuildMine() {
    myG.clear();
    const p = myPlot();
    stackLocal(items).forEach((it, i) => {
      const m = blockMesh(it.k, sizeOf(it), seat);
      m.position.set(p.cx + it.x, Y0 + C.PED_TOP + it.y, p.cz + it.z);
      m.traverse(o => { o.userData.pick = { mine: i }; });
      m.userData.pick = { mine: i };
      myG.add(m);
    });
    updateBuildUi();
  }
  // the same half-cell grid and bounds the server enforces
  function snapAxis(v, size) {
    const lim = C.HALF - size / 2;
    let c = Math.round(v * 2) / 2;
    while (c > lim + 1e-9) c -= 0.5;
    while (c < -lim - 1e-9) c += 0.5;
    return c;
  }
  function candidate(localX, localZ) {
    const it = flagMode ? { k: 'f', o: 0 } : { k: 'b', o: orient };
    const [sx, , sz] = sizeOf(it);
    it.x = snapAxis(localX, sx); it.z = snapAxis(localZ, sz);
    return it;
  }
  function drawGhost() {
    if (ghost) { S.remove(ghost); ghost = null; }
    if (!hoverLocal || st.phase !== 'build' || st.done[seat]) return;
    const it = candidate(hoverLocal.x, hoverLocal.z);
    const placed = stackLocal([...items, it]).pop();
    const ok = (flagMode ? !hasFlag() : blocksUsed() < st.budget) && placed.y + sizeOf(placed)[1] / 2 <= C.MAX_TOP;
    ghost = new THREE.Mesh(boxGeo(sizeOf(it)), new THREE.MeshBasicMaterial({ color: ok ? 0x8cf0a6 : 0xff6a5a, transparent: true, opacity: 0.55, depthWrite: false }));
    const p = myPlot();
    ghost.position.set(p.cx + placed.x, Y0 + C.PED_TOP + placed.y, p.cz + placed.z);
    ghost.userData.ok = ok; ghost.userData.it = it;
    S.add(ghost);
  }
  function addPiece() {
    if (!ghost || !ghost.userData.ok) {
      if (flagMode && hasFlag()) ctx.toast('깃발은 하나만 놓을 수 있어요. 되돌리기로 치울 수 있어요.');
      else if (!flagMode && blocksUsed() >= st.budget) ctx.toast(`블록을 다 썼어요 (${st.budget}개).`);
      return;
    }
    items.push(ghost.userData.it);
    if (flagMode) flagMode = false;
    sfx.knock(0.35);
    rebuildMine(); drawGhost(); sendDraft();
  }
  function sendDraft() {
    clearTimeout(draftT);
    draftT = setTimeout(() => ctx.send({ type: 'draft', items }), 250);
  }
  function template(kind) {
    const out = [];
    const B = st.budget;
    if (kind === 'fort') {
      for (let l = 0; l < 4; l++) out.push({ k: 'b', o: 0, x: -1.5, z: -2.5 }, { k: 'b', o: 0, x: 1.5, z: -2.5 }, { k: 'b', o: 0, x: -1.5, z: 2.5 }, { k: 'b', o: 0, x: 1.5, z: 2.5 }, { k: 'b', o: 1, x: -2.5, z: 0 }, { k: 'b', o: 1, x: 2.5, z: 0 });
    } else if (kind === 'tower') {
      for (let l = 0; l < 10; l++) for (let k = -1; k <= 1; k++) out.push(l % 2 ? { k: 'b', o: 1, x: k, z: 0 } : { k: 'b', o: 0, x: 0, z: k });
    } else {
      for (const x of [-2, -1, 0, 1, 2]) out.push({ k: 'b', o: 2, x, z: -2.7 + 0.0 }, { k: 'b', o: 2, x, z: 2.7 });
      for (const z of [-1.5, -0.5, 0.5, 1.5]) out.push({ k: 'b', o: 3, x: -2.7, z }, { k: 'b', o: 3, x: 2.7, z });
      for (let l = 0; l < 6; l++) out.push(l % 2 ? { k: 'b', o: 1, x: 0, z: 0 } : { k: 'b', o: 0, x: 0, z: 0 });
    }
    // snap the thin uprights onto the grid the server uses
    const fixed = out.slice(0, B).map(it => { const [sx, , sz] = sizeOf(it); return { ...it, x: snapAxis(it.x, sx), z: snapAxis(it.z, sz) }; });
    fixed.push({ k: 'f', o: 0, x: 0, z: 0 });
    items = fixed; flagMode = false;
    rebuildMine(); drawGhost(); sendDraft();
  }

  // ------------------------------------------------------------ attack mode
  let playing = false, aim = null, dots = null, ammoPreview = null;
  const myTurn = () => st && !st.over && st.phase === 'attack' && seat >= 0 && st.turn === seat && st.alive[seat];
  function slingPocket(s) { const p = st.plots[s]; return new THREE.Vector3(p.sx, Y0 + p.sy, p.sz); }
  function aimFrom(dx, dy) {
    const p = myPlot();
    const pull = Math.hypot(dx, dy);
    const power = Math.min(1, pull / 230);
    const off = Math.max(-0.9, Math.min(0.9, dx * 0.004));
    const pitch = Math.max(-0.25, Math.min(1.3, 0.12 - dy * 0.005));
    return { yaw: p.yaw - off, pitch, power };
  }
  function showAim(a) {
    const s = seat;
    const dir = new THREE.Vector3(Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), Math.cos(a.yaw) * Math.cos(a.pitch));
    const pocket = slingPocket(s);
    const back = pocket.clone().addScaledVector(dir, -1.4 * a.power);
    const local = slings[s].worldToLocal(back.clone());
    setBand(slings[s], local);
    if (!ammoPreview) { ammoPreview = blockMesh('a', [3, C.BH, 1], s); S.add(ammoPreview); }
    ammoPreview.position.copy(back);
    ammoPreview.rotation.set(0, a.yaw + Math.PI / 2, 0);
    // dotted path for the first third of the flight
    if (dots) S.remove(dots);
    const v = 6 + 26 * a.power;
    const vel = dir.clone().multiplyScalar(v);
    const pts = [];
    let tGround = 0;
    for (let t = 0; t < 4; t += 0.02) { const y = pocket.y + vel.y * t + 0.5 * C.GRAVITY * t * t; if (y < Y0) { tGround = t; break; } }
    tGround = tGround || 2;
    for (let t = 0.05; t < tGround / 3; t += 0.05) pts.push(new THREE.Vector3(pocket.x + vel.x * t, pocket.y + vel.y * t + 0.5 * C.GRAVITY * t * t, pocket.z + vel.z * t));
    dots = new THREE.Group();
    const dg = new THREE.SphereGeometry(0.09, 8, 6), dm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const q of pts) { const d = new THREE.Mesh(dg, dm); d.position.copy(q); dots.add(d); }
    S.add(dots);
    powerEl.style.display = 'block';
    powerEl.innerHTML = `💪 ${Math.round(a.power * 100)}% · 각도 ${Math.round(a.pitch * 57)}°`;
  }
  function clearAim() {
    if (dots) { S.remove(dots); dots = null; }
    if (ammoPreview) { S.remove(ammoPreview); ammoPreview = null; }
    if (seat >= 0 && slings[seat]) setBand(slings[seat], new THREE.Vector3(0, 2.2, 0));
    powerEl.style.display = 'none';
  }
  stage.onDragStart = (e) => {
    if (!myTurn() || playing) return false;
    const sp = stage.screenOf(slingPocket(seat));
    if (Math.hypot(e.clientX - sp.x, e.clientY - sp.y) > (MOBILE ? 170 : 140)) return false;
    aim = { x0: e.clientX, y0: e.clientY, a: aimFrom(0, 0) };
    sfx.tile(0.2);
    showAim(aim.a);
    return true;
  };
  stage.onDragMove = e => { if (!aim) return; aim.a = aimFrom(aim.x0 - e.clientX, aim.y0 - e.clientY); showAim(aim.a); };
  stage.onDragEnd = () => {
    if (!aim) return;
    const a = aim.a; aim = null;
    clearAim();
    if (a.power < 0.08) { ctx.toast('더 세게 당겨야 날아가요!'); return; }
    sfx.whoosh(0.5);
    ctx.send({ type: 'shoot', yaw: a.yaw, pitch: a.pitch, power: a.power });
  };

  // ------------------------------------------------------------ bodies & replay
  function syncBodies() {
    const seen = new Set();
    for (const b of st.bodies) {
      seen.add(b.id);
      let m = meshes.get(b.id);
      if (!m) { m = blockMesh(b.kind, b.size, b.owner); meshes.set(b.id, m); bodiesG.add(m); }
      m.position.set(b.p[0], Y0 + b.p[1], b.p[2]);
      m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    }
    for (const [id, m] of meshes) if (!seen.has(id)) { bodiesG.remove(m); meshes.delete(id); }
  }
  let lastReplay = -1, rp = null;
  function startReplay(r) {
    // make sure every body has a mesh, then drive the moving ones
    for (const b of st.bodies) if (!meshes.has(b.id)) { const m = blockMesh(b.kind, b.size, b.owner); meshes.set(b.id, m); bodiesG.add(m); }
    rp = { r, t0: performance.now(), knocks: 0 };
    playing = true;
    if (r.kind === 'shot') {
      const p = st.plots[r.shooter];
      // watch from high up behind the shooter
      stage.target.set(0, Y0 + 1.5, 0);
      stage.setView({ theta: Math.atan2(p.cx, p.cz), phi: 0.72, radius: 26 });
    }
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function stepReplay() {
    const { r } = rp;
    const f = ((performance.now() - rp.t0) / 1000) * r.fps;
    const i = Math.min(r.frames.length - 1, Math.floor(f)), j = Math.min(r.frames.length - 1, i + 1), k = Math.min(1, f - i);
    const A = r.frames[i], B = r.frames[j];
    r.ids.forEach((id, n) => {
      const m = meshes.get(id); if (!m) return;
      const o = n * 7;
      m.position.set((A[o] + (B[o] - A[o]) * k) / 100, Y0 + (A[o + 1] + (B[o + 1] - A[o + 1]) * k) / 100, (A[o + 2] + (B[o + 2] - A[o + 2]) * k) / 100);
      qa.set(A[o + 3] / 1000, A[o + 4] / 1000, A[o + 5] / 1000, A[o + 6] / 1000).normalize();
      qb.set(B[o + 3] / 1000, B[o + 4] / 1000, B[o + 5] / 1000, B[o + 6] / 1000).normalize();
      m.quaternion.slerpQuaternions(qa, qb, k);
    });
    // clatter while things are falling
    if (i > 2 && i % 3 === 0 && rp.knocks < 14 && rp.lastI !== i) { rp.lastI = i; rp.knocks++; sfx.knock(0.25 + Math.random() * 0.2); }
    if (f >= r.frames.length - 1) {
      rp = null; playing = false;
      syncBodies(); afterReplay();
    }
  }
  function afterReplay() {
    updateTags();
    updateUi();
    if (myTurn()) focusSling();
    else if (st.phase === 'attack') overview();
  }
  // look over the slingshot toward the others, from in front of my castle
  function focusSling() {
    const p = myPlot();
    const d = Math.hypot(p.sx, p.sz) || 1, ux = p.sx / d, uz = p.sz / d;
    stage.target.set(p.sx - ux * 5, Y0 + 1.5, p.sz - uz * 5);
    stage.setView({ theta: Math.atan2(ux, uz), phi: 1.0, radius: 9.5 });
  }
  function overview() {
    stage.target.set(0, Y0 + 1.5, 0);
    stage.setView({ phi: 0.82, radius: 27 });
  }

  // ------------------------------------------------------------ labels & ui
  function updateTags() {
    tags.forEach(t => { S.remove(t); t.material.map.dispose(); t.material.dispose(); }); tags.length = 0;
    st.plots.forEach((p, s) => {
      let text;
      if (st.phase === 'build') text = `${st.names[s]} · ${st.done[s] ? '완료 ✔' : `건설 중… ${st.counts[s]}개`}`;
      else if (!st.alive[s]) text = `${st.names[s]} 💀 탈락`;
      else text = `${st.names[s]} 🏰 높이 ${st.heights[s].toFixed(1)}`;
      const danger = st.phase !== 'build' && st.alive[s] && st.heights[s] < C.OUT_HEIGHT * 2;
      const t = textSprite(text, { scale: 0.0075, border: st.phase === 'attack' && st.turn === s ? '#ffc861' : danger ? '#ff6a5a' : null });
      t.position.set(p.cx, Y0 + C.PED_TOP + (st.phase === 'build' && s !== seat ? 7.5 : 8), p.cz);
      S.add(t); tags.push(t);
    });
  }

  const rotB = btn('🔄 회전 (R)', '', () => { orient = (orient + 1) % 4; flagMode = false; drawGhost(); updateBuildUi(); });
  const flagB = btn('🚩 깃발 (F)', '', () => { flagMode = !flagMode; drawGhost(); updateBuildUi(); });
  const undoB = btn('↩ 되돌리기 (Z)', 'ghost', () => { items.pop(); rebuildMine(); drawGhost(); sendDraft(); });
  const clearB = btn('🗑 지우기', 'ghost', () => { if (items.length && confirm('다 지울까요?')) { items = []; rebuildMine(); drawGhost(); sendDraft(); } });
  const tFort = btn('🏯 요새', 'ghost', () => template('fort'));
  const tTower = btn('🗼 탑', 'ghost', () => template('tower'));
  const tWall = btn('🧱 성벽', 'ghost', () => template('wall'));
  const doneB = btn('✅ 완료', 'primary', () => { clearTimeout(draftT); ctx.send({ type: 'submit', items }); });
  const resign = btn('항복', 'ghost', () => { if (confirm('정말 항복할까요?')) ctx.send({ type: 'resign' }); });
  const buildBar = el('span', 'row'); buildBar.append(rotB, flagB, undoB, clearB, tFort, tTower, tWall, doneB);
  bar.append(buildBar, resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const powerEl = el('div', 'siegePower'); holder.appendChild(powerEl); powerEl.style.display = 'none';
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1800); };
  const ORIENT_KO = ['가로 눕힘', '세로 눕힘', '세움 (앞뒤)', '세움 (좌우)'];

  function updateBuildUi() {
    if (!st || st.phase !== 'build' || seat < 0) return;
    const h = heightOf(stackLocal(items));
    rotB.textContent = `🔄 ${ORIENT_KO[orient]} (R)`;
    flagB.classList.toggle('primary', flagMode);
    doneB.disabled = st.done[seat] || !hasFlag() || h < C.MIN_HEIGHT - 1e-6;
    for (const b of [rotB, flagB, undoB, clearB, tFort, tTower, tWall]) b.disabled = st.done[seat];
  }
  let clockOffset = 0;
  function updateUi() {
    const building = st.phase === 'build';
    buildBar.style.display = building && seat >= 0 ? '' : 'none';
    resign.disabled = st.over || seat < 0 || !st.alive[seat];
    const left = Math.max(0, Math.ceil((st.deadline - (Date.now() + clockOffset)) / 1000));
    if (building) {
      const h = heightOf(stackLocal(items));
      ctx.status.innerHTML = `<b>🏗️ 건설 단계</b> · 남은 시간 <b class="siegeClock">${left}</b>초<br>
        블록 <b>${blocksUsed()}</b>/${st.budget} · 깃발 ${hasFlag() ? '✔' : '<b style="color:#ff8a6a">아직</b>'} · 높이 ${h.toFixed(1)} ${h >= C.MIN_HEIGHT - 1e-6 ? '✔' : `(최소 ${C.MIN_HEIGHT.toFixed(1)})`}<br>
        <span class="muted">${seat < 0 ? '구경 중' : st.done[seat] ? '완료! 다른 사람을 기다리는 중…' : '성터를 클릭해 블록을 쌓아요. R 회전 · F 깃발 · Z 되돌리기. 템플릿으로 시작해도 돼요.'}</span>`;
    } else if (!st.over) {
      ctx.status.innerHTML = `<b>⚔️ 공격 단계</b> · 차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''} · <b class="siegeClock">${playing ? '' : left + '초'}</b><br>
        <span class="muted">${playing ? '와르르…' : myTurn() ? '내 새총을 잡고 뒤로 당겼다 놓으세요! (좌우로 방향, 아래로 당기면 높이 쏴요)' : seat >= 0 && !st.alive[seat] ? '탈락했어요. 구경하세요!' : '상대가 조준하는 중…'}</span><br>
        <span class="muted">깃발이 받침 밖으로 떨어지거나, 성 높이가 ${C.OUT_HEIGHT.toFixed(1)} 이하가 되면 탈락</span>`;
    } else ctx.status.innerHTML = `<b>게임 종료</b><br>${st.result}`;
    hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.phase === 'attack' && st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${!st.alive[i] ? 'out' : ''}"><span style="color:${hex(PLAYER_COLORS[i])}">■</span> ${nm}${st.phase === 'attack' ? ` 🏰${st.heights[i].toFixed(1)}` : ''}</span>`).join('');
    fillLog(log, st.log);
  }

  // ------------------------------------------------------------ input
  stage.onHover = (pick, point) => {
    if (!st || st.phase !== 'build' || seat < 0 || st.done[seat]) return;
    if (!pick || !point || (pick.plot !== seat && pick.mine == null)) { if (hoverLocal) { hoverLocal = null; drawGhost(); } return; }
    const p = myPlot();
    const nx = point.x - p.cx, nz = point.z - p.cz;
    hoverLocal = { x: nx, z: nz };
    drawGhost();
  };
  stage.onPick = (pick, point, obj, ptr) => {
    if (!st || st.phase !== 'build' || seat < 0 || st.done[seat] || !pick) return;
    if (pick.plot !== seat && pick.mine == null) return;
    const p = myPlot();
    const local = { x: point.x - p.cx, z: point.z - p.cz };
    if (ptr === 'touch' && !(hoverLocal && Math.abs(hoverLocal.x - local.x) < 0.3 && Math.abs(hoverLocal.z - local.z) < 0.3 && ghost)) { hoverLocal = local; drawGhost(); return; }
    hoverLocal = local; drawGhost(); addPiece();
  };
  const onKey = e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || !st || st.phase !== 'build') return;
    if (e.key === 'r' || e.key === 'R') rotB.click();
    if (e.key === 'f' || e.key === 'F') flagB.click();
    if (e.key === 'z' || e.key === 'Z') undoB.click();
  };
  window.addEventListener('keydown', onKey);

  stage.tick = () => {
    if (rp) stepReplay();
    const t = performance.now() / 1000;
    fogs.forEach((f, i) => { if (f.visible) { f.rotation.y = t * 0.1 + i; f.children.forEach((b, k) => { b.position.y += Math.sin(t + k) * 0.002; }); } });
    for (const m of [...meshes.values(), ...myG.children]) if (m.userData.cloth) m.userData.cloth.rotation.y = Math.sin(t * 3 + m.id) * 0.25;
    const clock = ctx.status.querySelector('.siegeClock');
    if (clock && st && !playing && !st.over) {
      const left = Math.max(0, Math.ceil((st.deadline - (Date.now() + clockOffset)) / 1000));
      clock.textContent = st.phase === 'build' ? String(left) : left + '초';
    }
  };

  ctx.root.__test = {
    state: () => st,
    playing: () => playing,
    template: k => template(k),
    submit: () => doneB.click(),
    shoot: a => ctx.send({ type: 'shoot', ...a }),
    screen: k => {
      const [kind, v] = k.split(':');
      if (kind === 'sling') return stage.screenOf(slingPocket(+v));
      if (kind === 'plot') { const p = st.plots[+v]; return stage.screenOf(new THREE.Vector3(p.cx, Y0 + C.PED_TOP, p.cz)); }
      return null;
    }
  };

  let prevPhase = null, prevAlive = null, prevTurn = -1;
  return {
    winDelay: 2800,
    render(state, mySeat) {
      st = state; seat = mySeat;
      clockOffset = state.now - Date.now();
      if (!built) {
        C = state.consts; built = true; buildArena();
        if (seat >= 0) { items = (state.myDraft || []).map(x => ({ ...x })); rebuildMine(); }
        if (state.phase === 'build' && seat >= 0) { const p = myPlot(); stage.setView({ theta: Math.atan2(p.cx, p.cz), phi: 0.9, radius: 14 }, false); stage.target.set(p.cx, Y0 + 2, p.cz); }
      }
      const building = state.phase === 'build';
      fogs.forEach((f, s) => { f.visible = building && s !== seat; });
      myG.visible = building;
      bodiesG.visible = !building;
      if (prevPhase === 'build' && !building) {
        // the fog lifts
        overview();
        flash('🌫️ 안개가 걷혔어요! 서로의 성이 보여요');
        sfx.whoosh(0.5);
        if (ghost) { S.remove(ghost); ghost = null; }
      }
      if (!building) {
        if (state.replay && state.replay.seq !== lastReplay) {
          lastReplay = state.replay.seq;
          if (state.replay.kind === 'settle' || prevPhase !== null) {
            // pose the bodies at the replay's first frame, then play it
            syncBodies();
            const r = state.replay, A = r.frames[0];
            r.ids.forEach((id, n) => { const m = meshes.get(id); if (!m) return; const o = n * 7; m.position.set(A[o] / 100, Y0 + A[o + 1] / 100, A[o + 2] / 100); m.quaternion.set(A[o + 3] / 1000, A[o + 4] / 1000, A[o + 5] / 1000, A[o + 6] / 1000).normalize(); });
            startReplay(r);
          } else syncBodies();
        } else if (!playing) syncBodies();
        if (!playing && myTurn() && (prevPhase !== 'attack' || prevTurn !== state.turn)) focusSling();
        else if (!playing && !myTurn() && prevTurn === seat && prevTurn !== state.turn) overview();
        const newlyOut = prevAlive && state.alive.map((a, i) => prevAlive[i] && !a).some(Boolean);
        if (newlyOut) setTimeout(() => { flash('💥 성이 함락됐어요!'); sfx.buzz(0.3); }, playing ? 1500 : 0);
      }
      prevAlive = state.alive.slice();
      prevPhase = state.phase; prevTurn = state.turn;
      updateTags(); updateBuildUi(); updateUi();
      stage.setPickables(building ? [...pedestals, ...myG.children] : []);
      if (state.over && !won) { won = true; setTimeout(() => sfx.win(), 2000); }
    },
    destroy() { window.removeEventListener('keydown', onKey); clearTimeout(draftT); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
