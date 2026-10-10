import { Stage, THREE, EASE, MOBILE, textSprite } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture, roundRect } from '../three3d/textures.js';
import { dieMesh, throwDice, topQuat } from '../three3d/dice.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// 부루마블: a square world-tour board with 40 printed tiles, pawns that hop
// tile by tile, villas/buildings/hotels in the owner's colour, golden-key
// cards and a pair of dice thrown in the middle.

const T = 1.1;                         // tile size
const BOARD = T * 11;
const TH = 0.16;                       // board thickness
const PLAYER_COLORS = [0xe0402f, 0x2f7de0, 0xf2c230, 0x3ab25a];
const GROUP_COLORS = ['#7fd6c2', '#77b8f0', '#f29ac2', '#f4a259', '#e35d5d', '#f2d14b', '#5fbf6a', '#5167d6'];
const EMOJI = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';
const ICON = { start: '🏁', key: '🔑', island: '🏝️', fund: '💰', payfund: '🏦', space: '🚀' };
const SPECIAL_ICON = { '제주도': '🌋', '콩코드 여객기': '✈️', '부산': '⚓', '퀸엘리자베스호': '🛳️', '컬럼비아호': '🚀', '서울': '🏙️' };

// tile index -> grid cell (row, col) on an 11x11 ring, 0 at bottom-right
function cellOf(i) {
  if (i <= 10) return [10, 10 - i];
  if (i <= 20) return [20 - i, 0];
  if (i <= 30) return [0, i - 20];
  return [i - 30, 10];
}
const sideOf = i => (i < 10 ? 0 : i < 20 ? 1 : i < 30 ? 2 : 3);
function tilePos(i, y = 0) { const [r, c] = cellOf(i); return new THREE.Vector3((c - 5) * T, y, (r - 5) * T); }
// unit vector pointing toward the board centre from a tile
function inward(i) { return [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0)][sideOf(i)]; }

function tileTex(sp, i) {
  return paintedTexture('mb-tile-' + i, 256, 256, (g, W) => {
    const corner = i % 10 === 0;
    g.fillStyle = corner ? '#fdf3d6' : '#fbf7ee'; g.fillRect(0, 0, W, W);
    g.strokeStyle = '#3a2a18'; g.lineWidth = 5; g.strokeRect(2, 2, W - 4, W - 4);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (sp.t === 'city') {
      g.fillStyle = GROUP_COLORS[sp.g]; g.fillRect(4, 4, W - 8, 62);
      g.strokeStyle = '#3a2a18'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 66); g.lineTo(W, 66); g.stroke();
    }
    const icon = ICON[sp.t] || SPECIAL_ICON[sp.name];
    if (icon) { g.font = `${corner ? 96 : 70}px ${EMOJI}`; g.fillText(icon, W / 2, corner ? 100 : 104); }
    g.fillStyle = '#2a1d10';
    const nm = sp.name;
    const fs = nm.length > 6 ? 26 : nm.length > 4 ? 32 : 40;
    g.font = `800 ${fs}px "Noto Sans KR",sans-serif`;
    g.fillText(nm, W / 2, sp.t === 'city' ? 120 : corner ? 190 : 170);
    if (sp.price) { g.font = '700 30px "Noto Sans KR",sans-serif'; g.fillStyle = '#7a5a2a'; g.fillText(`${sp.price}만`, W / 2, sp.t === 'city' ? 190 : 214); }
  });
}
function centerTex() {
  return paintedTexture('mb-center', 1024, 1024, (g, W) => {
    const grd = g.createRadialGradient(W / 2, W / 2, 50, W / 2, W / 2, W * 0.7);
    grd.addColorStop(0, '#3f8fd6'); grd.addColorStop(1, '#16457e');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
    // stylised continents
    g.fillStyle = 'rgba(120,200,120,.35)';
    const blobs = [[300, 330, 160, 110], [520, 300, 120, 90], [640, 420, 190, 120], [420, 560, 110, 160], [760, 650, 120, 80], [260, 640, 90, 120]];
    for (const [x, y, rx, ry] of blobs) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3;
    for (let k = 1; k < 8; k++) { g.beginPath(); g.ellipse(W / 2, W / 2, W * 0.45, W * 0.45 * Math.abs(Math.cos(k * Math.PI / 8)), 0, 0, Math.PI * 2); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#fff'; g.strokeStyle = '#0d2a4f'; g.lineWidth = 14;
    g.font = '900 130px "Noto Sans KR",sans-serif';
    g.strokeText('부루마블', W / 2, W * 0.33); g.fillText('부루마블', W / 2, W * 0.33);
    g.font = '700 46px "Noto Sans KR",sans-serif'; g.fillStyle = '#ffe9a8';
    g.fillText('세계 여행 보드게임', W / 2, W * 0.42);
  });
}
function keyCardTex() {
  return paintedTexture('mb-key', 256, 360, (g, W, H) => {
    g.fillStyle = '#fff6d8'; roundRect(g, 0, 0, W, H, 20); g.fill();
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#f6cf4a'); grd.addColorStop(1, '#c48a12');
    g.fillStyle = grd; roundRect(g, 12, 12, W - 24, H - 24, 14); g.fill();
    g.font = `120px ${EMOJI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🔑', W / 2, H / 2 - 20);
    g.fillStyle = '#5a3a00'; g.font = '900 40px "Noto Sans KR",sans-serif'; g.fillText('황금열쇠', W / 2, H - 60);
  });
}

function pawn(color) {
  const pts = [[0, 0], [0.24, 0], [0.24, 0.05], [0.16, 0.1], [0.1, 0.32], [0.14, 0.38], [0.08, 0.44], [0.13, 0.52], [0.13, 0.6], [0.07, 0.68], [0, 0.7]].map(([x, y]) => new THREE.Vector2(x, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 32), new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }));
  m.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), m.material); head.position.y = 0.66; head.castShadow = true;
  const g = new THREE.Group(); g.add(m, head); return g;
}
function building(level, color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  if (level === 1) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.22), mat); b.position.y = 0.1;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 4), white); roof.position.y = 0.28; roof.rotation.y = Math.PI / 4;
    g.add(b, roof);
  } else if (level === 2) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.5, 0.24, 2, 0.03), mat); b.position.y = 0.25;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.04, 0.27), white); cap.position.y = 0.51;
    g.add(b, cap);
  } else {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.74, 0.28, 2, 0.03), mat); b.position.y = 0.37;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd34a, emissive: 0xffb000, emissiveIntensity: 0.4 })); sign.position.y = 0.78;
    g.add(b, sign);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default function marble(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, {
    aspect: 0.86,
    camera: { radius: 18.5, phi: 0.6, minR: 8, maxR: 28, target: [0, 0, 0.6], maxPhi: 1.2 }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;
  const TOP = Y0 + TH;

  // ------------------------------------------------------------ board
  const base = new THREE.Mesh(new RoundedBoxGeometry(BOARD + 0.3, TH, BOARD + 0.3, 3, 0.06), new THREE.MeshPhysicalMaterial({ color: 0x1d3f66, roughness: 0.5, clearcoat: 0.4 }));
  base.position.y = Y0 + TH / 2; base.receiveShadow = base.castShadow = true; S.add(base);
  const center = new THREE.Mesh(new THREE.PlaneGeometry(T * 9, T * 9).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: centerTex(), roughness: 0.55, clearcoat: 0.3 }));
  center.position.y = TOP + 0.002; center.receiveShadow = true; S.add(center);
  let spaces = null;
  const tiles = [];
  function buildTiles() {
    spaces.forEach((sp, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.985, T * 0.985).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ map: tileTex(sp, i), roughness: 0.6, clearcoat: 0.2 }));
      m.position.copy(tilePos(i, TOP + 0.003));
      m.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][sideOf(i)];
      m.receiveShadow = true; m.userData.pick = { tile: i };
      S.add(m); tiles.push(m);
    });
  }
  const keyDeck = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.18, 1.4, 2, 0.04), [0, 0, 0, 0, 0, 0].map((_, k) => k === 2 ? new THREE.MeshPhysicalMaterial({ map: keyCardTex(), roughness: 0.4, clearcoat: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xf2e6c4 })));
  keyDeck.position.set(-2.4, TOP + 0.09, 1.4); keyDeck.rotation.y = 0.2; keyDeck.castShadow = true; S.add(keyDeck);
  const fundTag = textSprite('💰 기금 0만', { scale: 0.0065 }); fundTag.position.set(2.4, TOP + 0.5, 1.6); S.add(fundTag);

  const dice = [dieMesh(0.6), dieMesh(0.6)];
  dice.forEach((d, i) => { d.position.set(-0.4 + i * 0.8, TOP + 0.3, 1.8); S.add(d); });
  const ownG = new THREE.Group(); S.add(ownG);
  let pawns = [];

  let st = null, seat = -1, prevSeq = -1, busy = false, won = false, chain = Promise.resolve();
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;
  const me = () => (seat >= 0 ? st.players[seat] : null);

  function pawnSpot(i, s) {
    const off = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]][s];
    return tilePos(i, TOP).add(new THREE.Vector3(off[0], 0, off[1]));
  }
  function buildOwners() {
    ownG.clear();
    for (let i = 0; i < 40; i++) {
      const o = st.owner[i]; if (o < 0) continue;
      const inw = inward(i);
      const p = tilePos(i, TOP).addScaledVector(inw, -T * 0.36);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(T * 0.9, 0.03, T * 0.12), new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[o], emissive: PLAYER_COLORS[o], emissiveIntensity: 0.25 }));
      flag.position.copy(p).setY(TOP + 0.02); flag.rotation.y = sideOf(i) % 2 ? Math.PI / 2 : 0; ownG.add(flag);
      const lvl = st.level[i];
      for (let l = 1; l <= lvl; l++) {
        const b = building(l, PLAYER_COLORS[o]);
        const side = new THREE.Vector3(inw.z, 0, -inw.x);
        b.position.copy(tilePos(i, TOP)).addScaledVector(inw, T * 0.18).addScaledVector(side, (l - 2) * 0.3);
        ownG.add(b);
      }
    }
  }
  function placePawns() {
    st.players.forEach((p, s) => { pawns[s].visible = !p.out; pawns[s].position.copy(pawnSpot(p.pos, s)); });
  }

  // ------------------------------------------------------------ event playback
  const keyPop = el('div', 'keyPop hidden'); holder.appendChild(keyPop);
  function showKey(text) { keyPop.innerHTML = `<div class="kpT">🔑 황금열쇠</div><div>${text}</div>`; keyPop.classList.remove('hidden'); setTimeout(() => keyPop.classList.add('hidden'), 2200); }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function play(events) {
    busy = true; updateUi();
    for (const e of events) {
      if (e.type === 'roll') {
        const dur = throwDice(stage, dice, e.dice, [new THREE.Vector3(-0.45, 0, 0.9), new THREE.Vector3(0.45, 0, 1.2)], { from: new THREE.Vector3(0, TOP + 2.5, 4), floorY: TOP });
        await wait(dur + 100);
        if (e.dice[0] === e.dice[1]) flash('🎲 더블!');
      } else if (e.type === 'move') {
        const pw = pawns[e.seat];
        if (e.how === 'walk') {
          let i = e.from;
          while (i !== e.to) {
            i = (i + 1) % 40;
            const a = pw.position.clone(), b = pawnSpot(i, e.seat);
            await new Promise(r => stage.tween(150, k => { pw.position.lerpVectors(a, b, k); pw.position.y += Math.sin(k * Math.PI) * 0.35; }, { ease: EASE.inOutCubic, done: () => { sfx.knock(0.2); r(); } }));
          }
        } else {
          const a = pw.position.clone(), b = pawnSpot(e.to, e.seat);
          if (e.how === 'fly') sfx.whoosh(0.5);
          await new Promise(r => stage.tween(e.how === 'back' ? 450 : 800, k => { pw.position.lerpVectors(a, b, k); pw.position.y += Math.sin(k * Math.PI) * (e.how === 'back' ? 0.4 : 2.4); pw.rotation.y = k * Math.PI * 2; }, { ease: EASE.inOutCubic, done: () => { pw.rotation.y = 0; sfx.knock(0.35); r(); } }));
        }
      } else if (e.type === 'key') { sfx.card(0.5); showKey(e.text); await wait(1600); }
      else if (e.type === 'salary') { flash(`${st.names[e.seat]}: 월급 +20만!`); sfx.bell(0.2); await wait(300); }
      else if (e.type === 'pay' && e.amount) { sfx.disc(0.35); if (e.to >= 0) flash(`💸 ${st.names[e.from]} → ${st.names[e.to]} ${e.amount}만`); await wait(500); }
      else if (e.type === 'fund') { flash(`💰 ${st.names[e.seat]}: 사회복지기금 ${e.amount}만!`); sfx.bell(0.35); await wait(500); }
      else if (e.type === 'buy' || e.type === 'build') { sfx.tile(0.5); }
      else if (e.type === 'bankrupt') { flash(`💸 ${st.names[e.seat]} 파산!`); sfx.buzz(0.3); await wait(600); }
    }
    busy = false;
    sync();
  }
  function sync() {
    buildOwners(); placePawns();
    dice.forEach((d, i) => d.quaternion.copy(topQuat(st.dice[i], i * 0.3)));
    fundTag.material.map.dispose();
    const t = textSprite(`💰 기금 ${st.fund}만`, { scale: 0.0065 }); fundTag.material = t.material; fundTag.scale.copy(t.scale);
    updateUi();
  }

  // ------------------------------------------------------------ input
  stage.onPick = pick => {
    if (!pick || pick.tile == null || !st) return;
    const p = me();
    if (myTurn() && p.fly && st.phase === 'roll' && !busy) {
      if (pick.tile === 30) return ctx.toast('우주여행 칸 말고 다른 곳을 고르세요.');
      ctx.send({ type: 'fly', to: pick.tile });
      return;
    }
    const sp = st.spaces[pick.tile];
    const o = st.owner[pick.tile];
    if (sp.price) ctx.toast(`${sp.name} · ${sp.price}만${o >= 0 ? ` · 주인 ${st.names[o]} · 통행료 ${st.rents[pick.tile]}만` : ' · 빈 땅'}`);
  };

  const rollB = btn('🎲 주사위 굴리기', 'primary big', () => ctx.send({ type: 'roll' }));
  const buyB = btn('사기', 'primary', () => ctx.send({ type: 'buy' }));
  const buildB = btn('짓기', 'primary', () => ctx.send({ type: 'build' }));
  const passB = btn('넘어가기', 'ghost', () => ctx.send({ type: 'pass' }));
  const resign = btn('파산 선언', 'ghost', () => { if (confirm('정말 포기할까요?')) ctx.send({ type: 'resign' }); });
  bar.append(rollB, buyB, buildB, passB, resign);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1400); };
  const onKey = e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (e.code === 'Space' && !rollB.classList.contains('hidden') && !rollB.disabled) { e.preventDefault(); rollB.click(); } };
  window.addEventListener('keydown', onKey);

  function updateUi() {
    const mine = myTurn() && !busy;
    const p = me();
    const pos = p ? p.pos : 0;
    const sp = st.spaces[pos];
    rollB.classList.toggle('hidden', !(mine && st.phase === 'roll' && !p.fly));
    buyB.classList.toggle('hidden', !(mine && st.phase === 'buy'));
    buildB.classList.toggle('hidden', !(mine && st.phase === 'build'));
    passB.classList.toggle('hidden', !(mine && (st.phase === 'buy' || st.phase === 'build')));
    if (mine && st.phase === 'buy') buyB.textContent = `🏠 ${sp.name} 사기 (${sp.price}만)`;
    if (mine && st.phase === 'build') { const nb = st.nextBuild[pos]; buildB.textContent = `🏗️ ${nb.name} 짓기 (${nb.cost}만)`; }
    rollB.textContent = p && p.island ? `🎲 굴리기 (더블이면 탈출, ${p.island}턴)` : '🎲 주사위 굴리기';
    resign.disabled = st.over || seat < 0 || (p && p.out);
    tiles.forEach((t, i) => { t.material.emissive = t.material.emissive || new THREE.Color(); t.material.emissive.setHex(mine && p.fly && i !== 30 ? 0x3a2a00 : 0); });
    const tp = st.players[st.turn];
    ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
      : `${st.maxRounds ? `${Math.min(st.round, st.maxRounds)}/${st.maxRounds}바퀴` : `${st.round}바퀴`} · 차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''}<br>
         <span class="muted">${busy ? '…' : myTurn() ? (p.fly ? '🚀 날아갈 칸을 클릭하세요!' : st.phase === 'buy' ? `${sp.name}을(를) 살까요?` : st.phase === 'build' ? `${sp.name}에 건물을 지을까요?` : '주사위를 굴리세요 (스페이스바)') : tp.island ? `${st.names[st.turn]} 무인도에 갇힘` : '상대 차례…'}</span><br>
         <span class="muted">칸을 클릭하면 가격·통행료를 볼 수 있어요.</span>`;
    hud.innerHTML = st.players.map((q, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''} ${q.out ? 'out' : ''}"><span style="color:#${PLAYER_COLORS[i].toString(16).padStart(6, '0')}">●</span> ${st.names[i]} ${q.cash}만${q.pass ? ' 🎫' : ''}${q.island ? ' 🏝️' : ''}</span>`).join('');
    fillLog(log, st.log);
  }

  ctx.root.__test = {
    screen: k => {
      const [kind, v] = k.split(':');
      if (kind === 'tile') return stage.screenOf(tilePos(+v, TOP));
      return null;
    },
    state: () => st,
    busy: () => busy
  };

  return {
    winDelay: 1800,
    render(state, mySeat) {
      const first = !st;
      st = state; seat = mySeat;
      if (first) {
        spaces = state.spaces; buildTiles();
        pawns = st.players.map((_, s) => { const p = pawn(PLAYER_COLORS[s]); S.add(p); return p; });
        prevSeq = state.seq; sync();
        return;
      }
      if (state.seq !== prevSeq) {
        prevSeq = state.seq;
        stage.finishTweens();
        // pending playback is superseded: snap to the last state first
        const evs = state.events.slice();
        chain = chain.then(() => play(evs));
      } else if (!busy) sync();
      else updateUi();
      if (st.over && !won) { won = true; setTimeout(() => sfx.win(), 1500); }
    },
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
