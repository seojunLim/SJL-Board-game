import { Stage, THREE, EASE, textSprite } from '../three3d/scene.js';
import { cardMesh, deckMesh, galliFaceTexture, galliBackTexture } from '../three3d/cards.js';
import { woodTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Halli Galli: a polished brass bell in the middle of the table, every player
// with a face-down deck in front of them and a face-up pile towards the bell.
// Cards flip off the deck onto the pile; a correct ring sweeps every pile to
// the winner; a wrong ring pays a card to each opponent.

const CW = 1.25, CH = 1.85;
const DECK_R = 4.7, PILE_R = 2.85;

function brassBell() {
  const g = new THREE.Group();
  const walnut = woodTexture({ light: 0x4a2a15, dark: 0x1c0e05, rings: 8, seed: 61, size: 512 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.2, 0.26, 64),
    new THREE.MeshPhysicalMaterial({ map: walnut.map, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12 }));
  base.position.y = 0.13;
  const brass = new THREE.MeshPhysicalMaterial({ color: 0xc99a3e, metalness: 1, roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.2, envMapIntensity: 0.75 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xd8d8de, metalness: 1, roughness: 0.15, envMapIntensity: 0.8 });
  const prof = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = t * Math.PI / 2;
    prof.push(new THREE.Vector2(Math.cos(a) * 1.0 * (1 - 0.06 * Math.sin(a * 2)), Math.sin(a) * 0.78));
  }
  prof.unshift(new THREE.Vector2(1.04, -0.02));
  const dome = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), brass);
  dome.position.y = 0.28;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.035, 12, 72).rotateX(Math.PI / 2), brass);
  lip.position.y = 0.27;
  const plunger = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 20), chrome);
  rod.position.y = 0.17;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), chrome);
  knob.position.y = 0.32; knob.scale.y = 0.7;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), chrome);
  cap.position.y = 0.32;
  plunger.add(rod, knob, cap);
  plunger.position.y = 1.02;
  g.add(base, dome, lip, plunger);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  g.userData = { dome, plunger, pick: { bell: true } };
  return g;
}

export default function halligalli(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    camera: { radius: 16.5, phi: 0.7, minR: 9, maxR: 26, target: [0, 0.3, 1.0], maxPhi: 1.2 },
    mat: { w: 15, h: 12.5, r: 2, color: 0x1d5a3a, sheen: 0x6fbf8f }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;
  const back = galliBackTexture();

  const bell = brassBell();
  bell.position.y = Y0;
  S.add(bell);

  let st = null, seat = -1, n = 0;
  const decks = [], piles = [], tags = [];
  const pileTops = [];
  const pickables = [];

  function frame(i) {
    const rel = seat >= 0 ? (i - seat + n) % n : i;
    const a = Math.PI / 2 + rel * (Math.PI * 2 / n);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    return { dir, rotY: Math.PI / 2 - a, a };
  }
  const deckPos = i => frame(i).dir.clone().multiplyScalar(DECK_R).setY(Y0);
  const pilePos = i => frame(i).dir.clone().multiplyScalar(PILE_R).setY(Y0);

  function rebuild() {
    for (const o of [...decks, ...piles, ...tags]) S.remove(o);
    decks.length = piles.length = tags.length = pileTops.length = 0;
    pickables.length = 0;
    pickables.push(bell);
    for (let i = 0; i < n; i++) {
      const f = frame(i);
      const dn = st.downCounts[i];
      const d = deckMesh(back, Math.max(1, dn), { w: CW, h: CH });
      d.position.copy(deckPos(i)); d.rotation.y = f.rotY + (i % 2 ? 0.04 : -0.04);
      d.visible = dn > 0;
      d.userData.pick = { deck: i };
      S.add(d); decks.push(d);
      if (i === seat) pickables.push(d);

      const pg = new THREE.Group();
      pg.position.copy(pilePos(i)); pg.rotation.y = f.rotY;
      const up = st.up[i];
      if (up.size > 1) {
        const under = deckMesh(back, up.size - 1, { w: CW, h: CH });
        under.rotation.y = 0.05;
        pg.add(under);
      }
      let top = null;
      if (up.top) {
        top = cardMesh(galliFaceTexture(up.top), back, { w: CW, h: CH, gloss: false });
        top.position.y = Math.max(0.012, (up.size - 1) * 0.012 * 0.9) + 0.008;
        top.rotation.y = ((i * 37) % 10 - 5) * 0.02;
        pg.add(top);
      }
      pileTops.push(top);
      S.add(pg); piles.push(pg);

      const name = `${st.names[i]}${i === seat ? ' (나)' : ''} · ${st.downCounts[i] + st.up[i].size}장`;
      if (i === seat) continue;
      const tag = textSprite(st.out[i] ? `${st.names[i]} · 탈락` : name, { border: st.turn === i && !st.over ? '#ffc861' : null, scale: 0.0105 });
      const tp = f.dir.clone().multiplyScalar(4.1).setY(Y0 + 1.25);
      tag.position.copy(tp);
      S.add(tag); tags.push(tag);
    }
    stage.setPickables(pickables);
  }

  function ringBell(good) {
    const { plunger, dome } = bell.userData;
    stage.tween(90, k => { plunger.position.y = 1.02 - 0.16 * k; }, {
      ease: EASE.outCubic, done: () => stage.tween(260, k => { plunger.position.y = 0.86 + 0.16 * k; }, { ease: EASE.outBack })
    });
    stage.tween(700, k => { const w = Math.sin(k * Math.PI * 7) * (1 - k) * 0.03; dome.scale.set(1 + w, 1 - w, 1 + w); }, { ease: EASE.linear });
    good === false ? (sfx.bell(0.35), setTimeout(() => sfx.buzz(), 160)) : sfx.bell(0.55);
  }

  function flyFlip(i, card) {
    const top = pileTops[i];
    if (!top) return;
    top.visible = false;
    const fr = frame(i);
    const m = cardMesh(galliFaceTexture(card), back, { w: CW, h: CH, gloss: false });
    const a = deckPos(i).setY(Y0 + 0.3), b = pilePos(i).setY(Y0 + 0.05);
    m.position.copy(a);
    S.add(m);
    stage.tween(360, k => {
      m.position.lerpVectors(a, b, k);
      m.position.y += Math.sin(Math.PI * k) * 1.4;
      // flip over the far edge, like a real Halli Galli flip (away from you)
      m.rotation.set(0, 0, 0);
      m.rotateY(fr.rotY);
      m.rotateX(-Math.PI * (1 - k));
    }, { ease: EASE.inOutCubic, done: () => { S.remove(m); top.visible = true; sfx.card(0.4); } });
  }

  function sweepTo(winner, prevUp) {
    const target = deckPos(winner).setY(Y0 + 0.3);
    prevUp.forEach((p, i) => {
      if (!p || !p.top) return;
      const m = cardMesh(galliFaceTexture(p.top), back, { w: CW, h: CH, gloss: false });
      const a = pilePos(i).setY(Y0 + 0.08);
      m.position.copy(a); m.rotation.y = frame(i).rotY;
      S.add(m);
      stage.tween(520, k => {
        m.position.lerpVectors(a, target, k);
        m.position.y += Math.sin(Math.PI * k) * 0.8;
        m.rotation.z = Math.PI * k;
      }, { delay: i * 60, ease: EASE.inOutCubic, done: () => S.remove(m) });
    });
    setTimeout(() => sfx.card(0.5), 250);
  }

  function payOut(ringer) {
    for (let i = 0; i < n; i++) {
      if (i === ringer || st.out[i]) continue;
      const m = cardMesh(back, back, { w: CW, h: CH, gloss: false });
      const a = deckPos(ringer).setY(Y0 + 0.3), b = pilePos(i).setY(Y0 + 0.1);
      m.position.copy(a); m.rotation.z = Math.PI;
      S.add(m);
      stage.tween(460, k => { m.position.lerpVectors(a, b, k); m.position.y += Math.sin(Math.PI * k) * 1; m.rotation.z = Math.PI * (1 - k); },
        { delay: i * 80, ease: EASE.inOutCubic, done: () => S.remove(m) });
    }
  }

  stage.onPick = pick => {
    if (!pick || !st || st.over || seat < 0) return;
    if (pick.bell) ctx.send({ type: 'bell' });
    else if (pick.deck === seat) ctx.send({ type: 'flip' });
  };

  const flipB = btn('카드 뒤집기 (F)', 'primary', () => ctx.send({ type: 'flip' }));
  const bellB = btn('🔔 종 치기 (Space)', 'primary', () => ctx.send({ type: 'bell' }));
  bellB.style.background = '#e0b457'; bellB.style.borderColor = '#e0b457';
  bar.append(flipB, bellB);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1200); };

  const onKey = e => {
    if (e.target.tagName === 'INPUT' || !st || st.over || seat < 0) return;
    if (e.code === 'Space') { e.preventDefault(); ctx.send({ type: 'bell' }); }
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); ctx.send({ type: 'flip' }); }
  };
  window.addEventListener('keydown', onKey);

  let lastFlash = null, prevUp = null, won = false;
  function render(state, mySeat) {
    stage.finishTweens();
    const before = prevUp;
    st = state; seat = mySeat; n = state.n;
    rebuild();
    const f = state.flash;
    if (lastFlash !== null && f && f.t !== lastFlash) {
      if (f.type === 'flip') flyFlip(f.seat, f.card);
      if (f.type === 'bell-good') { ringBell(true); if (before) sweepTo(f.seat, before); flash(`🔔 ${state.names[f.seat]} 정답!`); }
      if (f.type === 'bell-bad') { ringBell(false); payOut(f.seat); flash(`❌ ${state.names[f.seat]} 오답!`); }
    }
    lastFlash = f ? f.t : 0;
    prevUp = state.up.map(p => ({ top: p.top, size: p.size }));

    ctx.status.innerHTML = state.over
      ? `<b>게임 종료</b><br>${state.result}`
      : `차례: <b>${state.names[state.turn]}</b><br>나: ${seat >= 0 ? state.names[seat] : '관전'}<br>
         <span class="muted">F 또는 내 덱 클릭 = 뒤집기 · Space 또는 종 클릭 = 종<br>같은 과일이 <b>정확히 5개</b> 보이면 종!</span>`;
    hud.innerHTML = state.names.map((nm, i) => `<span class="chip ${state.turn === i && !state.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${state.out[i] ? 'out' : ''}">${nm} ${state.downCounts[i]}+${state.up[i].size}</span>`).join('');
    flipB.disabled = state.over || state.turn !== seat || seat < 0;
    bellB.disabled = state.over || seat < 0;
    ctx.root.dataset.faceup = String(state.up.filter(p => p.top).length);
    fillLog(log, state.log);
    if (state.over && !won) { won = true; sfx.win(); }
  }

  ctx.root.__test = { screen: k => stage.screenOf(k === 'bell' ? new THREE.Vector3(0, Y0 + 1.2, 0) : deckPos(seat).setY(Y0 + 0.2)) };
  return {
    render,
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; delete ctx.root.dataset.faceup; }
  };
}
