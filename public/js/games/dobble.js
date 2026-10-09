import { Stage, THREE, EASE, textSprite } from '../three3d/scene.js';
import { paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Dobble: round tin-style cards with eight emoji each, sized and turned
// differently. Your card sits in front of you, the centre card in the middle,
// other players' cards around the table. Click the shared symbol on either
// card; the hit point is mapped back to the symbol under the cursor.

const R = 1.55;                              // card radius (world units)
const T = 0.04;
const STACK = 0.012;              // per-card thickness in piles
const EMOJI_FONT = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

// Deterministic per-card layout: one symbol in the middle, seven around.
function layoutFor(cardId) {
  let s = (cardId + 1) * 9301 + 49297;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const spots = [{ x: 0, y: 0, size: 0.34 + rnd() * 0.1 }];
  const turn = rnd() * Math.PI * 2;
  for (let i = 0; i < 7; i++) {
    const a = turn + (i / 7) * Math.PI * 2;
    const d = 0.6 + rnd() * 0.06;
    spots.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, size: 0.26 + rnd() * 0.14 });
  }
  spots.forEach(p => { p.rot = (rnd() - 0.5) * 1.6; });
  // shuffle which symbol goes to which spot
  const order = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => rnd() - 0.5);
  return { spots, order };
}

function cardTexture(cardId, symbols, emoji) {
  const { spots, order } = layoutFor(cardId);
  return paintedTexture('dobble-' + cardId, 640, 640, (g, W) => {
    const c = W / 2;
    const grd = g.createRadialGradient(c, c * 0.9, W * 0.1, c, c, c);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#efeae0');
    g.fillStyle = grd; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d63b3b'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c - 8, 0, Math.PI * 2); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    spots.forEach((p, i) => {
      const sym = symbols[order[i]];
      g.save();
      g.translate(c + p.x * c * 0.92, c + p.y * c * 0.92);
      g.rotate(p.rot);
      g.font = `${Math.round(p.size * W * 0.5)}px ${EMOJI_FONT}`;
      g.fillText(emoji[sym], 0, 4);
      g.restore();
    });
  });
}

export default function dobble(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    camera: { radius: 15, phi: 0.46, minR: 7, maxR: 24, target: [0, 0, 1.5], maxPhi: 1.1 },
    mat: { w: 14, h: 11.5, r: 2, color: 0x2a3f6e, sheen: 0x7d97d6 }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;
  const tinMat = new THREE.MeshPhysicalMaterial({ color: 0xd63b3b, metalness: 0.4, roughness: 0.35, clearcoat: 0.6 });
  const faceMats = new Map();
  const cardGeo = new THREE.CylinderGeometry(R, R, T, 72);
  const faceGeo = new THREE.CircleGeometry(R * 0.995, 72).rotateX(-Math.PI / 2);
  const fixUV = g => { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + 0.5, 0.5 - p.getZ(i) / (2 * R)); return g; };
  fixUV(faceGeo);

  let st = null, seat = -1, n = 0;
  function cardMesh(cardId, symbols) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(cardGeo, tinMat); body.castShadow = body.receiveShadow = true;
    let mat = faceMats.get(cardId);
    if (!mat) { mat = new THREE.MeshPhysicalMaterial({ map: cardTexture(cardId, symbols, st.symbols), roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 0.35 }); faceMats.set(cardId, mat); }
    const face = new THREE.Mesh(faceGeo, mat); face.position.y = T / 2 + 0.002; face.receiveShadow = true;
    g.add(body, face);
    g.userData = { cardId, symbols, face };
    return g;
  }
  // map a world hit point on a card to the symbol drawn there
  function symbolAt(g, point) {
    const local = g.worldToLocal(point.clone());
    const { spots, order } = layoutFor(g.userData.cardId);
    const u = local.x / R / 0.92, v = local.z / R / 0.92;
    let best = -1, bd = 1e9;
    spots.forEach((p, i) => { const d = (p.x - u) ** 2 + (p.y - v) ** 2; if (d < bd) { bd = d; best = i; } });
    if (bd > 0.12) return null;
    return g.userData.symbols[order[best]];
  }

  const piles = [];       // per seat: { group, top }
  let center = null, centerId = null;
  const tags = [];
  const MY_POS = new THREE.Vector3(0, 0, 4.2);
  function seatPos(i) {
    if (i === seat) return MY_POS.clone();
    const rel = seat >= 0 ? (i - seat + n) % n : i;
    const a = Math.PI / 2 + rel * (Math.PI * 2 / n);
    return new THREE.Vector3(Math.cos(a) * 5.4, 0, Math.sin(a) * 4.2 - 0.4);
  }
  function buildSeats() {
    piles.forEach(p => S.remove(p.group)); piles.length = 0;
    tags.forEach(t => S.remove(t)); tags.length = 0;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group();
      const pos = seatPos(i);
      g.position.copy(pos).setY(Y0);
      const h = Math.min(st.piles[i], 30);
      for (let k = 0; k < h - 1; k++) {
        const m = new THREE.Mesh(cardGeo, tinMat); m.position.y = T / 2 + k * STACK; m.rotation.y = k * 0.4; m.castShadow = true; g.add(m);
      }
      const top = cardMesh(st.topIds[i], st.tops[i]);
      top.position.y = T / 2 + (h - 1) * STACK + 0.01;
      top.scale.setScalar(i === seat ? 1.05 : 0.62);
      top.userData.pick = i === seat ? { mine: true } : undefined;
      g.add(top);
      S.add(g);
      piles.push({ group: g, top });
      if (i !== seat) {
        const tag = textSprite(`${st.names[i]} · ${st.piles[i]}장`, { scale: 0.0095 });
        tag.position.copy(pos).setY(Y0 + 1.5); S.add(tag); tags.push(tag);
      }
    }
  }
  function buildCenter() {
    if (center) S.remove(center);
    center = null;
    if (st.centerId == null) return;
    center = cardMesh(st.centerId, st.center);
    const h = Math.min(st.deckLeft + 1, 40);
    const stack = new THREE.Group();
    for (let k = 0; k < h - 1; k++) { const m = new THREE.Mesh(cardGeo, tinMat); m.position.y = T / 2 + k * STACK; m.rotation.y = k * 0.7; m.castShadow = true; stack.add(m); }
    center.position.y = T / 2 + (h - 1) * STACK + 0.01;
    center.scale.setScalar(1.12);
    center.userData.pick = { center: true };
    const holderG = new THREE.Group(); holderG.position.set(0, Y0, -0.3);
    holderG.add(stack, center);
    S.add(holderG);
    center.userData.holder = holderG;
    const old = center;
    center = holderG; center.userData.card = old;
  }

  stage.onPick = (pick, point, obj) => {
    if (!pick || !st || st.over || seat < 0 || !point) return;
    const g = pick.mine ? piles[seat].top : center && center.userData.card;
    if (!g) return;
    const sym = symbolAt(g, point);
    if (sym == null) return;
    if (Date.now() < lockUntil) { ctx.toast('잠깐! 틀린 뒤라 잠시 기다려야 해요.'); return; }
    ctx.send({ type: 'claim', symbol: sym, center: st.centerId });
  };

  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  const lockBar = el('div', 'lockBar'); holder.appendChild(lockBar);
  let bannerT = 0, lockUntil = 0, lastFlash = null, won = false;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 900); };

  stage.tick = () => {
    const left = lockUntil - Date.now();
    lockBar.style.display = left > 0 ? 'block' : 'none';
    if (left > 0) lockBar.textContent = `🔒 ${(left / 1000).toFixed(1)}초`;
  };

  ctx.root.__test = {
    screen: k => {
      // 'common' -> the symbol shared by my card and the centre (for tests)
      if (k === 'common' || k === 'wrong') {
        const mine = piles[seat].top;
        const sym = k === 'common' ? st.tops[seat].find(x => st.center.includes(x)) : st.tops[seat].find(x => !st.center.includes(x));
        const { spots, order } = layoutFor(st.topIds[seat]);
        const i = order.findIndex(o => st.tops[seat][o] === sym);
        const v = new THREE.Vector3(spots[i].x * R * 0.92, T / 2, spots[i].y * R * 0.92);
        mine.localToWorld(v);
        return stage.screenOf(v);
      }
      return null;
    }
  };

  return {
    render(state, mySeat) {
      st = state; seat = mySeat; n = state.n;
      // keep the local lock clock in step with the server's
      if (seat >= 0) lockUntil = Date.now() + Math.max(0, st.lockedUntil - st.now);
      const f = st.flash;
      if (f && lastFlash !== null && f.t !== lastFlash) {
        if (f.type === 'good') { sfx.card(0.5); sfx.bell(0.25); flash(`${st.names[f.seat]}: ${st.symbols[f.symbol]} ${st.symbolNames[f.symbol]}!`); }
        if (f.type === 'bad' && f.seat === seat) { sfx.buzz(); flash('❌ 아니에요!'); }
      }
      lastFlash = f ? f.t : 0;
      buildSeats(); buildCenter();
      const picks = [piles[seat] && piles[seat].top, center && center.userData.card].filter(Boolean);
      stage.setPickables(picks);
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `남은 가운데 카드 <b>${st.deckLeft + (st.centerId != null ? 1 : 0)}</b>장<br>내 카드 ${seat >= 0 ? st.piles[seat] : '-'}장<br><span class="muted">내 카드와 가운데 카드에 똑같이 있는 그림을 먼저 누르세요!</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${i === seat ? 'me' : ''}">${nm} ${st.piles[i]}장</span>`).join('');
      fillLog(log, st.log);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
