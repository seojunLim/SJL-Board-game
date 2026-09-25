import { Stage, THREE, EASE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildPiece } from '../three3d/pieces.js';
import { woodTexture, paintedTexture } from '../three3d/textures.js';
import { choose, btn, el } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

const TOP = 0.38;                                  // playing surface height
const BOARD = 9.6, INSET = 0.07;
const sqPos = (r, c, y = TOP) => new THREE.Vector3(c - 3.5, y, r - 3.5);
const key = (r, c) => r + ',' + c;
const START = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const VALUE_ORDER = ['q', 'r', 'b', 'n', 'p'];

function boardTopTexture() {
  const maple = woodTexture({ light: 0xf2ddb2, dark: 0xd3aa70, rings: 6, seed: 32, figure: 0.8 });
  const walnut = woodTexture({ light: 0x7c4b25, dark: 0x3b1f0c, rings: 6, seed: 33, figure: 1.1 });
  const frame = woodTexture({ light: 0x5a3219, dark: 0x220f05, rings: 8, seed: 31, figure: 1.4 });
  return paintedTexture('chess-top', 2048, 2048, (g, W) => {
    const S = BOARD - INSET * 2;
    const ppu = W / S;
    const f = (S - 8) / 2 * ppu;                 // frame width in px
    const q = ppu;                                // one square
    g.drawImage(frame.canvas, 0, 0, W, W);
    // stringing inlay around the field
    g.fillStyle = '#e8cf9c'; g.fillRect(f - 14, f - 14, q * 8 + 28, q * 8 + 28);
    g.fillStyle = '#1b0c04'; g.fillRect(f - 8, f - 8, q * 8 + 16, q * 8 + 16);
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const src = (r + c) % 2 === 0 ? maple.canvas : walnut.canvas;
      const sw = 300, sx = rnd() * (1024 - sw), sy = rnd() * (1024 - sw);
      g.drawImage(src, sx, sy, sw, sw, f + c * q, f + r * q, q + 0.5, q + 0.5);
    }
    g.strokeStyle = 'rgba(20,8,2,0.35)'; g.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) {
      g.beginPath(); g.moveTo(f + i * q, f); g.lineTo(f + i * q, f + 8 * q); g.stroke();
      g.beginPath(); g.moveTo(f, f + i * q); g.lineTo(f + 8 * q, f + i * q); g.stroke();
    }
    // engraved coordinates (gold leaf)
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${Math.round(f * 0.42)}px Georgia, "Times New Roman", serif`;
    const put = (t, x, y, rot) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(t, 2, 3);
      g.fillStyle = '#e6c982'; g.fillText(t, 0, 0);
      g.restore();
    };
    for (let i = 0; i < 8; i++) {
      put('abcdefgh'[i], f + (i + 0.5) * q, f + 8 * q + f * 0.5, 0);
      put('abcdefgh'[i], f + (i + 0.5) * q, f * 0.5, Math.PI);
      put(String(8 - i), f * 0.5, f + (i + 0.5) * q, 0);
      put(String(8 - i), f + 8 * q + f * 0.5, f + (i + 0.5) * q, Math.PI);
    }
  }, { srgb: true });
}

function radialTexture(name, color) {
  return paintedTexture('radial-' + name, 256, 256, (g, W) => {
    const grd = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    grd.addColorStop(0, color); grd.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.35)')); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
  });
}

export default function chess(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const moves = el('div', 'log moves');
  ctx.extra.innerHTML = ''; ctx.extra.appendChild(moves);

  const stage = new Stage(holder, { camera: { radius: 15.5, phi: 0.7, minR: 9, maxR: 26, target: [0, 0.2, 0.3] } });
  const S = stage.scene;

  // ------------------------------------------------------------ board
  const frameWood = woodTexture({ light: 0x5a3219, dark: 0x220f05, rings: 8, seed: 31, figure: 1.4 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(BOARD, TOP, BOARD, 6, INSET),
    new THREE.MeshPhysicalMaterial({ map: frameWood.map, roughness: 0.5, clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 0.4 }));
  body.position.y = TOP / 2; body.castShadow = true; body.receiveShadow = true;
  S.add(body);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD - INSET * 2, BOARD - INSET * 2).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: boardTopTexture(), roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.4 }));
  top.position.y = TOP + 0.0015; top.receiveShadow = true;
  S.add(top);

  const tiles = [];
  const tileMat = new THREE.MeshBasicMaterial({ visible: false });
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), tileMat);
    t.position.copy(sqPos(r, c, TOP + 0.01)); t.userData.pick = { r, c };
    S.add(t); tiles.push(t);
  }

  // ------------------------------------------------------------ overlays
  const ov = new THREE.Group(); S.add(ov);
  const flat = (w, color, op, tex) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, map: tex || null, toneMapped: false }));
    m.renderOrder = 2; return m;
  };
  const glowTex = radialTexture('blue', 'rgba(120,190,255,1)');
  const redTex = radialTexture('red', 'rgba(255,70,60,1)');
  const dotTex = radialTexture('green', 'rgba(140,255,160,1)');
  const lastA = flat(1, 0xffc861, 0.28), lastB = flat(1, 0xffc861, 0.34);
  const selM = flat(1.5, 0xffffff, 0.9, glowTex);
  const hovM = flat(1, 0xffffff, 0.12);
  const chkM = flat(1.9, 0xffffff, 0.9, redTex);
  ov.add(lastA, lastB, selM, hovM, chkM);
  const targets = new THREE.Group(); ov.add(targets);
  const ringGeo = new THREE.RingGeometry(0.36, 0.46, 40).rotateX(-Math.PI / 2);
  const dotGeo = new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff6a55, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  const dotMat = new THREE.MeshBasicMaterial({ map: dotTex, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });

  // ------------------------------------------------------------ pieces
  let st = null, seat = -1, sel = null, busy = false, pending = null;
  let prevBoard = null, prevHist = -1;
  const pieces = new Map();          // 'r,c' -> { mesh, ch }
  const grave = new THREE.Group(); S.add(grave);
  let graveSig = '';

  function spawn(ch, r, c) {
    const mesh = buildPiece(ch.toLowerCase(), ch === ch.toUpperCase() ? 'w' : 'b');
    mesh.position.copy(sqPos(r, c));
    mesh.userData.pick = { r, c };
    // Knights turn their profile toward the players, facing the centre file.
    if (ch.toLowerCase() === 'n') mesh.rotation.y = c < 4 ? -Math.PI / 2 : Math.PI / 2;
    S.add(mesh);
    return { mesh, ch };
  }

  function lostList(board, color) {
    const have = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    for (const row of board) for (const ch of row) {
      if (ch === '.') continue;
      const isW = ch === ch.toUpperCase();
      if ((color === 'w') === isW) have[ch.toLowerCase()]++;
    }
    const out = [];
    for (const t of VALUE_ORDER) for (let i = have[t]; i < START[t]; i++) out.push(t);
    return out;
  }
  // Pieces lost by `color` stand on the capturer's right-hand side of the table.
  function graveSlot(color, i) {
    const side = color === 'b' ? 1 : -1;
    return new THREE.Vector3(side * (5.55 + (i % 2) * 0.74), -0.01, side * (3.4 - Math.floor(i / 2) * 0.78));
  }
  function rebuildGrave(board) {
    const lw = lostList(board, 'w'), lb = lostList(board, 'b');
    const sig = lw.join('') + '|' + lb.join('');
    if (sig === graveSig) return;
    graveSig = sig;
    grave.clear();
    for (const [color, list] of [['w', lw], ['b', lb]]) list.forEach((t, i) => {
      const m = buildPiece(t, color);
      m.position.copy(graveSlot(color, i));
      m.scale.setScalar(0.8);
      grave.add(m);
    });
  }

  function reconcile(board) {
    const want = new Map();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] !== '.') want.set(key(r, c), board[r][c]);
    for (const [k, p] of pieces) if (want.get(k) !== p.ch) { S.remove(p.mesh); pieces.delete(k); }
    for (const [k, ch] of want) {
      const [r, c] = k.split(',').map(Number);
      if (!pieces.has(k)) pieces.set(k, spawn(ch, r, c));
      const p = pieces.get(k);
      p.mesh.position.copy(sqPos(r, c)); p.mesh.userData.pick = { r, c };
      p.mesh.rotation.x = 0; p.mesh.rotation.z = 0;
    }
    rebuildGrave(board);
    stage.setPickables([...tiles, ...[...pieces.values()].map(p => p.mesh)]);
  }

  function animateMove(prev, next, mv, done) {
    const [fr, fc] = mv.from, [tr, tc] = mv.to;
    const mover = pieces.get(key(fr, fc));
    const ch = prev[fr][fc];
    if (!mover || ch === '.') return done();
    let capKey = prev[tr][tc] !== '.' ? key(tr, tc) : null;
    if (ch.toLowerCase() === 'p' && fc !== tc && prev[tr][tc] === '.') capKey = key(fr, tc);
    const cap = capKey ? pieces.get(capKey) : null;
    const dist = Math.hypot(tr - fr, tc - fc);
    const dur = 360 + dist * 55;
    const hop = ch.toLowerCase() === 'n' ? 1.25 : 0.35 + dist * 0.08;
    const a = mover.mesh.position.clone(), b = sqPos(tr, tc);
    stage.tween(dur, k => {
      mover.mesh.position.lerpVectors(a, b, k);
      mover.mesh.position.y = TOP + Math.sin(Math.PI * k) * hop;
    }, { ease: EASE.inOutCubic, done: () => {
      sfx.knock(0.55);
      if (capKey) pieces.delete(capKey);
      if (cap) S.remove(cap.mesh);
      pieces.delete(key(fr, fc));
      pieces.set(key(tr, tc), { mesh: mover.mesh, ch: next[tr][tc] === ch ? ch : '?' });
      if (rookMove) { pieces.delete(rookMove.from); pieces.set(rookMove.to, rookMove.p); }
      done();
    } });
    if (cap) {
      const color = cap.ch === cap.ch.toUpperCase() ? 'w' : 'b';
      const after = lostList(next, color);
      const idx = after.lastIndexOf(cap.ch.toLowerCase());
      const from = cap.mesh.position.clone(), to = graveSlot(color, Math.max(0, idx));
      stage.tween(520, k => {
        cap.mesh.position.lerpVectors(from, to, k);
        cap.mesh.position.y = from.y + Math.sin(Math.PI * k) * 1.6 - (TOP + 0.01) * k;
        cap.mesh.scale.setScalar(1 - 0.2 * k);
        cap.mesh.rotation.z = Math.sin(Math.PI * k) * 0.5;
      }, { delay: dur * 0.72, ease: EASE.inOutCubic });
    }
    let rookMove = null;
    if (ch.toLowerCase() === 'k' && Math.abs(tc - fc) === 2) {
      const rook = pieces.get(key(fr, tc > fc ? 7 : 0));
      if (rook) {
        rookMove = { from: key(fr, tc > fc ? 7 : 0), to: key(fr, tc > fc ? 5 : 3), p: rook };
        const ra = rook.mesh.position.clone(), rb = sqPos(fr, tc > fc ? 5 : 3);
        stage.tween(dur, k => { rook.mesh.position.lerpVectors(ra, rb, k); rook.mesh.position.y = TOP + Math.sin(Math.PI * k) * 0.9; },
          { delay: 90, ease: EASE.inOutCubic });
      }
    }
  }

  function movesFrom(r, c) { return (st.legal || []).filter(m => m.from[0] === r && m.from[1] === c); }

  function place(m, r, c, y = TOP + 0.004) { m.position.copy(sqPos(r, c, y)); m.visible = true; }

  function drawOverlays() {
    lastA.visible = lastB.visible = selM.visible = chkM.visible = false;
    targets.clear();
    if (!st) return;
    if (st.lastMove) { place(lastA, ...st.lastMove.from); place(lastB, ...st.lastMove.to); }
    if (st.check && !st.over) {
      const k = st.side === 'w' ? 'K' : 'k';
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c] === k) place(chkM, r, c, TOP + 0.006);
    }
    if (sel) {
      place(selM, sel[0], sel[1], TOP + 0.005);
      for (const m of movesFrom(sel[0], sel[1])) {
        const capture = st.board[m.to[0]][m.to[1]] !== '.' || m.ep;
        const mk = new THREE.Mesh(capture ? ringGeo : dotGeo, capture ? ringMat : dotMat);
        mk.renderOrder = 3;
        mk.position.copy(sqPos(m.to[0], m.to[1], TOP + 0.008));
        targets.add(mk);
      }
    }
  }

  function lift(r, c, up) {
    const p = pieces.get(key(r, c)); if (!p) return;
    const y0 = p.mesh.position.y, y1 = up ? TOP + 0.16 : TOP;
    stage.tween(160, k => { p.mesh.position.y = y0 + (y1 - y0) * k; });
  }

  function setSel(s) {
    if (sel) lift(sel[0], sel[1], false);
    sel = s;
    if (sel) { lift(sel[0], sel[1], true); sfx.knock(0.15); }
    drawOverlays();
  }

  stage.onHover = pick => {
    hovM.visible = false;
    if (!pick || !st || st.over || st.turn !== seat || busy) return;
    const ok = movesFrom(pick.r, pick.c).length || (sel && movesFrom(sel[0], sel[1]).some(m => m.to[0] === pick.r && m.to[1] === pick.c));
    if (ok) place(hovM, pick.r, pick.c, TOP + 0.005);
  };

  stage.onPick = async pick => {
    if (busy) stage.finishTweens();
    if (!pick || !st || st.over || st.turn !== seat || busy) return;
    const { r, c } = pick;
    if (sel && sel[0] === r && sel[1] === c) return setSel(null);
    const opts = sel ? movesFrom(sel[0], sel[1]).filter(m => m.to[0] === r && m.to[1] === c) : [];
    if (opts.length) {
      let promo = null;
      if (opts.some(m => m.promo)) {
        const white = seat === 0;
        promo = await choose('승격할 기물을 고르세요', [
          { value: 'q', label: '퀸', icon: white ? '♕' : '♛' }, { value: 'r', label: '룩', icon: white ? '♖' : '♜' },
          { value: 'b', label: '비숍', icon: white ? '♗' : '♝' }, { value: 'n', label: '나이트', icon: white ? '♘' : '♞' }
        ]);
        if (!promo) return;
      }
      const from = sel;
      sel = null; drawOverlays();
      ctx.send({ type: 'move', from, to: [r, c], promo });
      return;
    }
    setSel(movesFrom(r, c).length ? [r, c] : null);
  };

  // ------------------------------------------------------------ controls
  const resign = btn('기권', 'ghost', () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); });
  const drawB = btn('무승부 제안', 'ghost', () => ctx.send({ type: 'draw-offer' }));
  const acceptB = btn('무승부 수락', 'primary hidden', () => ctx.send({ type: 'draw-accept' }));
  const flipB = btn('↻ 시점 반대', 'ghost', () => stage.setView({ theta: stage.view.theta + Math.PI }));
  const topB = btn('⬒ 위에서 보기', 'ghost', () => stage.setView(stage.view.phi > 0.3 ? { phi: 0.14 } : { phi: 0.7 }));
  bar.append(resign, drawB, acceptB, flipB, topB);

  function status() {
    const turnName = st.turn === 0 ? '백' : '흑';
    const myName = seat === 0 ? '백' : seat === 1 ? '흑' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}`
      : `차례: <b>${turnName}</b>${st.check ? ' · <span style="color:#ff7a6a">체크!</span>' : ''}<br>나: ${myName}<br>
         <span class="muted">${st.fullmove}수째 · 50수 ${st.halfmove}/100<br>드래그 회전 · 휠/핀치 확대</span>`;
    moves.innerHTML = '';
    for (let i = 0; i < st.history.length; i += 2) {
      const s = el('div', null, `<span>${i / 2 + 1}.</span> <span>${st.history[i] || ''}</span> <span>${st.history[i + 1] || ''}</span>`);
      moves.appendChild(s);
    }
    moves.scrollTop = moves.scrollHeight;
    resign.disabled = drawB.disabled = st.over || seat < 0;
    acceptB.classList.toggle('hidden', !(st.drawOffer != null && st.drawOffer !== seat && seat >= 0 && !st.over));
  }

  // ------------------------------------------------------------ state
  function apply(state) {
    const histLen = state.history.length;
    const animate = prevBoard && histLen === prevHist + 1 && state.lastMove;
    const prev = prevBoard;
    prevBoard = state.board; prevHist = histLen;
    if (sel && (state.turn !== seat || state.over)) { sel = null; }
    if (animate) {
      busy = true;
      const target = state.board;
      animateMove(prev, state.board, state.lastMove, () => {
        busy = false;
        reconcile(target); drawOverlays();
        if (pending) { const p = pending; pending = null; apply(p); }
      });
    } else reconcile(state.board);
    drawOverlays();
    if (state.over && !apply.overPlayed) { apply.overPlayed = true; sfx.win(); }
  }

  let orientedFor = null;
  ctx.root.__test = { screen: k => { const [r, c] = k.split(':')[1].split(',').map(Number); return stage.screenOf(sqPos(r, c, TOP + 0.3)); } };

  return {
    render(state, mySeat) {
      seat = mySeat;
      if (orientedFor !== seat) { stage.setView({ theta: seat === 1 ? Math.PI : 0 }, false); orientedFor = seat; }
      if (busy) { st = state; pending = state; status(); return; }
      st = state;
      apply(state);
      status();
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
