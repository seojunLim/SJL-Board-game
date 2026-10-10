import { Stage, THREE, EASE, MOBILE, textSprite } from '../three3d/scene.js';
import { paintedTexture, roundRect } from '../three3d/textures.js';
import { cardMesh } from '../three3d/cards.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// 6 nimmt!: four rows of cards in the middle, a red marker where the deadly
// sixth card would go, your hand fanned in front of you. Everyone picks at
// once; the picked cards turn face up above the rows and slide into place
// from lowest to highest, sweeping rows into the takers' piles.

const CW = 1.0, CH = 1.48;
const ROW_Z = [-2.55, -0.85, 0.85, 2.55];
const SLOT_X = j => -3.1 + j * 1.18;
const REVEAL_Z = -4.55;
const PILE = new THREE.Vector3(-5.6, 0, 4.7);
const TILT = 1.05;
const EMOJI = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

function heads(n) { if (n === 55) return 7; if (n % 11 === 0) return 5; if (n % 10 === 0) return 3; if (n % 5 === 0) return 2; return 1; }
const COL = { 1: ['#ece8f7', '#6b5aa8'], 2: ['#8cc0ef', '#1f5d9e'], 3: ['#f6cd57', '#9a6a00'], 5: ['#ef6a5a', '#8e1c12'], 7: ['#b052d6', '#4f136b'] };

function face(n) {
  const h = heads(n), [bg, ink] = COL[h];
  return paintedTexture('6n-' + n, 300, 444, (g, W, H) => {
    g.fillStyle = '#fbfaf6'; roundRect(g, 0, 0, W, H, 26); g.fill();
    g.fillStyle = bg; roundRect(g, 14, 14, W - 28, H - 28, 18); g.fill();
    // heads row
    g.font = `${h >= 5 ? 30 : 38}px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const per = Math.min(h, 4);
    for (let i = 0; i < h; i++) {
      const row = Math.floor(i / per), col = i % per, cnt = Math.min(per, h - row * per);
      g.fillText('🐮', W / 2 + (col - (cnt - 1) / 2) * (h >= 5 ? 40 : 50), 60 + row * 40);
    }
    // big number in a cow-head badge
    g.fillStyle = '#fbfaf6'; g.beginPath(); g.ellipse(W / 2, H * 0.58, 108, 96, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 8; g.strokeStyle = ink; g.stroke();
    g.fillStyle = ink; g.font = `900 ${n >= 100 ? 92 : 112}px "Noto Sans KR",sans-serif`;
    g.fillText(String(n), W / 2, H * 0.6);
    g.font = '800 34px "Noto Sans KR",sans-serif';
    g.fillText(String(n), 40, H - 38); g.fillText(String(n), W - 40, H - 38);
  });
}
function back() {
  return paintedTexture('6n-back', 300, 444, (g, W, H) => {
    g.fillStyle = '#fbfaf6'; roundRect(g, 0, 0, W, H, 26); g.fill();
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#5b2c83'); grd.addColorStop(1, '#2a1240');
    g.fillStyle = grd; roundRect(g, 14, 14, W - 28, H - 28, 18); g.fill();
    g.font = `130px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🐮', W / 2, H / 2 - 10);
    g.fillStyle = '#f6cd57'; g.font = '900 64px "Noto Sans KR",sans-serif'; g.fillText('6', W / 2, H - 70);
  });
}

export default function sixnimmt(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 15, phi: 0.58, minR: 8, maxR: 24, target: [0, 0, 0.6], maxPhi: 1.15 },
    mat: { w: 14.5, h: 12.5, r: 1.4, color: 0x2a5e2a, sheen: 0x8fd08f }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;
  const BACK = back();

  // the deadly sixth slot
  for (let r = 0; r < 4; r++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.1, CH + 0.1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: paintedTexture('6n-slot', 128, 190, (g, W, H) => {
        g.strokeStyle = '#ff4a4a'; g.lineWidth = 8; g.setLineDash([14, 10]); roundRect(g, 6, 6, W - 12, H - 12, 12); g.stroke();
        g.fillStyle = 'rgba(255,74,74,.85)'; g.font = '900 70px "Noto Sans KR",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('6', W / 2, H / 2);
      }), transparent: true, depthWrite: false }));
    m.position.set(SLOT_X(5), Y0 + 0.003, ROW_Z[r]); S.add(m);
  }
  const rowHits = ROW_Z.map((z, r) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(SLOT_X(5) - SLOT_X(0) + CW + 1.4, CH + 0.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set((SLOT_X(0) + SLOT_X(5)) / 2 - 0.6, Y0 + 0.002, z); m.userData.pick = { row: r }; S.add(m); return m;
  });

  const rowsG = new THREE.Group(); S.add(rowsG);
  const revealG = new THREE.Group(); S.add(revealG);
  const handG = new THREE.Group(); S.add(handG);
  const pileG = new THREE.Group(); S.add(pileG);
  const tagsG = new THREE.Group(); S.add(tagsG);

  let st = null, seat = -1, model = null, rowMeshes = [[], [], [], []], revealMeshes = new Map();
  let animId = 0, animCount = 0, busy = false, queue = [], won = false, hoverRow = -1;
  let handCards = [];

  const slotPos = (r, j) => new THREE.Vector3(SLOT_X(j), Y0 + 0.01 + j * 0.002, ROW_Z[r]);
  function newCard(n, faceUp = true) {
    const m = cardMesh(face(n), BACK, { w: CW, h: CH });
    if (!faceUp) m.rotation.z = Math.PI;
    return m;
  }
  function buildRows(rows) {
    rowsG.clear(); rowMeshes = [[], [], [], []];
    rows.forEach((r, i) => r.forEach((n, j) => { const m = newCard(n); m.position.copy(slotPos(i, j)); rowsG.add(m); rowMeshes[i].push(m); }));
    tagsG.clear();
    rows.forEach((r, i) => {
      const h = r.reduce((a, c) => a + heads(c), 0);
      const t = textSprite(`🐮${h}`, { scale: 0.0085, border: h >= 5 ? '#ff6a5a' : null }); t.position.set(SLOT_X(0) - 1.15, Y0 + 0.3, ROW_Z[i]); tagsG.add(t);
    });
  }
  function buildPile() {
    pileG.clear();
    if (seat < 0) return;
    const cnt = st.takenCount[seat];
    for (let k = 0; k < Math.min(cnt, 20); k++) { const m = newCard(1, false); m.position.copy(PILE).setY(Y0 + 0.01 + k * 0.012); m.rotation.y = (k % 5 - 2) * 0.07; pileG.add(m); }
    const t = textSprite(`내 소 🐮${st.takenHeads[seat]}${st.target ? ` (누적 ${st.scores[seat] + st.takenHeads[seat]})` : ''}`, { scale: 0.0085 });
    t.position.copy(PILE).setY(Y0 + 0.9); pileG.add(t);
  }
  function buildHand() {
    handG.clear(); handCards = [];
    if (seat < 0) return;
    const hand = st.myHand, n = hand.length;
    const spread = Math.min(0.85, 8.4 / Math.max(1, n));
    hand.forEach((c, i) => {
      const t = i - (n - 1) / 2;
      const pv = new THREE.Group();
      const m = newCard(c); pv.add(m);
      const chosen = st.myChoice === c;
      pv.position.set(t * spread + 0.5, 0.95 + (chosen ? 0.45 : 0), 4.95 - (chosen ? 0.35 : 0) + i * 0.004);
      pv.rotation.set(TILT, -t * 0.03, 0);
      pv.userData.pick = { card: c };
      handG.add(pv); handCards.push(pv);
    });
  }
  function buildReveal(cards, faceUp) {
    revealG.clear(); revealMeshes = new Map();
    const n = cards.length, gap = Math.min(1.15, 11 / Math.max(1, n));
    cards.forEach((p, i) => {
      const m = newCard(p.card, faceUp);
      m.position.set((i - (n - 1) / 2) * gap, Y0 + 0.01, REVEAL_Z);
      revealG.add(m); revealMeshes.set(p.card, m);
      const t = textSprite(st.names[p.seat], { scale: 0.0065 }); t.position.set(m.position.x, Y0 + 0.25, REVEAL_Z - CH / 2 - 0.3); revealG.add(t);
    });
  }

  function fly(m, to, dur, lift = 0.8, rotTo = null) {
    const from = m.position.clone();
    const r0 = m.rotation.z, r1 = rotTo == null ? r0 : rotTo;
    stage.tween(dur, k => { m.position.lerpVectors(from, to, k); m.position.y += Math.sin(k * Math.PI) * lift; m.rotation.z = r0 + (r1 - r0) * k; }, { ease: EASE.inOutCubic });
  }

  // play the reveal steps the server has resolved since we last looked
  function runReveal() {
    const rv = st.reveal;
    if (!rv) return finishAnim();
    if (rv.id !== animId) {
      animId = rv.id; animCount = 0;
      model = rv.rowsBefore.map(r => r.slice());
      buildRows(model);
      buildReveal(rv.cards, false);
      busy = true;
      sfx.card(0.4);
      // flip them all
      for (const m of revealMeshes.values()) { const y = m.position.y; stage.tween(380, k => { m.rotation.z = Math.PI * (1 - k); m.position.y = y + Math.sin(k * Math.PI) * 0.5; }, { ease: EASE.inOutCubic }); }
      return setTimeout(stepPlays, 900);
    }
    stepPlays();
  }
  function stepPlays() {
    const rv = st.reveal;
    if (!rv || rv.id !== animId) return runReveal();
    if (animCount >= rv.plays.length) return finishAnim();
    busy = true;
    const p = rv.plays[animCount++];
    const card = revealMeshes.get(p.card);
    const row = model[p.row];
    let delay = 0;
    if (p.took.length) {
      // sweep the row to the taker
      const dest = p.seat === seat ? PILE.clone().setY(Y0 + 0.3) : new THREE.Vector3((p.seat - (st.n - 1) / 2) * 1.2, Y0 + 0.3, -7.5);
      rowMeshes[p.row].forEach((m, k) => setTimeout(() => fly(m, dest, 420, 0.9, Math.PI), k * 60));
      setTimeout(() => rowMeshes[p.row].forEach(m => rowsG.remove(m)), 520 + p.took.length * 60);
      sfx.whoosh(0.35);
      delay = 520 + p.took.length * 60;
      model[p.row] = [];
    }
    setTimeout(() => {
      const j = model[p.row].length;
      const target = slotPos(p.row, j);
      if (card) { revealG.remove(card); rowsG.add(card); fly(card, target, 480, 0.7); setTimeout(() => sfx.card(0.4), 460); }
      model[p.row].push(p.card);
      rowMeshes[p.row].push(card);
      if (p.took.length && p.seat === seat) flash(`🐮 ${p.took.reduce((a, c) => a + heads(c), 0)}마리를 먹었어요!`);
      setTimeout(stepPlays, 560);
    }, delay);
  }
  function finishAnim() {
    if (st.reveal && (st.reveal.id !== animId || animCount < st.reveal.plays.length)) return runReveal();
    busy = false;
    // waiting for someone to pick a row: keep the remaining cards on show
    if (st.phase === 'pickRow') { buildRows(st.rows); model = st.rows.map(r => r.slice()); paintRows(); return; }
    buildRows(st.rows); revealG.clear(); revealMeshes.clear();
    buildPile();
    if (queue.length) { queue = []; }
  }

  function paintRows() {
    const pickable = st && st.phase === 'pickRow' && st.picker === seat && !busy;
    rowHits.forEach((m, r) => { m.material.opacity = pickable ? (r === hoverRow ? 0.35 : 0.12) : 0; });
  }

  stage.onHover = pick => { const h = pick && pick.row != null ? pick.row : -1; if (h !== hoverRow) { hoverRow = h; paintRows(); } };
  stage.onPick = pick => {
    if (!pick || !st || st.over) return;
    if (pick.card != null) {
      if (st.phase !== 'choose') return ctx.toast('잠깐! 카드가 놓이는 중이에요.');
      if (st.myChoice === pick.card) return;
      sfx.card(0.3);
      ctx.send({ type: 'choose', card: pick.card });
      return;
    }
    if (pick.row != null) {
      if (!(st.phase === 'pickRow' && st.picker === seat)) return;
      if (busy) return;
      ctx.send({ type: 'pickRow', row: pick.row });
    }
  };

  const resign = btn('기권', 'ghost', () => { if (confirm('기권하면 남은 카드는 자동으로 내요. 할까요?')) ctx.send({ type: 'resign' }); });
  bar.append(resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1500); };

  ctx.root.__test = {
    screen: k => {
      const [kind, v] = k.split(':');
      if (kind === 'card') { const p = handCards.find(h => h.userData.pick.card === +v); if (!p) return null; const w = new THREE.Vector3(0, 0.02, -CH * 0.25); p.localToWorld(w); return stage.screenOf(w); }
      if (kind === 'row') return stage.screenOf(slotPos(+v, 2));
      return null;
    },
    state: () => st,
    busy: () => busy
  };

  let lastRevealKey = '';
  return {
    winDelay: 2600,
    render(state, mySeat) {
      st = state; seat = mySeat;
      buildHand();
      const key = st.reveal ? `${st.reveal.id}:${st.reveal.plays.length}` : '';
      if (!model) { model = st.rows.map(r => r.slice()); buildRows(st.rows); buildPile(); if (st.reveal) { animId = st.reveal.id; animCount = st.reveal.plays.length; } lastRevealKey = key; }
      else if (key !== lastRevealKey) { lastRevealKey = key; if (!busy) runReveal(); }
      else if (!busy) { buildPile(); }
      stage.setPickables([...handCards, ...rowHits]);
      paintRows();
      const picking = st.phase === 'pickRow';
      if (picking && st.picker === seat && !busy) flash('내 카드가 제일 작아요! 가져갈 줄을 고르세요.');
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `${st.target ? `${st.hand}번째 판 · ` : ''}${Math.min(10, st.round)}/10 라운드<br>
           ${picking ? `<b>${st.names[st.picker]}</b>이(가) 가져갈 줄을 고르는 중…<br>` : ''}
           <span class="muted">${seat < 0 ? '구경 중' : st.phase === 'choose' ? (st.myChoice != null ? `${st.myChoice}을(를) 골랐어요. 다른 사람을 기다리는 중 (바꿀 수 있어요)` : '낼 카드를 하나 클릭하세요. 모두 고르면 한꺼번에 공개!') : picking && st.picker === seat ? '<b>줄을 클릭해서 가져가세요 (소가 적은 줄 추천!)</b>' : '카드 놓는 중…'}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.picker === i ? 'turn' : ''} ${i === seat ? 'me' : ''} ${st.out[i] ? 'out' : ''}">${st.phase === 'choose' ? (st.chosen[i] ? '✔ ' : '… ') : ''}${nm} 🐮${st.scores[i] + st.takenHeads[i]}</span>`).join('');
      resign.disabled = st.over || seat < 0;
      fillLog(log, st.log);
      if (st.over && !won) { won = true; setTimeout(() => sfx.win(), 2200); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
