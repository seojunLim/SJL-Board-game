import { Stage, THREE, EASE, MOBILE, textSprite } from '../three3d/scene.js';
import { paintedTexture, roundRect } from '../three3d/textures.js';
import { cardMesh } from '../three3d/cards.js';
import { btn, el, fillLog, choose } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Splendor: heavy poker-chip gem tokens, three rows of development cards with
// their decks, noble tiles on top, and your own cards/chips in front of you.
// Click chips in the bank to pick gems, click a card to buy or reserve it.

const GEMS = ['w', 'u', 'g', 'r', 'k'];
const ALL = [...GEMS, 'o'];
const KO = { w: '다이아몬드', u: '사파이어', g: '에메랄드', r: '루비', k: '오닉스', o: '황금' };
const HEX = { w: '#f3f1ec', u: '#1f5fd1', g: '#17944a', r: '#d0202d', k: '#2b2725', o: '#e5b520' };
const DARK = { w: '#9a948a', u: '#0d2f72', g: '#0a4d26', r: '#6e0d14', k: '#000000', o: '#8a6408' };
const INK = c => (c === 'w' || c === 'o' ? '#222' : '#fff');
const CW = 1.4, CH = 1.95;                  // card size
const CHIP_R = 0.4, CHIP_T = 0.085;
const ROW_Z = { 3: -2.75, 2: -0.7, 1: 1.35 };
const COL_X = i => -2.55 + i * 1.7;
const DECK_X = -4.45;

// ------------------------------------------------------------ artwork
function gemPath(g, x, y, s, c) {
  // a cut gem: crown + pavilion with facets
  g.save(); g.translate(x, y);
  const top = -s * 0.45, mid = -s * 0.12, bot = s * 0.55;
  g.beginPath();
  g.moveTo(-s * 0.3, top); g.lineTo(s * 0.3, top); g.lineTo(s * 0.55, mid); g.lineTo(0, bot); g.lineTo(-s * 0.55, mid); g.closePath();
  const grd = g.createLinearGradient(-s, top, s, bot);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.25, HEX[c]); grd.addColorStop(1, DARK[c]);
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath();
  g.moveTo(-s * 0.55, mid); g.lineTo(s * 0.55, mid);
  g.moveTo(-s * 0.3, top); g.lineTo(-s * 0.15, mid); g.lineTo(0, bot); g.lineTo(s * 0.15, mid); g.lineTo(s * 0.3, top);
  g.moveTo(-s * 0.15, mid); g.lineTo(0, top); g.lineTo(s * 0.15, mid);
  g.stroke();
  g.restore();
}
function costDot(g, x, y, r, c, n) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = HEX[c]; g.fill();
  g.lineWidth = r * 0.16; g.strokeStyle = c === 'w' ? '#8b857b' : 'rgba(255,255,255,.75)'; g.stroke();
  g.fillStyle = INK(c); g.font = `900 ${Math.round(r * 1.25)}px "Noto Sans KR",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (c !== 'w' && c !== 'o') { g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = r * 0.14; g.strokeText(n, x, y + r * 0.06); }
  g.fillText(n, x, y + r * 0.06);
}
// a little procedural landscape so every card looks like a painting
function scenery(g, W, H, card) {
  let s = card.id * 7919 + 13;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, ['#f5e6c4', '#cfe0f2', '#f1d2b8'][card.level - 1]);
  sky.addColorStop(1, ['#c9b48a', '#7d94b3', '#a77b62'][card.level - 1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let layer = 0; layer < 3; layer++) {
    g.beginPath(); g.moveTo(0, H);
    const base = H * (0.5 + layer * 0.14);
    for (let x = 0; x <= W; x += W / 12) g.lineTo(x, base - rnd() * H * 0.12);
    g.lineTo(W, H); g.closePath();
    g.fillStyle = `rgba(${40 + layer * 25},${55 + layer * 20},${40 + layer * 10},${0.35 + layer * 0.2})`; g.fill();
  }
  // tinted wash of the card's own colour
  g.fillStyle = HEX[card.color]; g.globalAlpha = card.color === 'w' ? 0.12 : 0.22; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  // a building/mine silhouette for higher levels
  if (card.level > 1) {
    g.fillStyle = 'rgba(40,28,20,.55)';
    const bx = W * (0.4 + rnd() * 0.3), bw = W * 0.18 * card.level / 2, bh = H * 0.12 * card.level;
    g.fillRect(bx, H * 0.62 - bh, bw, bh);
    g.beginPath(); g.moveTo(bx - 6, H * 0.62 - bh); g.lineTo(bx + bw / 2, H * 0.62 - bh - bw * 0.6); g.lineTo(bx + bw + 6, H * 0.62 - bh); g.fill();
  }
}
function cardFace(card) {
  return paintedTexture('spl-card-' + card.id, 280, 390, (g, W, H) => {
    scenery(g, W, H, card);
    // header band
    g.fillStyle = 'rgba(255,255,255,.82)'; g.fillRect(0, 0, W, 78);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 78); g.lineTo(W, 78); g.stroke();
    if (card.points) {
      g.fillStyle = '#2a1d10';
      g.font = '900 70px "Noto Sans KR",sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(card.points, 18, 44);
    }
    gemPath(g, W - 48, 40, 58, card.color);
    // cost column
    const costs = GEMS.filter(c => card.cost[c]);
    costs.forEach((c, i) => costDot(g, 40, H - 38 - (costs.length - 1 - i) * 66, 30, c, card.cost[c]));
    g.strokeStyle = '#d8cfbf'; g.lineWidth = 8; roundRect(g, 4, 4, W - 8, H - 8, 18); g.stroke();
  });
}
function cardBack(level) {
  const col = ['#1f7a43', '#c7962a', '#1f4f9a'][level - 1];
  return paintedTexture('spl-back-' + level, 280, 390, (g, W, H) => {
    const grd = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.7);
    grd.addColorStop(0, col); grd.addColorStop(1, '#141414');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,230,170,.7)'; g.lineWidth = 6; roundRect(g, 16, 16, W - 32, H - 32, 16); g.stroke();
    g.lineWidth = 2; roundRect(g, 28, 28, W - 56, H - 56, 12); g.stroke();
    for (let i = 0; i < level; i++) { g.beginPath(); g.arc(W / 2 + (i - (level - 1) / 2) * 44, H / 2, 14, 0, Math.PI * 2); g.fillStyle = '#f4dc9a'; g.fill(); }
  });
}
function nobleFace(noble) {
  return paintedTexture('spl-noble-' + noble.id, 300, 300, (g, W, H) => {
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, '#f4ead7'); grd.addColorStop(1, '#c9b08a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    // a stylised portrait
    g.fillStyle = 'rgba(80,50,30,.25)';
    g.beginPath(); g.arc(W * 0.62, H * 0.42, W * 0.17, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(W * 0.62, H * 0.95, W * 0.32, H * 0.36, 0, 0, Math.PI * 2); g.fill();
    g.font = `${Math.round(W * 0.2)}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('👑', W * 0.62, H * 0.2);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, W * 0.3, H);
    g.fillStyle = '#fff'; g.strokeStyle = '#2a2018'; g.lineWidth = 7; g.font = '900 64px "Noto Sans KR",sans-serif';
    g.strokeText('3', W * 0.15, 48); g.fillText('3', W * 0.15, 48);
    const req = GEMS.filter(c => noble.req[c]);
    req.forEach((c, i) => {
      const y = H - 40 - (req.length - 1 - i) * 66;
      g.fillStyle = HEX[c]; roundRect(g, W * 0.05, y - 26, W * 0.2, 52, 8); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.stroke();
      g.fillStyle = INK(c); g.font = '900 38px "Noto Sans KR",sans-serif'; g.fillText(noble.req[c], W * 0.15, y + 2);
    });
    g.strokeStyle = '#8c6b3c'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
  });
}
function chipFace(c) {
  return paintedTexture('spl-chip-' + c, 256, 256, (g, W) => {
    const m = W / 2;
    g.fillStyle = HEX[c]; g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
    // edge spots like a casino chip
    g.fillStyle = c === 'w' ? '#c9c2b6' : 'rgba(255,255,255,.85)';
    for (let i = 0; i < 8; i++) { g.save(); g.translate(m, m); g.rotate(i * Math.PI / 4); g.fillRect(-14, -m + 4, 28, 26); g.restore(); }
    g.beginPath(); g.arc(m, m, m * 0.68, 0, Math.PI * 2); g.fillStyle = c === 'o' ? '#fff2c2' : '#f7f3ea'; g.fill();
    g.lineWidth = 6; g.strokeStyle = DARK[c]; g.stroke();
    if (c === 'o') {
      g.fillStyle = '#c99612'; g.font = '900 110px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', m, m + 6);
    } else gemPath(g, m, m + 4, 112, c);
  });
}

export default function splendor(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.9,
    camera: { radius: 16.5, phi: 0.52, minR: 8, maxR: 28, target: [0.3, 0, 0.9], maxPhi: 1.15 },
    mat: { w: 14, h: 13.4, r: 1.2, color: 0x3b1f2c, sheen: 0xa86b86 }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_T, 40);
  const chipTop = new THREE.CircleGeometry(CHIP_R * 0.999, 40).rotateX(-Math.PI / 2);
  { const p = chipTop.attributes.position, uv = chipTop.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * CHIP_R) + 0.5, 0.5 - p.getZ(i) / (2 * CHIP_R)); }
  const chipSide = {}, chipFaceMat = {};
  for (const c of ALL) {
    chipSide[c] = new THREE.MeshPhysicalMaterial({ color: HEX[c], roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2, metalness: c === 'o' ? 0.5 : 0 });
    chipFaceMat[c] = new THREE.MeshPhysicalMaterial({ map: chipFace(c), roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 0.6 });
  }
  function chipStack(c, count, opts = {}) {
    const g = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(chipGeo, chipSide[c]);
      m.position.set(Math.sin(i * 2.1) * 0.02, CHIP_T / 2 + i * CHIP_T, Math.cos(i * 1.7) * 0.02);
      m.castShadow = m.receiveShadow = true; g.add(m);
    }
    const top = new THREE.Mesh(chipTop, chipFaceMat[c]);
    top.position.y = Math.max(1, count) * CHIP_T + 0.002;
    top.rotation.y = opts.spin || 0;
    if (!count) { top.material = chipFaceMat[c].clone(); top.material.transparent = true; top.material.opacity = 0.25; }
    g.add(top);
    g.userData.top = top;
    return g;
  }

  const nobleGeo = new THREE.BoxGeometry(1.3, 0.06, 1.3);
  const nobleSide = new THREE.MeshStandardMaterial({ color: 0x8c6b3c, roughness: 0.5 });
  function nobleMesh(id) {
    const m = new THREE.Mesh(nobleGeo, [nobleSide, nobleSide, new THREE.MeshPhysicalMaterial({ map: nobleFace(st.nobleList[id]), roughness: 0.55, clearcoat: 0.3 }), nobleSide, nobleSide, nobleSide]);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  // ------------------------------------------------------------ state
  let st = null, seat = -1, pick = [], prev = null, won = false, discardSel = {};
  const world = new THREE.Group(); S.add(world);
  const pickables = [];
  const objs = {};                     // test lookup: key -> Object3D
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;
  const me = () => (seat >= 0 ? st.players[seat] : null);

  function canAfford(p, card) {
    let gold = 0;
    for (const c of GEMS) gold += Math.max(0, (card.cost[c] || 0) - p.bonus[c] - p.tokens[c]);
    return gold <= p.tokens.o;
  }
  function addCard(id, x, z, scale, pickData, key, fromDeck) {
    const card = st.cards[id];
    const m = cardMesh(cardFace(card), cardBack(card.level), { w: CW, h: CH });
    m.position.set(x, Y0 + 0.01, z); m.scale.setScalar(scale);
    m.userData.pick = pickData;
    world.add(m);
    if (pickData) pickables.push(m);
    if (key) objs[key] = m;
    if (fromDeck) {
      const to = m.position.clone(); const from = new THREE.Vector3(DECK_X, Y0 + 0.4, to.z);
      m.rotation.z = Math.PI;
      stage.tween(420, t => { m.position.lerpVectors(from, to, t); m.position.y += Math.sin(t * Math.PI) * 0.7; m.rotation.z = Math.PI * (1 - t); }, { ease: EASE.outCubic });
    }
    return m;
  }

  function build() {
    world.clear(); pickables.length = 0;
    for (const k in objs) delete objs[k];
    const p = me();

    // nobles
    st.nobles.forEach((id, i) => {
      const m = nobleMesh(id);
      m.position.set((i - (st.nobles.length - 1) / 2) * 1.55, Y0 + 0.03, -4.75);
      world.add(m);
    });

    // decks + market
    for (const l of [1, 2, 3]) {
      const left = st.deckLeft[l];
      if (left) {
        const h = Math.min(left, 30) * 0.012;
        const body = new THREE.Mesh(new THREE.BoxGeometry(CW * 0.98, h, CH * 0.98), new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.8 }));
        body.position.set(DECK_X, Y0 + h / 2, ROW_Z[l]); body.castShadow = body.receiveShadow = true; world.add(body);
        const top = cardMesh(cardBack(l), cardBack(l), { w: CW, h: CH });
        top.position.set(DECK_X, Y0 + h + 0.008, ROW_Z[l]);
        top.userData.pick = { deck: l };
        world.add(top); pickables.push(top); objs['deck:' + l] = top;
        const tag = textSprite(`${left}`, { scale: 0.008 }); tag.position.set(DECK_X - CW / 2 - 0.1, Y0 + h + 0.3, ROW_Z[l] + CH / 2 - 0.2); world.add(tag);
      }
      st.market[l].forEach((id, i) => {
        if (id == null) return;
        const was = prev && prev.market[l][i] !== id;
        const m = addCard(id, COL_X(i), ROW_Z[l], 1, { card: id }, 'card:' + id, was);
        if (myTurn() && p && canAfford(p, st.cards[id])) {
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.16, CH + 0.16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, depthWrite: false }));
          glow.position.y = -0.004; m.add(glow);
        }
      });
    }

    // bank
    ALL.forEach((c, i) => {
      const n = st.bank[c];
      const g = chipStack(c, n, { spin: i });
      g.position.set(5.35, Y0, -4.1 + i * 1.12);
      const sel = pick.filter(x => x === c).length;
      if (sel) g.position.y += 0.18 + sel * 0.12;
      world.add(g);
      g.userData.top.userData.pick = { bank: c };
      if (c !== 'o') { pickables.push(g.userData.top); g.children.forEach(m => { if (m !== g.userData.top) { m.userData.pick = { bank: c }; pickables.push(m); } }); }
      objs['bank:' + c] = g.userData.top;
      const tag = textSprite(String(n), { scale: 0.007 }); tag.position.set(6.05, Y0 + 0.25, -4.1 + i * 1.12); world.add(tag);
    });

    // my area: bonus stacks, tokens, reserved cards
    if (p) {
      GEMS.forEach((c, i) => {
        const x = -4.4 + i * 1.62;
        const ids = p.cards.filter(id => st.cards[id].color === c);
        ids.forEach((id, k) => {
          addCard(id, x, 3.85 + k * 0.24, 0.72, null, null, false).position.y += k * 0.004;
        });
        const t = p.tokens[c];
        const g = chipStack(c, t, { spin: i * 0.8 });
        g.position.set(x, Y0, 5.75 + Math.max(0, ids.length - 1) * 0.24);
        if (st.discard && myTurn()) { g.userData.top.userData.pick = { mine: c }; pickables.push(g.userData.top); objs['mine:' + c] = g.userData.top; }
        if (t || ids.length) world.add(g);
        if (t) { const tag = textSprite(String(t), { scale: 0.007 }); tag.position.set(x + 0.55, Y0 + 0.3, g.position.z + 0.3); world.add(tag); }
      });
      if (p.tokens.o) { const g = chipStack('o', p.tokens.o); g.position.set(3.85, Y0, 5.75); world.add(g); if (st.discard && myTurn()) { g.userData.top.userData.pick = { mine: 'o' }; pickables.push(g.userData.top); objs['mine:o'] = g.userData.top; } }
      p.reserved.forEach((r, i) => {
        const m = addCard(r.id, 5.1 - i * 0.18, 3.6 + i * 0.5, 0.72, { reserved: r.id }, 'reserved:' + r.id, false);
        m.rotation.y = -0.25;
        const lift = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.2, CH + 0.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.4, depthWrite: false }));
        lift.position.y = -0.004; m.add(lift);
      });
    }
    stage.setPickables(pickables);
  }

  // ------------------------------------------------------------ input
  async function onCard(id, fromReserved) {
    const p = me();
    const card = st.cards[id];
    const afford = canAfford(p, card);
    const opts = [];
    opts.push({ value: 'buy', label: afford ? '구매하기' : '보석이 모자라요', icon: '💰', cls: afford ? '' : 'off' });
    if (!fromReserved) opts.push({ value: 'reserve', label: p.reserved.length >= 3 ? '예약 가득 (3장)' : `예약하기${st.bank.o ? ' (+황금)' : ''}`, icon: '📌', cls: p.reserved.length >= 3 ? 'off' : '' });
    const v = await choose(`${KO[card.color]} 카드 · ${card.points}점`, opts);
    if (v === 'buy') { if (!afford) return ctx.toast('보석이 모자라요. 황금(★)은 아무 색으로나 쓸 수 있어요.'); ctx.send({ type: 'buy', card: id }); }
    if (v === 'reserve') { if (p.reserved.length >= 3) return ctx.toast('예약은 3장까지예요.'); ctx.send({ type: 'reserve', card: id }); }
  }
  function validPick(next) {
    const same = next.length === 2 && next[0] === next[1];
    if (same) return st.bank[next[0]] >= 4 ? null : '같은 색 2개는 4개 이상 남은 색만 가능해요.';
    if (new Set(next).size !== next.length) return next.length === 2 ? null : '같은 색은 2개까지만, 다른 색과 섞을 수 없어요.';
    if (next.length > 3) return '최대 3개예요.';
    return null;
  }
  stage.onPick = (pk) => {
    stage.finishTweens();
    if (!pk || !st) return;
    if (!myTurn()) { ctx.toast(st.over ? '게임이 끝났어요.' : '내 차례가 아니에요.'); return; }
    if (st.discard) {
      if (pk.mine) {
        const need = over();
        const cur = Object.values(discardSel).reduce((a, b) => a + b, 0);
        if ((discardSel[pk.mine] || 0) < me().tokens[pk.mine] && cur < need) { discardSel[pk.mine] = (discardSel[pk.mine] || 0) + 1; sfx.tile(0.3); }
        updateUi();
      }
      return;
    }
    if (pk.bank) {
      if (!st.bank[pk.bank] && !pick.includes(pk.bank)) return ctx.toast('그 보석은 다 떨어졌어요.');
      const next = [...pick, pk.bank];
      const sameTwo = pick.length === 1 && pick[0] === pk.bank;
      if (sameTwo && st.bank[pk.bank] < 4) return ctx.toast('같은 색 2개는 그 색이 4개 이상 남았을 때만 가져올 수 있어요.');
      if (pick.length === 2 && pick[0] === pick[1]) return ctx.toast('같은 색 2개를 골랐어요. 가져오기를 누르세요.');
      if (pick.includes(pk.bank) && !sameTwo) { pick = pick.filter(x => x !== pk.bank); build(); updateUi(); return; }
      const err = validPick(next);
      if (err) return ctx.toast(err);
      pick = next; sfx.tile(0.35); build(); updateUi();
      return;
    }
    if (pk.card != null) return onCard(pk.card, false);
    if (pk.reserved != null) return onCard(pk.reserved, true);
    if (pk.deck) {
      if (me().reserved.length >= 3) return ctx.toast('예약은 3장까지예요.');
      choose(`${pk.deck}단계 덱 맨 위 카드를 몰래 예약할까요?`, [{ value: 1, label: '예약하기', icon: '📌' }]).then(v => { if (v) ctx.send({ type: 'reserve', level: pk.deck }); });
    }
  };

  const over = () => Object.values(me().tokens).reduce((a, b) => a + b, 0) - 10;
  const takeB = btn('💎 가져오기', 'primary', () => { ctx.send({ type: 'take', gems: pick }); pick = []; sfx.disc(0.4); });
  const clearB = btn('선택 취소', 'ghost', () => { pick = []; discardSel = {}; build(); updateUi(); });
  const discardB = btn('반납하기', 'primary', () => { ctx.send({ type: 'discard', gems: discardSel }); discardSel = {}; });
  const resign = btn('포기', 'ghost', () => { if (confirm('정말 포기할까요?')) ctx.send({ type: 'resign' }); });
  const pickLine = el('span', 'pickLine');
  bar.append(pickLine, takeB, discardB, clearB, resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1400); };

  const dot = (c, n) => `<span class="gemDot" style="background:${HEX[c]};color:${INK(c)}">${n}</span>`;
  function updateUi() {
    const mine = myTurn();
    takeB.style.display = mine && !st.discard ? '' : 'none';
    discardB.style.display = mine && st.discard ? '' : 'none';
    const avail = GEMS.filter(c => st.bank[c] > 0).length;
    takeB.disabled = !(pick.length === 2 && pick[0] === pick[1]) && !(pick.length && new Set(pick).size === pick.length && pick.length >= Math.min(3, avail));
    clearB.disabled = !pick.length && !Object.keys(discardSel).length;
    if (st.discard && mine) {
      const cur = Object.values(discardSel).reduce((a, b) => a + b, 0);
      discardB.disabled = cur !== over();
      pickLine.innerHTML = `반납 ${cur}/${over()}: ${Object.entries(discardSel).map(([c, n]) => dot(c, n)).join('') || '<span class="muted">내 앞의 보석을 누르세요</span>'}`;
    } else pickLine.innerHTML = mine ? (pick.length ? '선택: ' + pick.map(c => dot(c, '')).join('') : '<span class="muted">보석 또는 카드를 고르세요</span>') : '';
    resign.disabled = st.over || seat < 0;
  }

  ctx.root.__test = {
    screen: k => {
      const o = objs[k];
      if (!o) return null;
      const v = new THREE.Vector3(); o.getWorldPosition(v);
      return stage.screenOf(v);
    },
    state: () => st
  };

  return {
    render(state, mySeat) {
      stage.finishTweens();
      const before = st;
      st = state; seat = mySeat;
      if (!myTurn()) pick = [];
      if (!st.discard) discardSel = {};
      if (before && st.last && JSON.stringify(st.last) !== JSON.stringify(before.last)) {
        const l = st.last;
        if (l.type === 'buy') sfx.card(0.5); else if (l.type === 'take') sfx.disc(0.4); else sfx.card(0.3);
      }
      if (st.nobleFlash && (!before || !before.nobleFlash || before.nobleFlash.t !== st.nobleFlash.t)) {
        flash(`👑 ${st.names[st.nobleFlash.seat]}에게 귀족 방문! +3점`); sfx.bell(0.3);
      }
      prev = before;
      build();
      prev = st;
      const turnName = st.names[st.turn];
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `목표 <b>${st.target}점</b>${st.finalRound ? ' · <b style="color:#ffb44a">마지막 바퀴!</b>' : ''}<br>차례: <b>${turnName}</b>${myTurn() ? ' (나)' : ''}<br>
           <span class="muted">${myTurn() ? (st.discard ? `보석이 10개를 넘어요. ${over()}개를 골라 반납하세요.` : '보석 3색 / 같은 색 2개 가져오기, 또는 카드 구매·예약. 빛나는 카드는 지금 살 수 있어요.') : '상대 차례…'}${MOBILE ? '' : ''}</span>`;
      hud.innerHTML = st.players.map((p, i) => {
        const tok = ALL.filter(c => p.tokens[c]).map(c => dot(c, p.tokens[c])).join('');
        const bon = GEMS.filter(c => p.bonus[c]).map(c => `<span class="gemCard" style="background:${HEX[c]};color:${INK(c)}">${p.bonus[c]}</span>`).join('');
        return `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''}">${st.names[i]} <b>${p.points}점</b> ${bon}${tok}${p.reserved.length ? ` 📌${p.reserved.length}` : ''}${p.nobles.length ? ` 👑${p.nobles.length}` : ''}</span>`;
      }).join('');
      updateUi();
      fillLog(log, st.log);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
