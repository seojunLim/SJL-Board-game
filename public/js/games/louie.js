import { Stage, THREE, EASE, textSprite } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture, roundRect } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Loopin' Louie, the toy: a round farm tray, a motor tower in the middle with
// a long arm, Louie in his biplane on the end dipping towards each coop,
// coloured barns with three chicken coins each and a flipper in front of
// every barn. The plane angle comes from the server; visuals are smoothed.

const SEAT_COLORS = [0x2f7fe0, 0x3fb24a, 0xf0a22a, 0xe2463c, 0x9b5de5, 0xff7ab8];
const RP = 4.3;              // plane path radius
const RB = 6.0;              // barn radius
const TOWER_H = 2.6;
const dirOf = deg => { const r = deg * Math.PI / 180; return new THREE.Vector3(Math.cos(r), 0, Math.sin(r)); };
const yawOut = d => Math.atan2(d.x, d.z);          // rotation.y so local +z points along d

function coinTexture(hex) {
  const col = '#' + hex.toString(16).padStart(6, '0');
  return paintedTexture('coin-' + hex, 256, 256, (g, W) => {
    g.fillStyle = col; g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(W / 2, W / 2, W * 0.42, 0, Math.PI * 2); g.fill();
    // hen
    g.save(); g.translate(W / 2, W / 2 + 10);
    g.fillStyle = '#fff'; g.strokeStyle = '#333'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 10, 58, 46, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.arc(34, -38, 28, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#e02c2c'; g.beginPath(); g.arc(30, -70, 10, 0, Math.PI * 2); g.arc(44, -66, 9, 0, Math.PI * 2); g.arc(20, -66, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f5a623'; g.beginPath(); g.moveTo(58, -40); g.lineTo(80, -32); g.lineTo(58, -26); g.closePath(); g.fill();
    g.fillStyle = '#e02c2c'; g.beginPath(); g.ellipse(58, -20, 5, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#222'; g.beginPath(); g.arc(40, -42, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f0f0f0'; g.strokeStyle = '#333';
    g.beginPath(); g.ellipse(-18, 4, 26, 16, -0.4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.strokeStyle = '#f5a623'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-8, 54); g.lineTo(-10, 74); g.moveTo(14, 54); g.lineTo(14, 74); g.stroke();
    g.restore();
  });
}

function trayTexture() {
  return paintedTexture('louie-tray', 1024, 1024, (g, W) => {
    const c = W / 2;
    g.fillStyle = '#3c8f3a'; g.fillRect(0, 0, W, W);
    // grass speckles
    for (let i = 0; i < 5000; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * c;
      g.fillStyle = `rgba(${40 + Math.random() * 60},${120 + Math.random() * 70},${40 + Math.random() * 30},0.5)`;
      g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 3, 3);
    }
    // dirt track under the plane path
    g.strokeStyle = 'rgba(150,110,60,0.55)'; g.lineWidth = 70;
    g.beginPath(); g.arc(c, c, c * (RP / 7), 0, Math.PI * 2); g.stroke();
    g.setLineDash([18, 22]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 5;
    g.beginPath(); g.arc(c, c, c * (RP / 7), 0, Math.PI * 2); g.stroke();
  });
}

function biplane() {
  const g = new THREE.Group();
  const red = new THREE.MeshPhysicalMaterial({ color: 0xd9322b, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const yellow = new THREE.MeshPhysicalMaterial({ color: 0xf5c518, roughness: 0.4, clearcoat: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c29b, roughness: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x6b3f1f, roughness: 0.6 });
  // fuselage along +z (nose forward)
  const prof = [[0, -0.9], [0.14, -0.88], [0.24, -0.5], [0.3, 0], [0.3, 0.35], [0.26, 0.55], [0.18, 0.62], [0, 0.64]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), red); fus.rotation.x = Math.PI / 2;
  const wingT = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.07, 0.55, 2, 0.03), yellow); wingT.position.set(0, 0.42, 0.18);
  const wingB = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.07, 0.5, 2, 0.03), yellow); wingB.position.set(0, -0.18, 0.18);
  const struts = [];
  for (const x of [-0.8, 0.8]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6), dark); s.position.set(x, 0.12, 0.18); struts.push(s); }
  const tailH = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.05, 0.3, 2, 0.02), yellow); tailH.position.set(0, 0.02, -0.82);
  const tailV = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.38, 0.32, 2, 0.02), red); tailV.position.set(0, 0.2, -0.82);
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 16), dark); hub.rotation.x = Math.PI / 2; hub.position.z = 0.72;
  const prop = new THREE.Group(); prop.position.z = 0.68;
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.62, 0.03, 2, 0.015), leather); b.rotation.z = i * Math.PI / 2; prop.add(b); }
  const wheelG = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 16).rotateZ(Math.PI / 2);
  const w1 = new THREE.Mesh(wheelG, dark); w1.position.set(-0.3, -0.42, 0.25);
  const w2 = new THREE.Mesh(wheelG, dark); w2.position.set(0.3, -0.42, 0.25);
  // Louie
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 16), skin); head.position.set(0, 0.38, -0.12);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), leather); cap.position.copy(head.position);
  const goggles = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, metalness: 0.6, roughness: 0.1 }));
  goggles.position.set(0, 0.42, 0.04);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8806a })); nose.position.set(0, 0.35, 0.05);
  const scarf = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.05, 0.5, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff })); scarf.position.set(0.12, 0.28, -0.4); scarf.rotation.y = 0.3;
  g.add(fus, wingT, wingB, ...struts, tailH, tailV, hub, prop, w1, w2, head, cap, goggles, nose, scarf);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  g.userData.prop = prop;
  g.userData.scarf = scarf;
  return g;
}

export default function louie(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  const flickB = btn('레버 치기! (Space)', 'flickBtn', () => flick());
  bar.appendChild(flickB);
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { camera: { radius: 20.5, phi: 0.66, minR: 11, maxR: 30, target: [0, 0.6, 0], maxPhi: 1.2 } });
  const S = stage.scene;

  // ------------------------------------------------------------ tray
  const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x2f6fc4, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const trayProf = [[0, 0], [7.2, 0], [7.5, 0.1], [7.55, 0.55], [7.35, 0.62], [7.15, 0.3], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  const tray = new THREE.Mesh(new THREE.LatheGeometry(trayProf, 96), trayMat);
  tray.castShadow = tray.receiveShadow = true; S.add(tray);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(7.15, 96).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: trayTexture(), roughness: 0.95 }));
  grass.position.y = 0.301; grass.receiveShadow = true; S.add(grass);
  const Y0 = 0.3;

  // ------------------------------------------------------------ tower + arm
  const towerMat = new THREE.MeshPhysicalMaterial({ color: 0xf5c518, roughness: 0.35, clearcoat: 0.6 });
  const tprof = [[0, 0], [1.2, 0], [1.25, 0.2], [0.9, 0.5], [0.55, 0.9], [0.45, TOWER_H - 0.4], [0.6, TOWER_H - 0.25], [0.6, TOWER_H], [0, TOWER_H + 0.05]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const tower = new THREE.Mesh(new THREE.LatheGeometry(tprof, 48), towerMat);
  tower.position.y = Y0; tower.castShadow = tower.receiveShadow = true; S.add(tower);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0xd9322b, roughness: 0.3, clearcoat: 0.8 }));
  dome.position.y = Y0 + TOWER_H; dome.castShadow = true; S.add(dome);
  const armMat = new THREE.MeshPhysicalMaterial({ color: 0xd9d9df, metalness: 0.9, roughness: 0.25 });
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 16), armMat);
  arm.castShadow = true; S.add(arm);
  const plane = biplane(); S.add(plane);

  // ------------------------------------------------------------ barns
  let st = null, seat = -1, n = 0;
  const barns = [];
  const coinGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.07, 36);
  const coinEdge = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  const pickables = [];

  function buildBarns() {
    barns.forEach(b => S.remove(b.group)); barns.length = 0; pickables.length = 0;
    for (let i = 0; i < n; i++) {
      const col = SEAT_COLORS[i % SEAT_COLORS.length];
      const d = dirOf(st.stations[i]);
      const g = new THREE.Group();
      g.position.copy(d.clone().multiplyScalar(RB)).setY(Y0);
      g.rotation.y = yawOut(d);
      const wall = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.45, clearcoat: 0.4 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf5f1e8, roughness: 0.6 });
      const body = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.25, 1.2, 3, 0.06), wall);
      body.position.set(0, 0.62, 0.3);
      const roofShape = new THREE.Shape(); roofShape.moveTo(-1.02, 0); roofShape.lineTo(0, 0.48); roofShape.lineTo(1.02, 0); roofShape.closePath();
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 1.3, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }),
        new THREE.MeshPhysicalMaterial({ color: 0x8a2b1f, roughness: 0.5, clearcoat: 0.3 }));
      roof.position.set(0, 1.24, -0.35);
      const door = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.72, 0.06, 2, 0.02), white); door.position.set(0, 0.4, -0.32);
      const xA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.86, 0.03), wall); xA.position.set(0, 0.4, -0.36); xA.rotation.z = 0.7;
      const xB = xA.clone(); xB.rotation.z = -0.7;
      // coin rack facing the track
      const rack = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.18, 0.5, 2, 0.04), white); rack.position.set(0, 0.09, -0.75);
      g.add(body, roof, door, xA, xB, rack);
      const coins = [];
      const face = new THREE.MeshStandardMaterial({ map: coinTexture(col), roughness: 0.4 });
      for (let k = 0; k < 3; k++) {
        const c = new THREE.Mesh(coinGeo, [coinEdge, face, face]);
        c.rotation.x = Math.PI / 2 - 0.25;
        c.position.set((k - 1) * 0.55, 0.52, -0.78);
        c.castShadow = true;
        g.add(c); coins.push(c);
      }
      // flipper: pivots at its base, sits on the plane's path in front of the coop
      const flipper = new THREE.Group();
      flipper.position.set(0, 0.05, -(RB - RP) - 0.1);
      const paddle = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.12, 0.7, 2, 0.05), new THREE.MeshPhysicalMaterial({ color: 0xf2f2f2, roughness: 0.35, clearcoat: 0.6 }));
      paddle.position.set(0, 0.06, 0.2);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 20), wall); knob.position.set(0, 0.2, 0.52);
      flipper.add(paddle, knob);
      g.add(flipper);
      g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      g.userData.pick = { seat: i };
      S.add(g);
      if (i === seat) pickables.push(g);
      if (i !== seat) {
        const tag = textSprite(st.names[i], { scale: 0.01 });
        tag.position.set(0, 2.45, 0.2); g.add(tag);
      }
      barns.push({ group: g, coins, flipper, alive: 3 });
    }
    stage.setPickables(pickables);
  }

  // ------------------------------------------------------------ motion
  let shown = 0, target = 0, dir = 1, speed = 0, started = false;
  const bump = { t: -1 };
  function planeHeight(deg) {
    let dip = 0;
    for (let i = 0; i < n; i++) {
      let d = Math.abs(((deg - st.stations[i]) % 360 + 540) % 360 - 180);
      dip = Math.max(dip, Math.exp(-Math.pow(d / 28, 2)));
    }
    return Y0 + 2.25 - dip * 1.45;
  }
  stage.tick = (dt, now) => {
    if (!st) return;
    if (!st.over && st.startsIn <= 0) shown += dir * speed * dt;
    const diff = ((target - shown + 540) % 360) - 180;
    shown += diff * Math.min(1, dt * 6);
    const d = dirOf(shown);
    let y = planeHeight(shown);
    if (bump.t >= 0) { const k = (now - bump.t) / 520; if (k < 1) y += Math.sin(Math.PI * k) * 1.4; else bump.t = -1; }
    const p = d.clone().multiplyScalar(RP).setY(y);
    plane.position.copy(p);
    // nose along the direction of travel (tangent), bank into the turn
    const tangent = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(dir);
    plane.lookAt(p.clone().add(tangent));
    plane.rotateZ(-0.35 * dir);
    plane.userData.prop.rotation.z += dt * 40;
    plane.userData.scarf.rotation.y = 0.3 + Math.sin(now / 90) * 0.2;
    // arm from the tower hub to the plane
    const a = new THREE.Vector3(0, Y0 + TOWER_H - 0.1, 0);
    const mid = a.clone().add(p).multiplyScalar(0.5);
    arm.position.copy(mid);
    arm.scale.y = a.distanceTo(p) - 0.2;
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(a).normalize());
    // flippers
    for (let i = 0; i < barns.length; i++) {
      const up = st.lever[i] && st.lever[i].up;
      const f = barns[i].flipper;
      f.rotation.x += ((up ? 0.95 : 0) - f.rotation.x) * Math.min(1, dt * 22);
    }
  };

  const knocking = new Set();
  function knockCoin(i) {
    const b = barns[i]; if (!b) return;
    const c = b.coins[Math.max(0, st.chickens[i])];
    if (!c) return;
    const start = c.position.clone(), r0 = c.rotation.clone();
    knocking.add(c); c.visible = true;
    stage.tween(900, k => {
      c.position.set(start.x + k * 0.6, start.y + Math.sin(Math.PI * Math.min(1, k * 1.4)) * 1.4 - k * k * 1.2, start.z - k * 1.6);
      c.rotation.set(r0.x + k * 9, r0.y, r0.z + k * 4);
      c.scale.setScalar(1 - Math.max(0, k - 0.75) * 4);
    }, { ease: EASE.linear, done: () => { knocking.delete(c); c.visible = false; c.position.copy(start); c.rotation.copy(r0); c.scale.setScalar(1); } });
  }

  function flick() { if (st && !st.over && seat >= 0) ctx.send({ type: 'flick' }); }
  stage.onPick = p => { if (p && p.seat === seat) flick(); };
  const onKey = e => { if (e.target.tagName === 'INPUT') return; if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flick(); } };
  window.addEventListener('keydown', onKey);

  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let lastEvent = null, won = false, oriented = false;

  function render(state, mySeat) {
    const firstBuild = n !== state.n || !barns.length;
    st = state; seat = mySeat; n = state.n;
    target = st.angle; dir = st.dir; speed = st.speed;
    if (!started) { shown = st.angle; started = true; }
    if (firstBuild) buildBarns();
    if (!oriented && seat >= 0) {
      oriented = true;
      const d = dirOf(st.stations[seat]);
      stage.setView({ theta: Math.atan2(d.x, d.z) }, false);
    }
    const evs = st.events || [];
    for (const ev of evs) {
      if (lastEvent !== null && ev.t <= lastEvent) continue;
      if (lastEvent === null) continue;
      if (ev.type === 'hit') { knockCoin(ev.seat); sfx.buzz(0.25); }
      if (ev.type === 'deflect') { bump.t = performance.now(); sfx.knock(0.6); }
    }
    lastEvent = evs.length ? Math.max(...evs.map(e => e.t)) : (lastEvent ?? 0);
    barns.forEach((b, i) => b.coins.forEach((c, k) => { c.visible = k < st.chickens[i] || knocking.has(c); }));

    if (st.startsIn > 0) { banner.textContent = Math.ceil(st.startsIn / 1000); banner.classList.add('show'); }
    else if (st.over) { banner.textContent = st.result || '종료'; banner.classList.add('show'); }
    else banner.classList.remove('show');

    const cool = st.lever[seat] && st.lever[seat].cool;
    flickB.disabled = st.over || seat < 0;
    flickB.textContent = st.over ? '게임 종료' : cool ? '레버 재장전 중…' : '레버 치기! (Space)';
    hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${i === seat ? 'me' : ''} ${st.chickens[i] <= 0 ? 'out' : ''}">${nm} ${'🐔'.repeat(Math.max(0, st.chickens[i]))}</span>`).join('')
      + `<span class="chip">속도 ${Math.round(st.speed)}</span>`;
    ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
      : `<b>루이가 내 헛간 앞 레버 위로 내려올 때</b> 레버를 치세요!<br><span class="muted">너무 일찍 치면 재장전 동안 무방비입니다.</span>`;
    fillLog(log, st.log);
    if (st.over && !won) { won = true; sfx.win(); }
  }

  return {
    render,
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
