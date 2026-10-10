import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Jenga: a tower of maple blocks on the table. Click a block to start a
// pull, then stop the swinging needle in the green zone. The steadier the
// pull, the less the tower shakes. When it goes, it tips over at the layer
// you pulled from and the blocks tumble across the table.

const BL = 1.5, BH = 0.3, BW = 0.5;

function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export default function jenga(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.95,
    camera: { radius: 12.5, phi: 1.12, theta: 0.6, minR: 6, maxR: 22, target: [0, 3.0, 0], maxPhi: 1.5, minPhi: 0.3 },
    mat: { w: 11, h: 11, r: 5.4, color: 0x234a3a, sheen: 0x79b89a }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  const wood = woodTexture({ light: 0xeccf9c, dark: 0xc49a5e, rings: 5, size: 512, seed: 7, figure: 0.8, streak: 0.4 });
  const tints = [0xffffff, 0xfff4e6, 0xf6ead8, 0xfff9f0].map(t => new THREE.MeshPhysicalMaterial({
    map: wood.map, bumpMap: wood.bump, bumpScale: 0.6, color: t, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.5
  }));
  const geo = new RoundedBoxGeometry(BL, BH * 0.97, BW * 0.97, 2, 0.025);
  const hiMat = new THREE.MeshPhysicalMaterial({ map: wood.map, color: 0xffe2a8, emissive: 0xffa630, emissiveIntensity: 0.35, roughness: 0.5 });
  const badMat = new THREE.MeshPhysicalMaterial({ map: wood.map, color: 0xffb0a8, emissive: 0xff3020, emissiveIntensity: 0.35, roughness: 0.5 });

  const tower = new THREE.Group(); S.add(tower);
  let blocks = new Map();       // "l,s" -> mesh
  let st = null, seat = -1, sel = null, hover = null, prevSeq = -1, fallen = false, won = false;
  let sim = null;

  const jitter = (l, s) => { const r = seeded(l * 7 + s * 131 + 3); r(); return { dx: (r() - 0.5) * 0.06, dz: (r() - 0.5) * 0.04, ry: (r() - 0.5) * 0.03, mat: Math.floor(r() * tints.length) }; };
  function slotPos(l, s) {
    const y = Y0 + BH / 2 + l * BH;
    const j = jitter(l, s);
    return l % 2 === 0
      ? { p: new THREE.Vector3(j.dx, y, (s - 1) * BW + j.dz), ry: j.ry }
      : { p: new THREE.Vector3((s - 1) * BW + j.dz, y, j.dx), ry: Math.PI / 2 + j.ry };
  }
  const axisOf = l => (l % 2 === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1));
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;

  function build() {
    tower.clear(); blocks = new Map();
    st.layers.forEach((L, l) => L.forEach((has, s) => {
      if (!has) return;
      const { p, ry } = slotPos(l, s);
      const m = new THREE.Mesh(geo, tints[jitter(l, s).mat]);
      m.position.copy(p); m.rotation.y = ry;
      m.castShadow = m.receiveShadow = true;
      m.userData = { pick: { l, s }, base: p.clone(), l, s, mat: m.material };
      tower.add(m); blocks.set(l + ',' + s, m);
    }));
    stage.setPickables(fallen ? [] : [...blocks.values()]);
    paintSel();
  }
  function paintSel() {
    for (const m of blocks.values()) {
      const { l, s } = m.userData;
      const isSel = sel && sel.l === l && sel.s === s;
      const isHover = !sel && hover && hover.l === l && hover.s === s && myTurn();
      const r = st.risks[l] && st.risks[l][s];
      m.material = (isSel || isHover) ? (r >= 1 ? badMat : hiMat) : m.userData.mat;
      const out = isSel ? 0.35 : isHover && r != null ? 0.08 : 0;
      m.position.copy(m.userData.base).addScaledVector(axisOf(l), out);
    }
  }

  // ------------------------------------------------------------ pull mini-game
  const game = el('div', 'pullGame hidden', `
    <div class="pgTitle">타이밍 맞춰 당기기!</div>
    <div class="pgTrack"><div class="pgZone"></div><div class="pgNeedle"></div></div>
    <div class="pgRisk"></div>
    <div class="row"><button class="primary pgGo">✋ 당기기 (Space)</button><button class="ghost pgCancel">취소</button></div>`);
  holder.appendChild(game);
  const needle = game.querySelector('.pgNeedle');
  const riskEl = game.querySelector('.pgRisk');
  let needlePos = 0.5, t0 = 0, speed = 2;
  function riskWord(r) {
    if (r >= 1) return '<b style="color:#ff6a5a">❌ 이 블록을 빼면 무조건 무너져요!</b>';
    if (r < 0.03) return '<span style="color:#7be08f">안전해 보여요</span>';
    if (r < 0.08) return '<span style="color:#ffd36a">조금 흔들릴 수도…</span>';
    return '<span style="color:#ff8a6a">위험해요!</span>';
  }
  function openGame() {
    const r = st.risks[sel.l][sel.s];
    speed = 2.4 + Math.min(1, r * 8) * 3.2;
    t0 = performance.now();
    riskEl.innerHTML = `${sel.l + 1}층 · ${riskWord(r)}`;
    game.classList.remove('hidden');
  }
  function closeGame() { game.classList.add('hidden'); sel = null; paintSel(); }
  function doPull() {
    if (!sel) return;
    const steady = Math.max(0, 1 - Math.abs(needlePos - 0.5) * 2.2);
    ctx.send({ type: 'pull', layer: sel.l, slot: sel.s, steady: Math.round(steady * 1000) / 1000 });
    game.classList.add('hidden');
  }
  game.querySelector('.pgGo').onclick = doPull;
  game.querySelector('.pgCancel').onclick = closeGame;
  const onKey = e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space' && sel && !game.classList.contains('hidden')) { e.preventDefault(); doPull(); }
    if (e.key === 'Escape') closeGame();
  };
  window.addEventListener('keydown', onKey);

  stage.onHover = pick => {
    const h = pick && pick.l != null ? pick : null;
    if ((h && hover && h.l === hover.l && h.s === hover.s) || (!h && !hover)) return;
    hover = h; paintSel();
  };
  stage.onPick = pick => {
    if (!pick || !st || pick.l == null) return;
    if (!myTurn()) { ctx.toast(st.over ? '게임이 끝났어요.' : '내 차례가 아니에요.'); return; }
    if (st.risks[pick.l][pick.s] == null) { ctx.toast('맨 위 층(과 덜 쌓인 층 바로 아래)은 뺄 수 없어요.'); return; }
    sel = { l: pick.l, s: pick.s }; paintSel(); sfx.knock(0.25);
    openGame();
  };

  // ------------------------------------------------------------ animations
  function animateMove(last) {
    const [tl, ts] = last.to;
    const m = blocks.get(tl + ',' + ts);
    if (!m) return;
    const from = slotPos(last.from[0], last.from[1]);
    const to = m.userData.base.clone();
    const ax = axisOf(last.from[0]);
    const out = from.p.clone().addScaledVector(ax, 2.2);
    const above = to.clone(); above.y = to.y + 0.9;
    const ry0 = from.ry, ry1 = m.rotation.y;
    m.position.copy(from.p); m.rotation.y = ry0;
    stage.tween(520, k => { m.position.lerpVectors(from.p, out, k); }, { ease: EASE.inOutCubic });
    stage.tween(520, k => { m.position.lerpVectors(out, above, k); m.rotation.y = ry0 + (ry1 - ry0) * k; }, { delay: 520, ease: EASE.inOutCubic });
    stage.tween(260, k => { m.position.lerpVectors(above, to, k); }, { delay: 1040, ease: EASE.outCubic, done: () => sfx.knock(0.5) });
    sfx.card(0.35);
  }

  function startCollapse(last) {
    const rnd = seeded(st.fallSeed || 1);
    const a = rnd() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const k = last ? last.from[0] : 3;
    const P = new THREE.Vector3(0, Y0 + k * BH, 0).addScaledVector(dir, 0.75);
    // put the pulled block half way out so it reads as the culprit
    const parts = [];
    for (const m of blocks.values()) {
      m.material = m.userData.mat;
      parts.push({ m, above: m.userData.l >= k, p0: m.position.clone(), q0: m.quaternion.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), free: false });
    }
    if (last) {
      const g = new THREE.Mesh(geo, tints[0]); const sp = slotPos(last.from[0], last.from[1]);
      g.position.copy(sp.p).addScaledVector(axisOf(last.from[0]), 0.9); g.rotation.y = sp.ry; g.castShadow = true; tower.add(g);
      parts.push({ m: g, above: true, p0: g.position.clone(), q0: g.quaternion.clone(), v: new THREE.Vector3(), w: new THREE.Vector3(), free: false });
    }
    sim = { t: 0, parts, P, axis, dir, rnd, alpha: 2.6 + rnd(), tA: 0.5, knocks: 0 };
    stage.setPickables([]);
    sfx.whoosh(0.4);
  }
  const tmpQ = new THREE.Quaternion();
  function stepSim(dt) {
    const s = sim; s.t += dt;
    const floorY = Y0 + BH / 2;
    if (s.t < s.tA) {
      const ang = 0.5 * s.alpha * s.t * s.t;
      tmpQ.setFromAxisAngle(s.axis, ang);
      for (const p of s.parts) if (p.above) {
        p.m.position.copy(p.p0).sub(s.P).applyQuaternion(tmpQ).add(s.P);
        p.m.quaternion.copy(tmpQ).multiply(p.q0);
      }
      return;
    }
    for (const p of s.parts) {
      if (!p.above) continue;
      if (!p.free) {
        p.free = true;
        const om = s.axis.clone().multiplyScalar(s.alpha * s.tA);
        p.v.copy(om).cross(p.m.position.clone().sub(s.P));
        p.v.x += (s.rnd() - 0.5) * 1.2; p.v.z += (s.rnd() - 0.5) * 1.2; p.v.y += s.rnd() * 0.6;
        p.w.copy(om).add(new THREE.Vector3(s.rnd() - 0.5, s.rnd() - 0.5, s.rnd() - 0.5).multiplyScalar(4));
      }
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      const wl = p.w.length();
      if (wl > 1e-4) { tmpQ.setFromAxisAngle(p.w.clone().divideScalar(wl), wl * dt); p.m.quaternion.premultiply(tmpQ); }
      if (p.m.position.y < floorY) {
        p.m.position.y = floorY;
        if (p.v.y < -1.5 && s.knocks < 18) { s.knocks++; sfx.knock(Math.min(0.6, -p.v.y * 0.06)); }
        p.v.y = -p.v.y * 0.22; p.v.x *= 0.55; p.v.z *= 0.55; p.w.multiplyScalar(0.45);
        // settle flat once slow
        if (Math.abs(p.v.y) < 0.4) {
          p.v.y = 0; p.w.multiplyScalar(0.6);
          const e = new THREE.Euler().setFromQuaternion(p.m.quaternion);
          e.x = Math.round(e.x / (Math.PI / 2)) * (Math.PI / 2) * 0.15 + e.x * 0.85;
          e.z = Math.round(e.z / (Math.PI / 2)) * (Math.PI / 2) * 0.15 + e.z * 0.85;
          p.m.quaternion.setFromEuler(e);
        }
      }
    }
    if (s.t > 6) sim = null;
  }

  stage.tick = dt => {
    if (sim) { let left = Math.min(dt, 0.1); while (sim && left > 1e-4) { const h = Math.min(left, 1 / 60); stepSim(h); left -= h; } }
    if (!game.classList.contains('hidden')) {
      const t = (performance.now() - t0) / 1000;
      needlePos = 0.5 + 0.5 * Math.sin(t * speed);
      needle.style.left = (needlePos * 100) + '%';
      // the pulled block trembles with the needle's distance from centre
      if (sel) { const m = blocks.get(sel.l + ',' + sel.s); if (m) m.rotation.z = (needlePos - 0.5) * 0.06; }
    }
    if (st && !fallen && !st.over) {
      const weak = st.risks.flat().filter(r => r != null).reduce((a, r) => Math.max(a, r < 1 ? r : 0), 0);
      const amp = 0.002 + weak * 0.02;
      tower.rotation.z = Math.sin(performance.now() / 700) * amp;
      tower.rotation.x = Math.cos(performance.now() / 900) * amp * 0.7;
    }
  };

  const resign = btn('포기', 'ghost', () => { if (confirm('정말 포기할까요?')) ctx.send({ type: 'resign' }); });
  bar.append(resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1500); };

  ctx.root.__test = {
    screen: k => {
      const [kind, rest] = k.split(':');
      if (kind !== 'block') return null;
      const m = blocks.get(rest); if (!m) return null;
      return stage.screenOf(m.position.clone());
    },
    state: () => st,
    pick: (l, s) => stage.onPick({ l, s }),
    pullSteady: v => { needlePos = 0.5 + (1 - v) / 2.2; doPull(); }
  };

  return {
    winDelay: 3600,
    render(state, mySeat) {
      const before = st;
      st = state; seat = mySeat;
      const fresh = state.seq !== prevSeq;
      if (fresh || !before) { stage.finishTweens(); sel = null; game.classList.add('hidden'); }
      if (state.collapsed && !fallen) {
        build(); fallen = true;
        if (before) startCollapse(state.last);
        else { startCollapse(state.last); }
        flash('💥 와르르!');
      } else if (!fallen) {
        build();
        if (before && fresh && state.last && state.last.to) {
          animateMove(state.last);
          const sd = state.last.steady;
          if (state.last.seat !== seat) flash(`${st.names[state.last.seat]} 성공! ${sd > 0.8 ? '완벽!' : sd > 0.5 ? '' : '휴… 아슬아슬'}`);
        }
      }
      prevSeq = state.seq;
      const h = st.layers.length;
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''}<br>탑 높이 ${h}층 · ${st.pulls}번 성공<br>
           <span class="muted">${myTurn() ? '뺄 블록을 클릭하고, 바늘이 초록 칸에 올 때 당기세요!' : '숨죽이고 지켜보는 중…'}${MOBILE ? '' : ' 마우스로 탑을 돌려볼 수 있어요.'}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${st.loser === i ? 'out' : ''}">${nm}</span>`).join('');
      resign.disabled = st.over || seat < 0;
      fillLog(log, st.log);
      if (st.over && !won) { won = true; if (st.loser !== seat && seat >= 0) setTimeout(() => sfx.win(), 1200); }
    },
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
