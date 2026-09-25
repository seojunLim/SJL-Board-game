import { Stage, THREE, EASE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, feltTexture, paintedTexture } from '../three3d/textures.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Othello: a green tournament board in a black-lacquered frame, thick
// two-tone discs that flip in a wave rippling out from the placed disc, and
// disc supplies stacked beside the board.

const TOP = 0.34;
const FRAME = 9.5;
const R = 0.4, DH = 0.15;
const sqPos = (r, c, y = TOP) => new THREE.Vector3(c - 3.5, y, r - 3.5);

function fieldTexture() {
  const felt = feltTexture(0x1b7a45, { size: 512, repeat: [1, 1], seed: 9 });
  return paintedTexture('othello-field', 1600, 1600, (g, S) => {
    const img = felt.map.image;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.drawImage(img, i * S / 4, j * S / 4, S / 4, S / 4);
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.04)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = vg; g.fillRect(0, 0, S, S);
    const q = S / 8;
    g.strokeStyle = 'rgba(6,26,14,0.95)';
    for (let i = 0; i <= 8; i++) {
      g.lineWidth = i === 0 || i === 8 ? 10 : 5;
      g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, S); g.stroke();
      g.beginPath(); g.moveTo(0, i * q); g.lineTo(S, i * q); g.stroke();
    }
    g.fillStyle = 'rgba(6,26,14,0.95)';
    for (const [a, b] of [[2, 2], [2, 6], [6, 2], [6, 6]]) { g.beginPath(); g.arc(a * q, b * q, 11, 0, Math.PI * 2); g.fill(); }
  });
}

function halfDisc(top) {
  const e = 0.035;
  const prof = top
    ? [[R, 0], [R, DH / 2 - e], [R - e * 0.3, DH / 2 - e * 0.3], [R - e, DH / 2], [0, DH / 2]]
    : [[0, -DH / 2], [R - e, -DH / 2], [R - e * 0.3, -DH / 2 + e * 0.3], [R, -DH / 2 + e], [R, 0]];
  const pts = [];
  // smooth the bevel with a few extra points
  for (let i = 0; i < prof.length; i++) pts.push(new THREE.Vector2(prof[i][0], prof[i][1]));
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

export default function othello(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(log);

  const stage = new Stage(holder, { camera: { radius: 15, phi: 0.66, minR: 9, maxR: 26, target: [0, 0.2, 0.4] } });
  const S = stage.scene;

  // ------------------------------------------------------------ board
  const lacquer = woodTexture({ light: 0x2a1c14, dark: 0x0c0806, rings: 6, seed: 51, figure: 0.8, size: 512 });
  const frame = new THREE.Mesh(new RoundedBoxGeometry(FRAME, TOP, FRAME, 6, 0.08),
    new THREE.MeshPhysicalMaterial({ map: lacquer.map, roughness: 0.4, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 0.28 }));
  frame.position.y = TOP / 2; frame.castShadow = frame.receiveShadow = true; S.add(frame);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(8.12, 8.12).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: fieldTexture(), roughness: 0.92, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x58c98a), envMapIntensity: 0.15 }));
  field.position.y = TOP + 0.002; field.receiveShadow = true; S.add(field);
  // thin gold inlay around the field
  const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xc9a45a, metalness: 1, roughness: 0.3 });
  for (const [x, z, w, d] of [[0, -4.12, 8.36, 0.06], [0, 4.12, 8.36, 0.06], [-4.12, 0, 0.06, 8.36], [4.12, 0, 0.06, 8.36]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), rimMat); b.position.set(x, TOP + 0.005, z); S.add(b);
  }

  const tiles = [];
  const tileMat = new THREE.MeshBasicMaterial({ visible: false });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), tileMat);
    t.position.copy(sqPos(r, c, TOP + 0.01)); t.userData.pick = { r, c };
    S.add(t); tiles.push(t);
  }
  stage.setPickables(tiles);

  // ------------------------------------------------------------ discs
  const blackMat = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: 0xf1efe8, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.6 });
  const topG = halfDisc(true), botG = halfDisc(false);
  function makeDisc(ghost) {
    const g = new THREE.Group();
    const a = new THREE.Mesh(topG, ghost ? ghostB : blackMat), b = new THREE.Mesh(botG, ghost ? ghostW : whiteMat);
    for (const m of [a, b]) { m.castShadow = !ghost; m.receiveShadow = true; g.add(m); }
    return g;
  }
  const ghostB = blackMat.clone(); ghostB.transparent = true; ghostB.opacity = 0.4; ghostB.depthWrite = false;
  const ghostW = whiteMat.clone(); ghostW.transparent = true; ghostW.opacity = 0.4; ghostW.depthWrite = false;
  const discY = TOP + DH / 2 + 0.002;
  const rotFor = v => (v === 1 ? 0 : Math.PI);

  const discs = new Map();                  // 'r,c' -> { g, v }
  // supply stacks beside the board
  const stacks = [new THREE.Group(), new THREE.Group()];
  stacks.forEach(s => S.add(s));
  let stackSig = '';
  function drawStacks(total) {
    const left = Math.max(0, 64 - total);
    const per = [Math.ceil(left / 2), Math.floor(left / 2)];
    const sig = per.join(',');
    if (sig === stackSig) return; stackSig = sig;
    per.forEach((cnt, i) => {
      stacks[i].clear();
      const side = i === 0 ? 1 : -1;
      for (let k = 0; k < cnt; k++) {
        const d = makeDisc();
        const col = Math.floor(k / 8), h = k % 8;
        d.position.set(side * (FRAME / 2 + 0.75 + (col % 2) * 0.9), -0.01 + DH / 2 + h * DH, side * (3.4 - Math.floor(col / 2) * 0.95));
        d.rotation.x = i === 0 ? 0 : Math.PI;
        d.rotation.y = k * 0.7;
        stacks[i].add(d);
      }
    });
  }

  // ------------------------------------------------------------ markers
  const hintTex = paintedTexture('othello-hint', 128, 128, (g, W) => {
    const grd = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
  });
  const hintMat = new THREE.MeshBasicMaterial({ map: hintTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  const hintGeo = new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2);
  const hints = new THREE.Group(); S.add(hints);
  const lastRing = new THREE.Mesh(new THREE.RingGeometry(0.43, 0.49, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffc04d, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
  lastRing.visible = false; lastRing.renderOrder = 3; S.add(lastRing);
  let ghost = null;

  let st = null, seat = -1, prevHist = -1;

  function sync(state) {
    const histLen = state.history.length;
    const fresh = histLen === prevHist + 1 && state.lastMove && state.history[histLen - 1] !== 'pass';
    const first = prevHist === -1;
    prevHist = histLen;
    const placed = fresh ? state.lastMove : null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = state.board[r][c], k = r + ',' + c;
      let d = discs.get(k);
      if (!v) { if (d) { S.remove(d.g); discs.delete(k); } continue; }
      if (!d) {
        const g = makeDisc();
        g.position.copy(sqPos(r, c, discY));
        g.rotation.x = rotFor(v);
        g.rotation.y = Math.random() * Math.PI;
        S.add(g);
        d = { g, v }; discs.set(k, d);
        if (placed && placed.r === r && placed.c === c && !first) {
          stage.tween(300, t => { g.position.y = discY + (1 - t) * 1.6; }, { ease: EASE.outBounce, done: () => sfx.disc(0.5) });
        }
        continue;
      }
      if (d.v !== v) {
        d.v = v;
        const from = d.g.rotation.x, to = from + Math.PI;
        const delay = placed ? 160 + Math.hypot(r - placed.r, c - placed.c) * 110 : 0;
        const g = d.g;
        stage.tween(420, t => {
          g.rotation.x = from + (to - from) * t;
          g.position.y = discY + Math.sin(Math.PI * t) * 0.55;
        }, { delay, ease: EASE.inOutCubic, done: () => { g.rotation.x = rotFor(v); sfx.disc(0.3); } });
      }
    }
    drawStacks(state.counts.black + state.counts.white);

    hints.clear();
    if (state.turn === seat && !state.over) for (const m of state.legal || []) {
      const h = new THREE.Mesh(hintGeo, hintMat); h.renderOrder = 2;
      h.position.copy(sqPos(m.r, m.c, TOP + 0.006)); hints.add(h);
    }
    if (state.lastMove) { lastRing.position.copy(sqPos(state.lastMove.r, state.lastMove.c, discY + DH / 2 + 0.004)); lastRing.visible = true; }
    else lastRing.visible = false;
  }

  stage.onHover = pick => {
    if (ghost) { S.remove(ghost); ghost = null; }
    if (!pick || !st || st.over || st.turn !== seat) return;
    if (!(st.legal || []).some(m => m.r === pick.r && m.c === pick.c)) return;
    ghost = makeDisc(true);
    ghost.position.copy(sqPos(pick.r, pick.c, discY));
    ghost.rotation.x = rotFor(seat === 0 ? 1 : 2);
    S.add(ghost);
  };
  stage.onPick = pick => {
    stage.finishTweens();
    if (!pick || !st || st.over || st.turn !== seat) return;
    ctx.send({ type: 'place', r: pick.r, c: pick.c });
    stage.onHover(null);
  };

  // ------------------------------------------------------------ controls
  const passB = btn('패스', 'primary', () => ctx.send({ type: 'pass' }));
  const resign = btn('기권', 'ghost', () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); });
  const topB = btn('⬒ 위에서 보기', 'ghost', () => stage.setView(stage.view.phi > 0.3 ? { phi: 0.12 } : { phi: 0.66 }));
  bar.append(passB, resign, topB);
  const hud = el('div', 'hud'); holder.appendChild(hud);

  function status() {
    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}<br>흑 ${st.counts.black} : 백 ${st.counts.white}`
      : `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>
         <span class="muted">${st.turn === seat ? (st.mustPass ? '둘 곳이 없습니다 — 패스하세요.' : '빛나는 칸에 두세요.') : '상대 차례…'}</span>`;
    hud.innerHTML = `<span class="chip ${st.turn === 0 && !st.over ? 'turn' : ''}">⚫ 흑 ${st.counts.black}</span>
      <span class="chip ${st.turn === 1 && !st.over ? 'turn' : ''}">⚪ 백 ${st.counts.white}</span>`;
    passB.disabled = st.over || st.turn !== seat || !st.mustPass;
    resign.disabled = st.over || seat < 0;
    fillLog(log, st.history.map((h, i) => `${i + 1}. ${i % 2 === 0 ? '흑' : '백'} ${h}`));
  }

  let orientedFor = null;
  ctx.root.__test = { screen: k => { const [r, c] = k.split(':')[1].split(',').map(Number); return stage.screenOf(sqPos(r, c)); } };
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (orientedFor !== seat) { stage.setView({ theta: seat === 1 ? Math.PI : 0 }, false); orientedFor = seat; }
      sync(state); status();
      if (state.over && !this._won) { this._won = true; sfx.win(); }
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
