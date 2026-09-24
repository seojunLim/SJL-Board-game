import { Stage, THREE } from '../three3d/scene.js';

// 3D Loopin' Louie: a round board, a central rotating arm carrying the plane,
// four stations with chicken tokens and flick levers. The plane angle is driven
// by the server and smoothed locally for 60fps motion.
export default function louie(ctx) {
  const holder = document.createElement('div'); holder.style.width = '100%';
  const btn = document.createElement('button'); btn.className = 'flickBtn'; btn.textContent = '레버 치기! (Space)';
  btn.style.marginTop = '10px';
  ctx.root.appendChild(holder); ctx.root.appendChild(btn);
  const log = document.createElement('div'); log.className = 'log';
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { radius: 13.5, minR: 9, maxR: 18, phi: 0.34, targetY: 0 });
  stage.theta = 0;

  const R = 5;
  // Board.
  const board = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.8, 0.6, 48),
    new THREE.MeshStandardMaterial({ color: 0x1f3550, roughness: 0.7 }));
  board.position.y = -0.3; board.receiveShadow = true; stage.scene.add(board);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.55, 0.18, 16, 48).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffb648, roughness: 0.5 }));
  rim.position.y = 0.05; stage.scene.add(rim);

  // Central hub + arm + plane.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 24),
    new THREE.MeshStandardMaterial({ color: 0xcc3333, roughness: 0.5 }));
  hub.position.y = 0.6; hub.castShadow = true; stage.scene.add(hub);
  const arm = new THREE.Group(); arm.position.y = 1.0; stage.scene.add(arm);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(R - 0.6, 0.12, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x888f98, metalness: 0.4, roughness: 0.4 }));
  beam.position.x = (R - 0.6) / 2; beam.castShadow = true; arm.add(beam);
  arm.add(buildPlane());

  // Stations.
  const stations = [];
  let st = null, seat = -1;

  const chickenGeo = () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff2cc, roughness: 0.6 }));
    body.scale.set(1, 0.9, 1.2); body.castShadow = true; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), body.material); head.position.set(0, 0.18, 0.16); g.add(head);
    const comb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshStandardMaterial({ color: 0xd23b3b })); comb.position.set(0, 0.30, 0.16); g.add(comb);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xffa726 })); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.17, 0.30); g.add(beak);
    return g;
  };

  function buildStations() {
    for (const s of stations) stage.scene.remove(s.group);
    stations.length = 0;
    const colors = [0x4da3ff, 0x4ade80, 0xffb648, 0xf87171, 0xb388ff, 0xff8ac0];
    for (let i = 0; i < st.n; i++) {
      const ang = st.stations[i] * Math.PI / 180;
      const g = new THREE.Group();
      g.rotation.y = -ang;                     // face outward
      const perch = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 1.0),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.5 }));
      perch.position.set(0, 0.15, R - 0.2); perch.castShadow = true; perch.receiveShadow = true;
      perch.userData.pick = { seat: i }; g.add(perch);
      // lever paddle
      const lever = new THREE.Group(); lever.position.set(0, 0.3, R - 0.9);
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xffe08a, roughness: 0.4 }));
      paddle.position.y = 0.25; paddle.castShadow = true; lever.add(paddle);
      g.add(lever);
      const chickens = [];
      for (let k = 0; k < 3; k++) {
        const ch = chickenGeo();
        ch.position.set((k - 1) * 0.4, 0.4, R + 0.15);
        g.add(ch); chickens.push(ch);
      }
      stage.scene.add(g);
      stations.push({ group: g, lever, chickens, angle: st.stations[i] });
    }
    stage.setPickables(stations.map(s => s.group.children[0]));
  }

  stage.onPick = (p) => { if (p && p.seat === seat) flick(); };

  // Local angle smoothing.
  let shown = 0, target = 0, dir = 1, speed = 0, started = false, last = performance.now();
  stage.tick = () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!st) return;
    if (!st.over && st.startsIn <= 0) shown += dir * speed * dt;
    let d = ((target - shown + 540) % 360) - 180;
    shown += d * Math.min(1, dt * 6);
    arm.rotation.y = -shown * Math.PI / 180;
    // lever tilt
    const t = Date.now();
    for (let i = 0; i < stations.length; i++) {
      const up = st.lever[i] && st.lever[i].up;
      const lv = stations[i].lever;
      lv.rotation.x += ((up ? -0.9 : 0) - lv.rotation.x) * 0.3;
    }
  };

  const flick = () => { if (st && !st.over && seat >= 0) ctx.send({ type: 'flick' }); };
  btn.onclick = flick;
  const onKey = e => { if (e.target.tagName === 'INPUT') return; if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); flick(); } };
  window.addEventListener('keydown', onKey);

  function render(state, mySeat) {
    st = state; seat = mySeat;
    target = st.angle; dir = st.dir; speed = st.speed;
    if (!started) { shown = st.angle; started = true; }
    if (stations.length !== st.n) buildStations();
    // update chickens
    for (let i = 0; i < st.n; i++) {
      const alive = st.chickens[i];
      stations[i].chickens.forEach((ch, k) => ch.visible = k < alive);
      stations[i].group.children[0].material.emissive?.setHex(i === seat ? 0x222a33 : 0x000000);
    }
    const cool = st.lever[seat] && st.lever[seat].cool;
    btn.disabled = st.over || seat < 0;
    btn.textContent = st.over ? '게임 종료' : cool ? '레버 재장전 중…' : '레버 치기! (Space)';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : st.startsIn > 0
        ? `<b>${Math.ceil(st.startsIn / 1000)}초 후 시작!</b><br><span class="muted">루이가 내 자리에 오면 레버를 치세요.</span>`
        : `속도 <b>${Math.round(st.speed)}</b>°/s<br>내 닭: ${st.chickens[seat] != null ? '🐔'.repeat(st.chickens[seat]) || '💀' : '-'}<br>
           <span class="muted">너무 일찍 치면 재장전. · 드래그 회전</span>`;
    log.innerHTML = '';
    st.log.forEach(l => log.appendChild(Object.assign(document.createElement('div'), { textContent: l })));
    log.scrollTop = log.scrollHeight;
  }

  return { render, destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; } };
}

function buildPlane() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.45 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xffd54f, roughness: 0.45 });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.1, 16), red);
  fuse.rotation.z = Math.PI / 2; fuse.castShadow = true; g.add(fuse);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 1.1), yellow); wing.castShadow = true; g.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.5), yellow); tail.position.set(-0.5, 0, 0); g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.05), red); fin.position.set(-0.5, 0.15, 0); g.add(fin);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: 0x333 })); prop.position.set(0.58, 0, 0); g.add(prop);
  g.position.set(4.2, 0.1, 0);
  g.rotation.y = -Math.PI / 2;
  return g;
}
