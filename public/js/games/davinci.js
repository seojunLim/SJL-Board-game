import { Stage, THREE, EASE, textSprite } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { davinciFaceTexture } from '../three3d/cards.js';
import { choose, btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Da Vinci Code: chunky black and white tiles standing in a row in front of
// each player (numbers towards their owner), knocked flat face-up when
// guessed, a face-down pool in the middle where you pick a colour to draw.

const TW = 0.74, TH = 1.08, TD = 0.3, GAP = 0.86;
const COLOR_KO = { b: '검정', w: '흰색' };

const bodyGeo = new RoundedBoxGeometry(TW, TH, TD, 4, 0.07);
const faceGeo = new THREE.PlaneGeometry(TW - 0.12, TH - 0.12);
const outlineGeo = new RoundedBoxGeometry(TW + 0.09, TH + 0.09, TD + 0.09, 3, 0.1);
const MAT = {
  b: new THREE.MeshPhysicalMaterial({ color: 0x1a1a1e, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.55 }),
  w: new THREE.MeshPhysicalMaterial({ color: 0xf0ede4, roughness: 0.36, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.55 })
};
const faceMats = {};
function faceMat(color, v) {
  const k = color + v;
  if (!faceMats[k]) faceMats[k] = new THREE.MeshPhysicalMaterial({ map: davinciFaceTexture(color, v), roughness: color === 'b' ? 0.32 : 0.36, clearcoat: 0.5, clearcoatRoughness: 0.22, envMapIntensity: 0.55 });
  return faceMats[k];
}
const selMat = new THREE.MeshBasicMaterial({ color: 0xffc04d, side: THREE.BackSide, toneMapped: false });
const hovMat = new THREE.MeshBasicMaterial({ color: 0x7fb8ff, side: THREE.BackSide, toneMapped: false, transparent: true, opacity: 0.8 });

function makeTile(t) {
  const g = new THREE.Group();
  g.rotation.order = 'YXZ';
  const body = new THREE.Mesh(bodyGeo, MAT[t.color]);
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  if (t.v != null) {
    const f = new THREE.Mesh(faceGeo, faceMat(t.color, t.v));
    f.position.z = TD / 2 + 0.002;
    g.add(f);
  }
  const ol = new THREE.Mesh(outlineGeo, selMat); ol.visible = false; g.add(ol);
  g.userData.outline = ol;
  return g;
}

// Longest-common-subsequence alignment of an old and new row of tiles.
function align(a, b, eq) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = eq(a[i], b[j]) ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Array(m).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j]) && dp[i][j] === 1 + dp[i + 1][j + 1]) { map[j] = i; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return map;
}
const sameTile = (x, y) => x.color === y.color && (x.v == null || y.v == null || x.v === y.v);

export default function davinci(ctx) {
  const holder = el('div', 'stageWrap');
  const panel = el('div', 'panelGuess');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, panel, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    camera: { radius: 12.5, phi: 0.78, minR: 7, maxR: 20, target: [0, 0.4, 0.8], maxPhi: 1.2 },
    mat: { w: 13, h: 11, r: 1.6, color: 0x1b2d52, sheen: 0x6f8fcf }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  let st = null, seat = -1, n = 0;
  let pick = null, hover = null;

  function frame(i) {
    const rel = seat >= 0 ? (i - seat + n) % n : i;
    const a = Math.PI / 2 + rel * (Math.PI * 2 / n);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const right = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(-1);
    return { dir, right, rotY: Math.PI / 2 - a, R: rel === 0 && seat >= 0 ? 3.2 : 3.5 };
  }
  // world transform for tile k of a row of `len`, optionally tipped (revealed)
  function slot(i, k, len, tip, extra = 0) {
    const f = frame(i);
    const off = (k - (len - 1) / 2) * GAP + extra;
    const p = f.dir.clone().multiplyScalar(f.R - tip * (TH / 2 - TD / 2 + 0.05)).add(f.right.clone().multiplyScalar(off));
    p.y = Y0 + TH / 2 * (1 - tip) + TD / 2 * tip;
    return { p, rotY: f.rotY, rotX: -Math.PI / 2 * tip };
  }
  function place(g, s) { g.position.copy(s.p); g.rotation.y = s.rotY; g.rotation.x = s.rotX; }

  const rows = [];          // per seat: [{ g, t, tip }]
  let drawnMesh = null, drawnSig = '';
  const poolGroup = new THREE.Group(); S.add(poolGroup);
  let poolSig = '';
  const tags = [];

  function syncRows() {
    for (let i = 0; i < n; i++) {
      const old = rows[i] || [];
      const hand = st.hands[i];
      const map = align(old.map(e => e.t), hand, sameTile);
      const used = new Set(map.filter(x => x >= 0));
      old.forEach((e, k) => { if (!used.has(k)) S.remove(e.g); });
      const next = hand.map((t, k) => {
        const oi = map[k];
        let e = oi >= 0 ? old[oi] : null;
        const tip = t.revealed ? 1 : 0;
        if (e && e.t.v == null && t.v != null) { S.remove(e.g); e = null; }   // value just became known: rebuild with a face
        const target = slot(i, k, hand.length, tip);
        if (!e) {
          const g = makeTile(t);
          const startTip = oi >= 0 ? old[oi].tip : tip;
          place(g, slot(i, k, hand.length, startTip));
          g.userData.pick = { seat: i, index: k };
          S.add(g);
          if (oi < 0 && old.length) {                    // newly added tile: drop in
            const y1 = g.position.y;
            stage.tween(320, u => { g.position.y = y1 + (1 - u) * 1.3; }, { ease: EASE.outBounce, done: () => sfx.tile(0.4) });
          }
          e = { g, t, tip: startTip };
          if (oi >= 0 && old[oi].tip !== tip) animateTip(e, i, k, hand.length, old[oi].tip, tip);
        } else {
          const from = { p: e.g.position.clone(), rotX: e.g.rotation.x };
          if (e.tip !== tip) animateTip(e, i, k, hand.length, e.tip, tip);
          else if (from.p.distanceTo(target.p) > 0.01) {
            const g = e.g;
            stage.tween(300, u => { g.position.lerpVectors(from.p, target.p, u); }, { ease: EASE.inOutCubic });
          }
          e.g.rotation.y = target.rotY;
        }
        e.t = t; e.tip = tip;
        e.g.userData.pick = { seat: i, index: k };
        return e;
      });
      rows[i] = next;
    }
  }
  function animateTip(e, i, k, len, t0, t1) {
    const g = e.g;
    stage.tween(520, u => { place(g, slot(i, k, len, t0 + (t1 - t0) * u)); }, { ease: EASE.outBounce, delay: 120, done: () => sfx.tile(0.6) });
  }

  function syncDrawn() {
    const d = st.drawn;
    const sig = d ? `${st.turn}:${d.color}:${d.v ?? '?'}` : '';
    if (sig === drawnSig) return;
    const had = !!drawnMesh;
    if (drawnMesh) { S.remove(drawnMesh); drawnMesh = null; }
    drawnSig = sig;
    if (!d) return;
    const tile = d.hidden ? { color: d.color } : { color: d.color, v: d.v };
    drawnMesh = makeTile(tile);
    const len = st.hands[st.turn].length;
    const s = slot(st.turn, len, len, 0, 0.55);
    place(drawnMesh, s);
    drawnMesh.userData.outline.visible = true;
    drawnMesh.userData.outline.material = selMat;
    S.add(drawnMesh);
    if (!had) {
      const g = drawnMesh, a = new THREE.Vector3(0, Y0 + 0.4, 0), b = s.p.clone();
      stage.tween(460, u => { g.position.lerpVectors(a, b, u); g.position.y += Math.sin(Math.PI * u) * 1.4; g.rotation.x = -Math.PI / 2 * (1 - u); },
        { ease: EASE.inOutCubic, done: () => sfx.tile(0.5) });
    }
  }

  function syncPool() {
    const pc = st.poolColors || { b: 0, w: 0 };
    const sig = pc.b + ',' + pc.w;
    if (sig === poolSig) return;
    poolSig = sig;
    poolGroup.clear();
    const list = [];
    for (let k = 0; k < pc.b; k++) list.push('b');
    for (let k = 0; k < pc.w; k++) list.push('w');
    let seed = 17;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // shuffle positions deterministically but keep colours spread out
    list.sort(() => rnd() - 0.5);
    const cols = 6, rowsN = Math.ceil(list.length / cols);
    list.forEach((c, k) => {
      const g = makeTile({ color: c });
      const col = k % cols, row = Math.floor(k / cols);
      const x = (col - (cols - 1) / 2) * 0.98 + (rnd() - 0.5) * 0.14 + (row % 2) * 0.2;
      const z = (row - (rowsN - 1) / 2) * 1.3 + (rnd() - 0.5) * 0.14 - 0.1;
      g.position.set(x, Y0 + TD / 2, z);
      g.rotation.set(Math.PI / 2, (rnd() - 0.5) * 0.35, 0, 'YXZ');
      g.userData.pick = { pool: c };
      poolGroup.add(g);
    });
  }

  function syncTags() {
    tags.forEach(t => S.remove(t)); tags.length = 0;
    for (let i = 0; i < n; i++) {
      if (i === seat) continue;
      const f = frame(i);
      const hidden = st.hands[i].filter(t => !t.revealed).length;
      const tag = textSprite(`${st.names[i]}${st.out[i] ? ' · 탈락' : ` · 비공개 ${hidden}`}`, { border: st.turn === i && !st.over ? '#ffc861' : null, scale: 0.0095 });
      tag.position.copy(f.dir.clone().multiplyScalar(f.R + 0.9).setY(Y0 + 1.75));
      S.add(tag); tags.push(tag);
    }
  }

  function highlight() {
    for (const row of rows) for (const e of row || []) e.g.userData.outline.visible = false;
    if (drawnMesh) drawnMesh.userData.outline.visible = true;
    const show = (p, mat) => {
      const e = p && rows[p.seat] && rows[p.seat][p.index];
      if (!e) return;
      e.g.userData.outline.material = mat; e.g.userData.outline.visible = true;
    };
    show(hover, hovMat);
    show(pick, selMat);
  }

  function canPickTarget(p) {
    if (!p || p.seat == null || !st || st.over || st.turn !== seat) return false;
    const t = st.hands[p.seat][p.index];
    if (!t || t.revealed) return false;
    if (st.phase === 'guess') return p.seat !== seat;
    if (st.phase === 'reveal-own') return p.seat === seat;
    return false;
  }

  stage.onHover = p => {
    const h = canPickTarget(p) ? p : (p && p.pool && st && st.phase === 'draw' && st.turn === seat ? null : null);
    if (JSON.stringify(h) !== JSON.stringify(hover)) { hover = h; highlight(); }
  };
  stage.onPick = p => {
    stage.finishTweens();
    if (!p || !st || st.over || st.turn !== seat) return;
    if (p.pool && st.phase === 'draw') return ctx.send({ type: 'draw', color: p.pool });
    if (!canPickTarget(p)) return;
    if (st.phase === 'reveal-own') return ctx.send({ type: 'reveal-own', index: p.index });
    pick = { seat: p.seat, index: p.index };
    highlight(); drawPanel();
  };

  async function askPlace() {
    if (!st.drawn || st.drawn.hidden || st.drawn.v !== 12) return -1;
    const len = st.hands[seat].length;
    const v = await choose('조커를 놓을 위치', Array.from({ length: len + 1 }, (_, i) => ({
      value: String(i), label: i === 0 ? '맨 왼쪽' : i === len ? '맨 오른쪽' : `${i}번째 뒤`, icon: '–'
    })));
    return v == null ? -1 : Number(v);
  }

  function drawPanel() {
    panel.innerHTML = '';
    const mine = st.turn === seat && !st.over;
    const note = t => panel.appendChild(el('div', 'muted', t));
    if (!mine) { note(st.over ? (st.result || '') : `${st.names[st.turn]}의 차례…`); return; }
    const pc = st.poolColors || { b: 0, w: 0 };
    if (st.phase === 'draw') {
      note('가운데 더미에서 가져올 색을 고르세요 (타일을 직접 클릭해도 됩니다).');
      const row = el('div', 'row'); row.style.justifyContent = 'center';
      row.append(
        btn(`⬛ 검정 뽑기 (${pc.b})`, 'primary', () => ctx.send({ type: 'draw', color: 'b' })),
        btn(`⬜ 흰색 뽑기 (${pc.w})`, 'primary', () => ctx.send({ type: 'draw', color: 'w' })));
      row.children[0].disabled = !pc.b; row.children[1].disabled = !pc.w;
      panel.appendChild(row);
    } else if (st.phase === 'guess') {
      const t = pick && st.hands[pick.seat] && st.hands[pick.seat][pick.index];
      if (!t || t.revealed || pick.seat === seat) { pick = null; note('상대의 비공개 타일을 클릭해 고르세요.'); return; }
      note(`${st.names[pick.seat]}의 ${pick.index + 1}번째 타일 (${COLOR_KO[t.color]}) — 숫자는?`);
      const grid = el('div', 'numGrid');
      for (let v = 0; v <= 11; v++) grid.appendChild(btn(String(v), '', () => guess(v)));
      grid.appendChild(btn('조커 –', '', () => guess('joker')));
      panel.appendChild(grid);
      async function guess(v) {
        const place = await askPlace();
        ctx.send({ type: 'guess', target: pick.seat, index: pick.index, color: t.color, value: v, place });
        pick = null; highlight();
      }
    } else if (st.phase === 'continue') {
      note('적중! 계속 추측하거나, 턴을 마치고 뽑은 타일을 비공개로 세우세요.');
      const row = el('div', 'row'); row.style.justifyContent = 'center';
      row.append(btn('계속 추측', 'primary', () => ctx.send({ type: 'continue' })),
        btn('턴 종료', '', async () => ctx.send({ type: 'stop', place: await askPlace() })));
      panel.appendChild(row);
    } else if (st.phase === 'reveal-own') {
      note('추측 실패 & 더미가 비었습니다 — 공개할 내 타일을 클릭하세요.');
    }
  }

  const hud = el('div', 'hud'); holder.appendChild(hud);
  const topB = btn('⬒ 위에서 보기', 'ghost', () => stage.setView(stage.view.phi > 0.3 ? { phi: 0.14 } : { phi: 0.78 }));
  bar.append(topB);

  let lastGuessKey = '';
  let orientedFor = null, won = false;
  ctx.root.__test = {
    screen: k => {
      const [kind, a, b] = k.split(':');
      if (kind === 'pool') { const g = poolGroup.children.find(x => x.userData.pick.pool === a); return g ? stage.screenOf(g.position.clone()) : null; }
      const e = rows[+a] && rows[+a][+b]; return e ? stage.screenOf(e.g.position.clone()) : null;
    }
  };
  return {
    render(state, mySeat) {
      stage.finishTweens();
      st = state; seat = mySeat; n = state.names.length;
      if (orientedFor !== seat) { orientedFor = seat; rows.forEach(r => (r || []).forEach(e => S.remove(e.g))); rows.length = 0; }
      syncRows(); syncDrawn(); syncPool(); syncTags();
      stage.setPickables([...rows.flatMap(r => (r || []).map(e => e.g)), ...poolGroup.children]);
      if (pick && !canPickTarget(pick)) pick = null;
      highlight(); drawPanel();
      const lg = state.lastGuess;
      const key = lg ? JSON.stringify(lg) + state.log.length : '';
      if (lg && key !== lastGuessKey && lastGuessKey) (lg.correct ? sfx.tile(0.7) : sfx.buzz());
      lastGuessKey = key || lastGuessKey || 'x';
      ctx.status.innerHTML = state.over
        ? `<b>게임 종료</b><br>${state.result}`
        : `차례: <b>${state.names[state.turn]}</b><br>더미: 검정 ${state.poolColors.b} · 흰색 ${state.poolColors.w}<br>
           <span class="muted">같은 숫자는 검정이 왼쪽. 조커(–)는 어디든.</span>`;
      hud.innerHTML = state.names.map((nm, i) => `<span class="chip ${state.turn === i && !state.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${state.out[i] ? 'out' : ''}">${nm} ${state.hands[i].filter(t => !t.revealed).length}</span>`).join('');
      fillLog(log, state.log);
      if (state.over && !won) { won = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
