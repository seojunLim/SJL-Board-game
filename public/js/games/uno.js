import { Stage, THREE, EASE, textSprite } from '../three3d/scene.js';
import { cardMesh, deckMesh, unoFaceTexture, unoBackTexture } from '../three3d/cards.js';
import { choose, btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// UNO at a card table: your hand fanned in front of you, opponents holding
// fans of card backs around a felt mat, a draw deck and a messy discard pile,
// and a ring of arrows that spins in the play direction glowing in the active
// colour. Cards fly between hands and piles.

const COLOR_HEX = { r: 0xd7261e, y: 0xf4c20d, g: 0x2e9a3e, b: 0x1d6bc6 };
const COLOR_KO = { r: '빨강', y: '노랑', g: '초록', b: '파랑' };
const CW = 1.1, CH = 1.7;
const DECK_POS = new THREE.Vector3(-1.35, 0.07, -0.2);
const PILE_POS = new THREE.Vector3(1.0, 0.07, -0.2);
const TILT = 1.12;                       // how far hand cards stand up

export default function uno(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    camera: { radius: 14.5, phi: 0.74, minR: 8, maxR: 24, target: [0, 0.3, 0.7], minPhi: 0.2, maxPhi: 1.15 },
    mat: { w: 15, h: 11.5, r: 1.6, color: 0x6e1b22, sheen: 0xd06a74 }
  });
  const S = stage.scene;
  const back = unoBackTexture();

  // ------------------------------------------------------------ direction ring
  const ringGroup = new THREE.Group(); ringGroup.position.set(-0.15, 0.1, -0.2); S.add(ringGroup);
  const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.4 });
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(3.25, 0.07, 10, 48, Math.PI * 2 / 3 - 0.55), arrowMat);
    arc.rotation.x = -Math.PI / 2; arc.rotation.z = a0;
    ringGroup.add(arc);
    const aEnd = a0 + Math.PI * 2 / 3 - 0.55;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 16), arrowMat);
    head.position.set(Math.cos(aEnd) * 3.25, 0, -Math.sin(aEnd) * 3.25);
    // point along the tangent (counter-clockwise seen from above)
    head.rotation.set(0, aEnd, 0);
    head.rotateZ(Math.PI / 2);
    head.rotateX(Math.PI);
    ringGroup.add(head);
  }
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.3)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const colorGlow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  colorGlow.position.copy(PILE_POS).setY(0.075); S.add(colorGlow);

  // ------------------------------------------------------------ piles
  let deck = null, deckCount = -1;
  const deckHit = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.2, 0.6, CH + 0.2), new THREE.MeshBasicMaterial({ visible: false }));
  deckHit.position.copy(DECK_POS).setY(0.3); deckHit.userData.pick = { deck: true }; S.add(deckHit);
  function setDeck(n) {
    const shown = Math.min(n, 60);
    if (shown === deckCount) return;
    deckCount = shown;
    if (deck) S.remove(deck);
    deck = deckMesh(back, Math.max(1, shown), { w: CW, h: CH });
    deck.position.copy(DECK_POS); deck.rotation.y = 0.06;
    deck.visible = n > 0;
    S.add(deck);
  }
  const pile = new THREE.Group(); S.add(pile);
  let pileN = 0;
  function pushPile(card, instant) {
    const m = cardMesh(unoFaceTexture(card), back, { w: CW, h: CH });
    const rnd = Math.random;
    m.position.set(PILE_POS.x + (rnd() - 0.5) * 0.35, PILE_POS.y + 0.008 + Math.min(pileN, 40) * 0.009, PILE_POS.z + (rnd() - 0.5) * 0.35);
    m.rotation.y = (rnd() - 0.5) * 0.9;
    pileN++;
    pile.add(m);
    if (pile.children.length > 14) { pile.remove(pile.children[0]); }
    return m;
  }

  // ------------------------------------------------------------ seats
  let st = null, seat = -1, n = 0;
  const seatGroups = [];
  const tags = [];
  function seatFrame(i) {
    const rel = seat >= 0 ? (i - seat + n) % n : i;
    const a = Math.PI / 2 + rel * (Math.PI * 2 / n);
    const mine = rel === 0 && seat >= 0;
    const rx = mine ? 0 : 5.3, rz = mine ? 4.4 : 4.1;
    const pos = new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz + (mine ? 0 : -0.4));
    if (mine) pos.set(0, 0, 4.4);
    return { pos, face: -a + Math.PI / 2, mine };
  }

  const handGroup = new THREE.Group(); S.add(handGroup);
  let handCards = [];
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
  const dimGeo = new THREE.PlaneGeometry(CW * 0.99, CH * 0.99).rotateX(-Math.PI / 2);
  let hoverIdx = -1;

  function handLayout(count) {
    const spread = Math.min(0.66, 8.2 / Math.max(1, count));
    const out = [];
    for (let i = 0; i < count; i++) {
      const t = i - (count - 1) / 2;
      out.push({ x: t * spread, y: 0.95 + Math.abs(t) * -0.012, z: 4.4 + Math.abs(t) * 0.02 + i * 0.004, fan: -t * 0.045 });
    }
    return out;
  }
  function buildHand() {
    handGroup.clear();
    handCards = [];
    if (seat < 0) return;
    const lay = handLayout(st.hand.length);
    st.hand.forEach((c, i) => {
      const pivot = new THREE.Group();
      const m = cardMesh(unoFaceTexture(c), back, { w: CW, h: CH });
      pivot.add(m);
      const L = lay[i];
      pivot.position.set(L.x, L.y, L.z);
      pivot.rotation.set(TILT, L.fan, 0);
      pivot.userData.pick = { hand: i };
      pivot.userData.base = L;
      if (st.turn === seat && !st.over) {
        if (c.playable) pivot.userData.lift = 0.32;
        else { const d = new THREE.Mesh(dimGeo, dimMat); d.position.y = 0.0075; d.renderOrder = 2; m.add(d); }
      }
      handGroup.add(pivot);
      handCards.push(pivot);
    });
    applyLift();
  }
  function applyLift() {
    handCards.forEach((p, i) => {
      const L = p.userData.base;
      const lift = (p.userData.lift || 0) + (i === hoverIdx && p.userData.lift ? 0.35 : 0);
      const y0 = p.position.y, y1 = L.y + lift;
      const z0 = p.position.z, z1 = L.z + (i === hoverIdx && p.userData.lift ? 0.25 : 0);
      if (Math.abs(y1 - y0) > 0.001 || Math.abs(z1 - z0) > 0.001) stage.tween(140, k => { p.position.y = y0 + (y1 - y0) * k; p.position.z = z0 + (z1 - z0) * k; });
    });
  }

  const fanGroups = [];
  function buildOpponents() {
    fanGroups.forEach(g => S.remove(g)); fanGroups.length = 0;
    tags.forEach(t => S.remove(t)); tags.length = 0;
    for (let i = 0; i < n; i++) {
      const f = seatFrame(i);
      if (!f.mine) {
        const g = new THREE.Group();
        g.position.copy(f.pos);
        g.rotation.y = f.face;
        const cnt = Math.min(st.counts[i], 14);
        for (let k = 0; k < cnt; k++) {
          const t = k - (cnt - 1) / 2;
          const pivot = new THREE.Group();
          const m = cardMesh(back, back, { w: CW * 0.9, h: CH * 0.9 });
          pivot.add(m);
          pivot.position.set(t * 0.34, 0.45, k * 0.012);
          pivot.rotation.set(0.5, -t * 0.08, 0);
          g.add(pivot);
        }
        S.add(g); fanGroups.push(g);
      }
      const label = `${st.names[i]}${i === seat ? ' (나)' : ''} · ${st.counts[i]}장${st.counts[i] === 1 ? ' UNO!' : ''}`;
      if (f.mine) continue;
      const tag = textSprite(label, { border: st.turn === i && !st.over ? '#ffc861' : null, scale: 0.0105 });
      const p = f.pos.clone().multiplyScalar(0.78).setY(1.7);
      tag.position.copy(p);
      S.add(tag); tags.push(tag);
    }
  }

  // ------------------------------------------------------------ fly animations
  function flyCard(tex, fromPos, fromRot, toPos, toRot, dur, done, faceDownFirst) {
    const m = cardMesh(tex, back, { w: CW, h: CH });
    m.position.copy(fromPos); m.rotation.copy(fromRot);
    S.add(m);
    const q0 = new THREE.Quaternion().setFromEuler(fromRot), q1 = new THREE.Quaternion().setFromEuler(toRot);
    const a = fromPos.clone(), b = toPos.clone();
    stage.tween(dur, k => {
      m.position.lerpVectors(a, b, k);
      m.position.y += Math.sin(Math.PI * k) * 1.1;
      m.quaternion.slerpQuaternions(q0, q1, k);
    }, { ease: EASE.inOutCubic, done: () => { S.remove(m); done && done(); } });
    void faceDownFirst;
  }
  function seatWorld(i) {
    const f = seatFrame(i);
    return f.mine ? new THREE.Vector3(0, 1.1, 4.4) : f.pos.clone().setY(1.1);
  }

  // ------------------------------------------------------------ picking
  stage.onHover = pick => {
    const idx = pick && pick.hand != null ? pick.hand : -1;
    if (idx !== hoverIdx) { hoverIdx = idx; applyLift(); }
  };
  stage.onPick = async pick => {
    stage.finishTweens();
    if (!pick || !st || st.over) return;
    if (pick.deck) { if (st.canDraw) ctx.send({ type: 'draw' }); return; }
    if (pick.hand == null) return;
    const c = st.hand[pick.hand];
    if (!c || !c.playable) return;
    if (c.kind === 'wild' || c.kind === 'wd4') {
      const color = await choose('바꿀 색을 고르세요', ['r', 'y', 'g', 'b'].map(k => ({
        value: k, label: COLOR_KO[k], icon: '●', style: `color:#${COLOR_HEX[k].toString(16).padStart(6, '0')}`
      })));
      if (!color) return;
      ctx.send({ type: 'play', index: pick.hand, chosenColor: color });
    } else ctx.send({ type: 'play', index: pick.hand });
  };

  // ------------------------------------------------------------ controls
  const drawB = btn('🂠 카드 뽑기', 'primary', () => ctx.send({ type: 'draw' }));
  const passB = btn('패스', 'ghost', () => ctx.send({ type: 'pass' }));
  const unoB = btn('UNO!', 'unoBtn uno hidden', () => ctx.send({ type: 'uno' }));
  const catchWrap = el('span', 'row');
  bar.append(drawB, passB, unoB, catchWrap);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  function flash(text) { banner.textContent = text; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1100); }

  // ------------------------------------------------------------ state
  let prevCounts = null, prevPlay = -1, prevColor = null, prevDir = 0;
  function sync(state) {
    const first = prevCounts === null;
    n = state.n;
    if (first) { pushPile(state.top); }
    else if (state.playSeq !== prevPlay && state.lastPlay) {
      const lp = state.lastPlay;
      const from = seatWorld(lp.seat);
      const fromRot = new THREE.Euler(lp.seat === seat ? TILT : Math.PI, 0, 0);
      const target = new THREE.Vector3(PILE_POS.x, PILE_POS.y + 0.01 + Math.min(pileN, 40) * 0.009, PILE_POS.z);
      const card = lp.card;
      flyCard(unoFaceTexture(card), from, fromRot, target, new THREE.Euler(0, (Math.random() - 0.5) * 0.9, 0), 420, () => { pushPile(card); sfx.card(0.45); });
      const kind = card.kind;
      if (kind === 'skip') flash('⊘ 스킵!');
      else if (kind === 'rev') flash('⇄ 리버스!');
      else if (kind === 'd2') flash('+2');
      else if (kind === 'wd4') flash('+4 와일드!');
      else if (kind === 'wild') flash('★ 와일드!');
    }
    if (!first) {
      for (let i = 0; i < state.n; i++) {
        const played = state.playSeq !== prevPlay && state.lastPlay && state.lastPlay.seat === i ? 1 : 0;
        const gained = state.counts[i] - prevCounts[i] + played;
        for (let k = 0; k < Math.min(gained, 6); k++) {
          setTimeout(() => {
            flyCard(back, DECK_POS.clone().setY(0.4), new THREE.Euler(Math.PI, 0, 0), seatWorld(i),
              new THREE.Euler(i === seat ? TILT : Math.PI + 0.3, 0, 0), 380, null);
            sfx.card(0.25);
          }, k * 120);
        }
      }
    }
    prevCounts = state.counts.slice();
    prevPlay = state.playSeq;

    setDeck(state.deckLeft);
    const hex = COLOR_HEX[state.color] || 0xffffff;
    arrowMat.color.setHex(hex); arrowMat.emissive.setHex(hex);
    colorGlow.material.color.setHex(hex);
    if (prevColor && prevColor !== state.color && !first) flash(`색 변경 → ${COLOR_KO[state.color]}`);
    prevColor = state.color;
    if (prevDir && prevDir !== state.dir) sfx.whoosh();
    prevDir = state.dir;

    buildHand();
    buildOpponents();
    stage.setPickables([deckHit, ...handCards]);
    ctx.root.dataset.hand = seat >= 0 ? String(state.hand.length) : '';
  }

  stage.tick = (dt) => {
    ringGroup.rotation.y -= dt * 0.35 * (st ? st.dir : 1);
    colorGlow.material.opacity = 0.42 + Math.sin(performance.now() / 400) * 0.1;
  };

  function status() {
    const my = seat >= 0 ? st.names[seat] : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${st.names[st.turn]}</b> ${st.dir === 1 ? '⟳' : '⟲'}<br>나: ${my}${seat >= 0 ? ` · 내 카드 ${st.counts[seat]}장` : ''}<br>
         현재 색 <b style="color:#${(COLOR_HEX[st.color] || 0xffffff).toString(16).padStart(6, '0')}">${COLOR_KO[st.color] || '-'}</b><br>
         <span class="muted">${st.turn === seat ? (st.canPass ? '뽑은 카드를 내거나 패스하세요.' : '떠오른 카드를 내거나 덱을 클릭해 뽑으세요.') : '상대 차례…'}</span>`;
    hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''}">${nm} ${st.counts[i]}장</span>`).join('')
      + `<span class="chip">🂠 ${st.deckLeft}</span>`;
    drawB.disabled = !st.canDraw;
    passB.classList.toggle('hidden', !st.canPass);
    unoB.classList.toggle('hidden', !st.needUno);
    catchWrap.innerHTML = '';
    st.catchable.forEach((c, i) => { if (c) catchWrap.appendChild(btn(`${st.names[i]} 잡기! (+2)`, 'primary', () => ctx.send({ type: 'catch', target: i }))); });
    fillLog(log, st.log);
  }

  let played = false;
  ctx.root.__test = {
    screen: k => {
      if (k === 'deck') return stage.screenOf(DECK_POS.clone().setY(0.3));
      const i = Number(k.split(':')[1]);
      const p = handCards[i]; if (!p) return null;
      const v = new THREE.Vector3(0, 0.02, -CH * 0.3); p.localToWorld(v);
      return stage.screenOf(v);
    }
  };
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      sync(state); status();
      if (state.over && !played) { played = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; delete ctx.root.dataset.hand; }
  };
}
