import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// 통아저씨: a wooden barrel with iron hoops and 24 slots, a pirate peeking
// out of the top. Click a slot to push your sword in. One slot springs the
// pirate into the air.

const H = 2.7, ROWS = 4, COLS = 6;
const PLAYER_COLORS = [0xe0402f, 0x2f7de0, 0xf2c230, 0x3ab25a, 0xa35bdb, 0xff8a2a];
const radiusAt = y => 1.25 + 0.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, y / H)));

function staveTexture() {
  return paintedTexture('pirate-staves', 1024, 512, (g, W, Hh) => {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W, w = W / n;
      const base = [150, 92, 48].map(c => c + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 30);
      const grd = g.createLinearGradient(x, 0, x + w, 0);
      grd.addColorStop(0, `rgb(${base.map(c => c * 0.75 | 0)})`);
      grd.addColorStop(0.5, `rgb(${base.map(c => c | 0)})`);
      grd.addColorStop(1, `rgb(${base.map(c => c * 0.7 | 0)})`);
      g.fillStyle = grd; g.fillRect(x, 0, w, Hh);
      // grain
      g.strokeStyle = 'rgba(60,30,10,.25)'; g.lineWidth = 1.2;
      for (let k = 0; k < 7; k++) { const gx = x + Math.random() * w; g.beginPath(); g.moveTo(gx, 0); g.bezierCurveTo(gx + 6, Hh * 0.3, gx - 6, Hh * 0.6, gx + 3, Hh); g.stroke(); }
      g.fillStyle = 'rgba(30,15,5,.6)'; g.fillRect(x, 0, 2.5, Hh);
    }
  });
}

function buildPirate() {
  const g = new THREE.Group();
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xf1c08f, roughness: 0.5, clearcoat: 0.3 });
  const red = new THREE.MeshPhysicalMaterial({ color: 0xd42a2a, roughness: 0.4, clearcoat: 0.5 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const striped = new THREE.MeshPhysicalMaterial({ map: paintedTexture('pirate-shirt', 64, 256, (c, W, Hh) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#fff' : '#d42a2a'; c.fillRect(0, i * Hh / 8, W, Hh / 8); } }), roughness: 0.6 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  const sph = new THREE.SphereGeometry(1, 32, 24);
  add(new THREE.CylinderGeometry(0.42, 0.5, 0.7, 28), striped, 0, -0.05, 0);
  add(sph, skin, 0, 0.62, 0, 0.42, 0.44, 0.42);
  const cap = add(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.72, 0, 0.45, 0.4, 0.45);
  cap.rotation.x = -0.15;
  // white dots on the bandana
  for (let i = 0; i < 8; i++) { const a = i * 0.8; add(sph, white, Math.cos(a) * 0.3, 0.92 + (i % 2) * 0.08, Math.sin(a) * 0.3, 0.05, 0.03, 0.05); }
  add(sph, red, 0.36, 0.78, -0.22, 0.12, 0.08, 0.16);   // knot
  add(sph, white, -0.15, 0.68, 0.36, 0.09, 0.1, 0.05);
  add(sph, black, -0.15, 0.68, 0.4, 0.045, 0.05, 0.03);
  add(sph, black, 0.15, 0.68, 0.39, 0.12, 0.1, 0.04);   // eye patch
  const strap = add(new THREE.TorusGeometry(0.44, 0.012, 6, 40), black, 0, 0.72, 0); strap.rotation.set(Math.PI / 2 - 0.35, 0, 0.5);
  add(sph, skin, 0, 0.55, 0.42, 0.07, 0.06, 0.06);    // nose
  add(sph, black, 0, 0.36, 0.3, 0.3, 0.16, 0.18);      // beard
  const mouth = add(new THREE.TorusGeometry(0.08, 0.018, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a1a1a }), 0, 0.46, 0.43); mouth.rotation.z = Math.PI;
  return g;
}

function buildSword(color) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.5), new THREE.MeshPhysicalMaterial({ color: 0xd8dde3, metalness: 0.8, roughness: 0.25 }));
  blade.position.z = -0.75;
  const guard = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.5, 0.08, 2, 0.03), new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8 }));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.45, 14), new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8 }));
  grip.rotation.x = Math.PI / 2; grip.position.z = 0.26;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), guard.material);
  pommel.position.z = 0.5;
  for (const m of [blade, guard, grip, pommel]) { m.castShadow = true; g.add(m); }
  return g;
}

export default function pirate(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 9.5, phi: 1.02, minR: 5, maxR: 18, target: [0, 1.35, 0], maxPhi: 1.45 },
    mat: { w: 10, h: 10, r: 5, color: 0x16465a, sheen: 0x6ab0c8 }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  // ------------------------------------------------------------ barrel
  const root = new THREE.Group(); root.position.y = Y0; S.add(root);
  const barrelG = new THREE.Group(); root.add(barrelG);
  const prof = [];
  for (let i = 0; i <= 24; i++) { const y = (i / 24) * H; prof.push(new THREE.Vector2(radiusAt(y), y)); }
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), new THREE.MeshPhysicalMaterial({ map: staveTexture(), roughness: 0.55, clearcoat: 0.25, side: THREE.DoubleSide }));
  barrel.castShadow = barrel.receiveShadow = true; barrel.userData.pick = null; barrelG.add(barrel);
  const lid = new THREE.Mesh(new THREE.RingGeometry(0.62, radiusAt(H) + 0.02, 48).rotateX(-Math.PI / 2), barrel.material);
  lid.position.y = H; barrelG.add(lid);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(radiusAt(0), 48).rotateX(-Math.PI / 2), barrel.material); bottom.position.y = 0.01; barrelG.add(bottom);
  const iron = new THREE.MeshPhysicalMaterial({ color: 0x3b3b40, metalness: 0.75, roughness: 0.4 });
  for (const y of [0.18, 0.82 * H / 2, H * 0.78, H - 0.15]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(radiusAt(y) + 0.015, 0.045, 10, 72), iron);
    hoop.rotation.x = Math.PI / 2; hoop.position.y = y; hoop.castShadow = true; barrelG.add(hoop);
  }
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0704 }));
  hole.position.y = H + 0.005; barrelG.add(hole);

  // slots
  const slotGeo = new RoundedBoxGeometry(0.16, 0.34, 0.1, 2, 0.04);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x080503 });
  const rimColors = [0xe0402f, 0xf2c230, 0x2f7de0, 0x3ab25a];
  const slots = [];
  for (let i = 0; i < ROWS * COLS; i++) {
    const row = Math.floor(i / COLS), col = i % COLS;
    const y = 0.55 + row * 0.55;
    const a = col * (Math.PI * 2 / COLS) + (row % 2) * (Math.PI / COLS) + 0.26;
    const r = radiusAt(y);
    const n = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const p = n.clone().multiplyScalar(r).setY(y);
    const holeM = new THREE.Mesh(slotGeo, slotMat);
    holeM.position.copy(p).addScaledVector(n, -0.02); holeM.lookAt(p.clone().add(n));
    barrelG.add(holeM);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24), new THREE.MeshPhysicalMaterial({ color: rimColors[row], roughness: 0.4, clearcoat: 0.8 }));
    rim.scale.set(0.75, 1.15, 1);
    rim.position.copy(p).addScaledVector(n, 0.02); rim.lookAt(p.clone().add(n));
    barrelG.add(rim);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.48, 0.2), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(p); hit.lookAt(p.clone().add(n)); hit.userData.pick = { slot: i };
    barrelG.add(hit);
    slots.push({ p, n, rim, hit });
  }

  const pirateMan = buildPirate(); pirateMan.position.y = H - 0.25; barrelG.add(pirateMan);
  const swordsG = new THREE.Group(); barrelG.add(swordsG);

  let st = null, seat = -1, prevSeq = -1, hover = -1, popped = false, won = false, armed = -1;
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;

  function swordAt(i, seatIdx) {
    const s = buildSword(PLAYER_COLORS[seatIdx % PLAYER_COLORS.length]);
    const { p, n } = slots[i];
    s.position.copy(p).addScaledVector(n, 0.12);
    s.lookAt(p.clone().add(n));
    s.rotateX(0.12);
    return s;
  }
  function build() {
    swordsG.clear();
    st.swords.forEach((who, i) => { if (who >= 0) swordsG.add(swordAt(i, who)); });
    slots.forEach((sl, i) => { sl.hit.visible = st.swords[i] < 0; });
    stage.setPickables(st.over ? [] : [barrel, ...slots.filter((_, i) => st.swords[i] < 0).map(s => s.hit)]);
    paint();
  }
  function paint() {
    slots.forEach((sl, i) => {
      const on = (i === hover || i === armed) && myTurn() && st.swords[i] < 0;
      sl.rim.material.emissive = sl.rim.material.emissive || new THREE.Color();
      sl.rim.material.emissive.setHex(on ? 0xffffff : 0x000000);
      sl.rim.material.emissiveIntensity = on ? 0.6 : 0;
      sl.rim.scale.set(on ? 0.95 : 0.75, on ? 1.4 : 1.15, 1);
    });
  }

  function animateStab(last) {
    const s = swordsG.children[swordsG.children.length - 1];
    // find the sword object for this slot (rebuilt in slot order)
    const idx = st.swords.slice(0, last.slot + 1).filter(x => x >= 0).length - 1;
    const sw = swordsG.children[idx] || s;
    const { n } = slots[last.slot];
    const end = sw.position.clone(), start = end.clone().addScaledVector(n, 1.4);
    // suspense: the barrel trembles while the sword goes in
    stage.tween(650, k => { sw.position.lerpVectors(start, end, k * k); barrelG.rotation.z = Math.sin(k * 40) * 0.012 * k; barrelG.rotation.x = Math.cos(k * 33) * 0.01 * k; },
      { ease: k => k, done: () => { barrelG.rotation.set(0, 0, 0); sfx.knock(0.45); if (last.pop) pop(); else sfx.tile(0.2); } });
  }
  function pop() {
    popped = true;
    const from = new THREE.Vector3(0, H - 0.25, 0);
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    const land = dir.clone().multiplyScalar(2.6).setY(0.45);
    sfx.whoosh(0.6); sfx.bell(0.35);
    stage.tween(1300, k => {
      pirateMan.position.lerpVectors(from, land, k);
      pirateMan.position.y = from.y + (land.y - from.y) * k + Math.sin(k * Math.PI) * 4.2;
      pirateMan.rotation.x = k * Math.PI * 3; pirateMan.rotation.z = k * Math.PI;
    }, { ease: k => k, done: () => { pirateMan.rotation.set(Math.PI / 2, 0, 0.4); sfx.knock(0.6); } });
  }

  stage.onHover = pick => { const h = pick && pick.slot != null ? pick.slot : -1; if (h !== hover) { hover = h; paint(); } };
  stage.onPick = (pick, pt, obj, ptr) => {
    if (!pick || pick.slot == null || !st) return;
    if (!myTurn()) return ctx.toast(st.over ? '게임이 끝났어요.' : '내 차례가 아니에요.');
    if (ptr === 'touch' && armed !== pick.slot) { armed = pick.slot; paint(); return ctx.toast('한 번 더 누르면 꽂아요!'); }
    armed = -1;
    stage.finishTweens();
    ctx.send({ type: 'stab', slot: pick.slot });
  };

  const hud = el('div', 'hud'); holder.appendChild(hud);
  stage.tick = () => {
    if (popped || !st) return;
    const t = performance.now() / 1000;
    // the pirate peeks around nervously
    pirateMan.rotation.y = Math.sin(t * 0.9) * 0.8;
    pirateMan.position.y = H - 0.25 + Math.abs(Math.sin(t * 2.2)) * 0.03;
  };

  ctx.root.__test = {
    screen: k => {
      const [kind, i] = k.split(':');
      if (kind !== 'slot') return null;
      const v = slots[+i].p.clone(); barrelG.localToWorld(v);
      return stage.screenOf(v);
    },
    state: () => st,
    // turn the camera so a slot faces the viewer
    face: i => { const { n } = slots[i]; stage.setView({ theta: Math.atan2(n.x, n.z) }, false); }
  };

  return {
    winDelay: 2000,
    render(state, mySeat) {
      stage.finishTweens();
      const before = st;
      st = state; seat = mySeat;
      build();
      if (before && state.seq !== prevSeq && state.last) animateStab(state.last);
      else if (!before && state.over && state.last && state.last.pop) { popped = true; pirateMan.position.set(2.2, 0.45, 1.2); pirateMan.rotation.set(Math.PI / 2, 0, 0.4); }
      prevSeq = state.seq;
      const left = st.swords.filter(x => x < 0).length;
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''}<br>빈 구멍 ${left}개 · 해적이 튀어나오면 <b>${st.mode ? '승리' : '패배'}</b><br>
           <span class="muted">${myTurn() ? `구멍을 클릭해 칼을 꽂으세요!${MOBILE ? ' (두 번 탭)' : ' 드래그로 통을 돌려볼 수 있어요.'}` : '두근두근…'}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${st.loser === i ? 'out' : ''}"><span style="color:#${PLAYER_COLORS[i % 6].toString(16).padStart(6, '0')}">🗡</span> ${nm}</span>`).join('');
      fillLog(log, st.log);
      if (st.over && !won) { won = true; if (seat >= 0 && (st.winner === seat || (st.loser != null && st.loser !== seat))) setTimeout(() => sfx.win(), 1500); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
