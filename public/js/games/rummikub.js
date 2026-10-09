import { Stage, THREE, EASE, MOBILE, textSprite } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture, roundRect } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Rummikub: cream tiles with printed numbers lying in sets on a felt table,
// your tiles standing on a wooden rack. During your turn you edit a draft of
// the whole table (select a tile, then click a green slot or the "new set"
// area), the client checks every set live, and "확정" sends it.

const TW = 0.6, TL = 0.82, TD = 0.16;
const PITCH = TW + 0.05, SET_GAP = 0.55, ROW_GAP = TL + 0.32, TABLE_W = 12.2;
const INK = { r: '#d0262b', b: '#1d5cc4', y: '#e08a00', k: '#1b1b1d' };
const COLORS = ['r', 'b', 'y', 'k'];
const COLOR_KO = { r: '빨강', b: '파랑', y: '노랑', k: '검정' };

function faceTex(t) {
  const key = t.joker ? 'rk-joker' : `rk-${t.color}${t.n}`;
  return paintedTexture(key, 256, 352, (g, W, H) => {
    g.fillStyle = '#f7f1e3'; g.fillRect(0, 0, W, H);
    if (t.joker) {
      g.lineWidth = 12; g.strokeStyle = '#d0262b';
      g.beginPath(); g.arc(W / 2, H * 0.45, 70, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#1b1b1d'; g.beginPath(); g.arc(W / 2 - 26, H * 0.4, 10, 0, Math.PI * 2); g.arc(W / 2 + 26, H * 0.4, 10, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1d5cc4'; g.lineWidth = 9; g.beginPath(); g.arc(W / 2, H * 0.46, 40, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#e08a00'; g.font = '900 34px Arial'; g.textAlign = 'center'; g.fillText('JOKER', W / 2, H * 0.86);
      return;
    }
    g.fillStyle = INK[t.color]; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${t.n >= 10 ? 150 : 170}px "Arial Black", Arial, sans-serif`;
    g.fillText(String(t.n), W / 2, H * 0.44);
    g.beginPath(); g.arc(W / 2, H * 0.82, 18, 0, Math.PI * 2); g.fill();
  });
}
const backTex = () => paintedTexture('rk-back', 128, 176, (g, W, H) => {
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 6; roundRect(g, 12, 12, W - 24, H - 24, 14); g.stroke();
});

// Same rules as the server: group or run (jokers fill gaps), returns points.
function analyseSet(ids, T) {
  if (ids.length < 3) return { ok: false };
  const tiles = ids.map(id => T[id]);
  const jokers = tiles.filter(t => t.joker), real = tiles.filter(t => !t.joker);
  if (!real.length) return { ok: false };
  if (ids.length <= 4 && real.every(t => t.n === real[0].n) && new Set(real.map(t => t.color)).size === real.length) return { ok: true, points: real[0].n * ids.length };
  if (ids.length <= 13 && real.every(t => t.color === real[0].color)) {
    const nums = real.map(t => t.n).sort((a, b) => a - b);
    if (new Set(nums).size !== nums.length) return { ok: false };
    const gaps = nums[nums.length - 1] - nums[0] + 1 - nums.length;
    if (gaps > jokers.length) return { ok: false };
    let extra = jokers.length - gaps, lo = nums[0], hi = nums[nums.length - 1];
    while (extra > 0 && hi < 13) { hi++; extra--; }
    while (extra > 0 && lo > 1) { lo--; extra--; }
    if (extra > 0) return { ok: false };
    let p = 0; for (let v = lo; v <= hi; v++) p += v;
    return { ok: true, points: p };
  }
  return { ok: false };
}

export default function rummikub(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 19.5, phi: 0.6, minR: 9, maxR: 28, target: [0, 0, 1.0], maxPhi: 1.2 },
    mat: { w: 15.5, h: 13, r: 1.4, color: 0x1f5b3f, sheen: 0x6fbf8f }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  const tileGeo = new RoundedBoxGeometry(TW, TL, TD, 3, 0.05);
  const faceGeo = new THREE.PlaneGeometry(TW - 0.08, TL - 0.08);
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf0e7d2, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 });
  const faceMats = {};
  const faceMat = t => { const k = t.joker ? 'J' : t.color + t.n; return faceMats[k] || (faceMats[k] = new THREE.MeshPhysicalMaterial({ map: faceTex(t), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.5 })); };
  const backMat = new THREE.MeshPhysicalMaterial({ map: backTex(), roughness: 0.4, clearcoat: 0.5 });
  const outlineGeo = new RoundedBoxGeometry(TW + 0.08, TL + 0.08, TD + 0.08, 2, 0.07);
  const selMat = new THREE.MeshBasicMaterial({ color: 0xffc861, side: THREE.BackSide, toneMapped: false });
  const newMat = new THREE.MeshBasicMaterial({ color: 0x8cf0a6, side: THREE.BackSide, toneMapped: false });

  function makeTile(t) {
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';
    const body = new THREE.Mesh(tileGeo, bodyMat); body.castShadow = body.receiveShadow = true;
    const face = new THREE.Mesh(faceGeo, faceMat(t)); face.position.z = TD / 2 + 0.002;
    const ol = new THREE.Mesh(outlineGeo, selMat); ol.visible = false;
    g.add(body, face, ol);
    g.userData.outline = ol;
    return g;
  }

  // ------------------------------------------------------------ rack
  const rackWood = new THREE.MeshPhysicalMaterial({ color: 0x7a4a26, roughness: 0.45, clearcoat: 0.5 });
  const rack = new THREE.Group();
  const rb = new THREE.Mesh(new RoundedBoxGeometry(11.2, 0.25, 1.9, 3, 0.08), rackWood); rb.position.set(0, 0.12, 0); rb.castShadow = rb.receiveShadow = true;
  const lip1 = new THREE.Mesh(new RoundedBoxGeometry(11.2, 0.22, 0.12, 2, 0.04), rackWood); lip1.position.set(0, 0.3, 0.86);
  const back = new THREE.Mesh(new RoundedBoxGeometry(11.2, 0.9, 0.18, 2, 0.06), rackWood); back.position.set(0, 0.55, -0.88); back.rotation.x = -0.18;
  rack.add(rb, lip1, back);
  rack.position.set(0, Y0, 5.7);
  S.add(rack);
  const rackZone = new THREE.Mesh(new THREE.BoxGeometry(11.2, 1.2, 2.2), new THREE.MeshBasicMaterial({ visible: false }));
  rackZone.position.set(0, Y0 + 0.6, 5.7); rackZone.userData.pick = { rack: true }; S.add(rackZone);

  // ------------------------------------------------------------ state
  let st = null, seat = -1, T = null;
  let draft = null, draftRack = null, origin = null, sel = null, editing = false;
  const meshes = new Map();                         // tile id -> group (table + my rack)
  const others = new THREE.Group(); S.add(others);
  const slots = new THREE.Group(); S.add(slots);
  const marks = new THREE.Group(); S.add(marks);
  const slotGeo = new THREE.BoxGeometry(0.12, 0.05, TL);
  const slotMat = new THREE.MeshBasicMaterial({ color: 0x8cf0a6, transparent: true, opacity: 0.85, toneMapped: false });
  const newSetMat = new THREE.MeshBasicMaterial({ color: 0x8cf0a6, transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false });
  const badMat = new THREE.MeshBasicMaterial({ color: 0xff5a5a, toneMapped: false });
  const okMat = new THREE.MeshBasicMaterial({ color: 0x5ad37f, toneMapped: false });
  let newSetSpot = null;

  // Lay table sets out in rows (left to right, wrapping) and return positions.
  function tableLayout(sets) {
    const pos = new Map(), setInfo = [];
    let x = -TABLE_W / 2, z = -3.4;
    sets.forEach((set, si) => {
      const w = set.length * PITCH;
      if (x + w > TABLE_W / 2 && x > -TABLE_W / 2) { x = -TABLE_W / 2; z += ROW_GAP; }
      set.forEach((id, k) => pos.set(id, new THREE.Vector3(x + k * PITCH + TW / 2, Y0 + TD / 2, z)));
      setInfo.push({ si, x0: x, z, len: set.length });
      x += w + SET_GAP;
    });
    if (x + 3 * PITCH > TABLE_W / 2) { x = -TABLE_W / 2; z += ROW_GAP; }
    return { pos, setInfo, next: { x, z } };
  }
  function rackLayout(ids) {
    const pos = new Map();
    const perRow = Math.max(16, Math.ceil(ids.length / 2));
    ids.forEach((id, i) => {
      const row = Math.floor(i / perRow), k = i % perRow;
      const count = Math.min(perRow, ids.length - row * perRow);
      pos.set(id, new THREE.Vector3((k - (count - 1) / 2) * PITCH, Y0 + 0.25 + TL / 2 * 0.95 + row * 0.08, 5.95 - row * 0.62));
    });
    return pos;
  }

  function place(g, p, onTable, animate) {
    const rx = onTable ? -Math.PI / 2 : -0.32;
    if (!animate || g.position.lengthSq() === 0) { g.position.copy(p); g.rotation.x = rx; return; }
    const a = g.position.clone(), r0 = g.rotation.x;
    if (a.distanceTo(p) < 0.001 && Math.abs(r0 - rx) < 0.001) return;
    stage.tween(260, k => { g.position.lerpVectors(a, p, k); g.position.y += Math.sin(Math.PI * k) * 0.5; g.rotation.x = r0 + (rx - r0) * k; }, { ease: EASE.inOutCubic });
  }

  function layout(animate) {
    const tableSets = editing ? draft : st.table;
    const rackIds = editing ? draftRack : (seat >= 0 ? sortRack(st.rack) : []);
    const tl = tableLayout(tableSets);
    const rl = rackLayout(rackIds);
    const want = new Set([...tl.pos.keys(), ...rl.keys()]);
    for (const [id, g] of meshes) if (!want.has(id)) { S.remove(g); meshes.delete(id); }
    for (const id of want) {
      let g = meshes.get(id);
      if (!g) { g = makeTile(T[id]); g.userData.pick = { tile: id }; S.add(g); meshes.set(id, g); }
      const onTable = tl.pos.has(id);
      place(g, onTable ? tl.pos.get(id) : rl.get(id), onTable, animate);
      g.userData.pick = { tile: id };
      const isNew = editing ? origin.has(id) && onTable : (st.lastPlayed || []).includes(id);
      g.userData.outline.visible = (sel && sel.id === id) || isNew;
      g.userData.outline.material = sel && sel.id === id ? selMat : newMat;
    }

    // set validity bars + slots for the selected tile
    marks.clear(); slots.clear(); newSetSpot = null;
    if (editing) {
      tl.setInfo.forEach(info => {
        const a = analyseSet(tableSets[info.si], T);
        const barM = new THREE.Mesh(new THREE.BoxGeometry(info.len * PITCH - 0.05, 0.02, 0.06), a.ok ? okMat : badMat);
        barM.position.set(info.x0 + info.len * PITCH / 2 - 0.025, Y0 + 0.012, info.z + TL / 2 + 0.1);
        marks.add(barM);
      });
    }
    if (editing && sel) {
      tl.setInfo.forEach(info => {
        for (let k = 0; k <= info.len; k++) {
          const s = new THREE.Mesh(slotGeo, slotMat);
          s.position.set(info.x0 + k * PITCH - 0.025, Y0 + 0.03, info.z);
          s.userData.pick = { slot: info.si, index: k };
          slots.add(s);
        }
      });
      const zone = new THREE.Mesh(new THREE.BoxGeometry(3 * PITCH, 0.03, TL), newSetMat);
      zone.position.set(tl.next.x + 1.5 * PITCH, Y0 + 0.02, tl.next.z);
      zone.userData.pick = { newSet: true };
      slots.add(zone);
      newSetSpot = zone.position.clone();
      const tag = textSprite('＋ 새 세트', { scale: 0.006 }); tag.position.copy(zone.position).add(new THREE.Vector3(0, 0.3, 0)); slots.add(tag);
    }
    // the rack drop-zone would shadow the rack tiles, so it is only live while a tile is selected
    stage.setPickables([...meshes.values(), ...slots.children.filter(x => x.isMesh), ...(sel ? [rackZone] : [])]);
  }

  function buildOthers() {
    others.clear();
    const n = st.n;
    for (let i = 0; i < n; i++) {
      if (i === seat) continue;
      const rel = seat >= 0 ? (i - seat + n) % n : i;
      const a = Math.PI / 2 + rel * (Math.PI * 2 / n);
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const g = new THREE.Group();
      g.position.copy(d.clone().multiplyScalar(7.4)).setY(Y0);
      g.rotation.y = Math.atan2(d.x, d.z);
      const r = new THREE.Mesh(new RoundedBoxGeometry(6, 0.2, 1.1, 2, 0.06), rackWood); r.position.y = 0.1; r.castShadow = true; g.add(r);
      const cnt = Math.min(st.rackCounts[i], 18);
      for (let k = 0; k < cnt; k++) {
        const m = new THREE.Mesh(tileGeo, backMat); m.castShadow = true;
        m.position.set((k - (cnt - 1) / 2) * 0.32, 0.2 + TL / 2 * 0.9, 0.1); m.rotation.x = 0.3; m.scale.setScalar(0.9);
        g.add(m);
      }
      const tag = textSprite(`${st.names[i]} · ${st.rackCounts[i]}장${st.melded[i] ? '' : ' · 등록 전'}`, { scale: 0.0095, border: st.turn === i && !st.over ? '#ffc861' : null });
      tag.position.set(0, 1.2, 0.6); g.add(tag);
      others.add(g);
    }
    // the face-down pool
    const pool = new THREE.Group();
    const pc = Math.min(st.poolCount, 40);
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < pc; k++) {
      const m = new THREE.Mesh(tileGeo, backMat);
      m.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 0.1, rnd() * 6, 0, 'YXZ');
      m.position.set(6.6 + (rnd() - 0.5) * 1.6, Y0 + TD / 2 + Math.floor(k / 12) * TD, 2.4 + (rnd() - 0.5) * 2.2);
      m.castShadow = true; pool.add(m);
    }
    const tag = textSprite(`더미 ${st.poolCount}`, { scale: 0.009 }); tag.position.set(6.6, Y0 + 1.1, 2.4); pool.add(tag);
    others.add(pool);
  }

  let sortMode = 'num';
  function sortRack(ids) {
    const key = id => { const t = T[id]; if (t.joker) return 999; return sortMode === 'num' ? t.n * 10 + COLORS.indexOf(t.color) : COLORS.indexOf(t.color) * 100 + t.n; };
    return ids.slice().sort((a, b) => key(a) - key(b));
  }

  function startEditing() {
    editing = true;
    draft = st.table.map(s => s.slice());
    draftRack = sortRack(st.rack);
    origin = new Set();
    sel = null;
  }
  function moveSel(target) {
    const id = sel.id;
    // remove from wherever it is
    draftRack = draftRack.filter(x => x !== id);
    draft = draft.map(s => s.filter(x => x !== id));
    if (target.rack) { draftRack = sortRack(draftRack.concat(id)); origin.delete(id); }
    else {
      if (target.newSet) draft.push([id]);
      else {
        const set = draft[target.slot];
        // indices shift if the tile came from earlier in the same set
        set.splice(Math.min(target.index, set.length), 0, id);
      }
      if (st.rack.includes(id)) origin.add(id);
    }
    draft = draft.filter(s => s.length);
    sel = null;
    sfx.tile(0.4);
    layout(true);
    updateUI();
  }

  stage.onPick = pick => {
    stage.finishTweens();
    if (!pick || !st || !editing) return;
    if (pick.tile != null) {
      if (sel && sel.id === pick.tile) { sel = null; layout(false); return; }
      sel = { id: pick.tile }; sfx.tile(0.2); layout(false); return;
    }
    if (!sel) return;
    if (pick.slot != null) {
      // slot indices were computed with the selected tile still in place
      const set = draft[pick.slot];
      let idx = pick.index;
      const cur = set.indexOf(sel.id);
      if (cur >= 0 && cur < idx) idx--;
      return moveSel({ slot: pick.slot, index: idx });
    }
    if (pick.newSet) return moveSel({ newSet: true });
    if (pick.rack) {
      if (!st.rack.includes(sel.id)) { ctx.toast('테이블에 있던 타일은 랙으로 가져올 수 없어요.'); return; }
      return moveSel({ rack: true });
    }
  };

  // ------------------------------------------------------------ controls
  const commitB = btn('✅ 확정', 'primary', () => ctx.send({ type: 'play', table: draft }));
  const undoB = btn('↩ 되돌리기', '', () => { startEditing(); layout(true); updateUI(); });
  const drawB = btn('🀫 1장 가져오기', '', () => ctx.send({ type: 'draw' }));
  const sortB = btn('정렬: 숫자', 'ghost', () => {
    sortMode = sortMode === 'num' ? 'color' : 'num'; sortB.textContent = sortMode === 'num' ? '정렬: 숫자' : '정렬: 색';
    if (editing) draftRack = sortRack(draftRack); layout(true);
  });
  bar.append(commitB, undoB, drawB, sortB);
  const hud = el('div', 'hud'); holder.appendChild(hud);

  function updateUI() {
    const my = seat >= 0 && st.turn === seat && !st.over;
    const changed = editing && origin.size > 0;
    const allOk = editing && draft.every(s => analyseSet(s, T).ok);
    commitB.disabled = !my || !changed || !allOk;
    undoB.disabled = !my || !editing;
    drawB.disabled = !my || changed;
    let meldInfo = '';
    if (editing && !st.melded[seat]) {
      const fresh = draft.filter(s => s.every(id => origin.has(id)));
      const pts = fresh.reduce((a, s) => a + (analyseSet(s, T).points || 0), 0);
      meldInfo = `<br>첫 등록 점수: <b>${pts}</b> / 30`;
    }
    ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${st.names[st.turn]}</b><br>내 타일 ${seat >= 0 ? st.rack.length : '-'}장 · 더미 ${st.poolCount}장${meldInfo}<br>
         <span class="muted">${my ? (sel ? '초록 칸이나 "새 세트" 자리를 눌러 옮기세요.' : '타일을 눌러 고르세요. 다 놓았으면 확정!') : '상대 차례…'}${editing && !allOk ? ' · <span style="color:#ff7a6a">빨간 줄 세트를 고쳐야 해요</span>' : ''}</span>`;
  }

  let won = false;
  ctx.root.__test = {
    screen: k => {
      const [kind, rest] = k.split(':');
      if (kind === 'tile') { const g = meshes.get(Number(rest)); return g ? stage.screenOf(g.position.clone()) : null; }
      if (kind === 'newset') return newSetSpot ? stage.screenOf(newSetSpot) : null;
      if (kind === 'slot') { const [si, ix] = rest.split(',').map(Number); const m = slots.children.find(x => x.userData.pick && x.userData.pick.slot === si && x.userData.pick.index === ix); return m ? stage.screenOf(m.position.clone()) : null; }
      return null;
    },
    rack: () => (editing ? draftRack : st.rack).slice()
  };
  return {
    render(state, mySeat) {
      stage.finishTweens();
      const prevTurn = st ? st.turn : null;
      st = state; seat = mySeat; T = state.tiles;
      const my = seat >= 0 && st.turn === seat && !st.over;
      if (my && (!editing || prevTurn !== st.turn)) startEditing();
      if (!my) { editing = false; sel = null; }
      buildOthers();
      layout(prevTurn != null);
      updateUI();
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''}">${nm} ${st.rackCounts[i]}장${st.melded[i] ? ' ✓' : ''}</span>`).join('') + `<span class="chip">🀫 ${st.poolCount}</span>`;
      fillLog(log, st.log);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
