import { Stage, THREE, EASE, MOBILE } from '../three3d/scene.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, feltTexture } from '../three3d/textures.js';
import { dieMesh, topQuat, throwDice } from '../three3d/dice.js';
import { btn, el, fillLog } from '../three3d/ui.js';
import { sfx } from '../three3d/sound.js';

// Yacht dice: a felt-lined wooden dice tray. Roll, click dice to keep them
// on the rail in front, roll again, then pick a category on the score sheet.

const TW = 7.4, TD = 4.6, WALL = 0.35, WH = 0.55;
const KEEP_Z = TD / 2 + 1.35;

function seeded(seed) { let s = seed % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export default function yacht(ctx) {
  const holder = el('div', 'stageWrap');
  const bar = el('div', 'row controls');
  ctx.root.append(holder, bar);
  const sheetBox = el('div', 'yachtSheet');
  const log = el('div', 'log');
  ctx.extra.innerHTML = ''; ctx.extra.append(sheetBox, log);

  const stage = new Stage(holder, {
    aspect: 0.8,
    camera: { radius: 11.5, phi: 0.62, minR: 6, maxR: 20, target: [0, 0, 0.7], maxPhi: 1.2 },
    mat: { w: 12, h: 10, r: 1.4, color: 0x5a1f2a, sheen: 0xc0707e }
  });
  const S = stage.scene;
  const Y0 = stage.matTop;

  // ------------------------------------------------------------ tray
  const wood = woodTexture({ light: 0x8a5a32, dark: 0x4a2a14, rings: 4, size: 512, seed: 21, figure: 1 });
  const woodMat = new THREE.MeshPhysicalMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.4, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const tray = new THREE.Group(); S.add(tray);
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, WH, d, 3, 0.1), woodMat); m.position.set(x, Y0 + WH / 2, z); m.castShadow = m.receiveShadow = true; tray.add(m); };
  wall(TW + WALL * 2, WALL, 0, -TD / 2 - WALL / 2); wall(TW + WALL * 2, WALL, 0, TD / 2 + WALL / 2);
  wall(WALL, TD, -TW / 2 - WALL / 2, 0); wall(WALL, TD, TW / 2 + WALL / 2, 0);
  const felt = feltTexture(0x1d5a3a, { repeat: [3, 2] });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.06, TD), new THREE.MeshPhysicalMaterial({ map: felt.map, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x6fbf8f) }));
  bed.position.y = Y0 + 0.03; bed.receiveShadow = true; tray.add(bed);
  const FLOOR = Y0 + 0.06;
  // keep rail
  const rail = new THREE.Mesh(new RoundedBoxGeometry(TW - 0.6, 0.12, 1.25, 3, 0.05), woodMat);
  rail.position.set(0, Y0 + 0.06, KEEP_Z); rail.receiveShadow = rail.castShadow = true; S.add(rail);
  const RAIL_Y = Y0 + 0.12;

  const dice = [0, 1, 2, 3, 4].map(() => { const d = dieMesh(0.9); d.userData.pick = null; S.add(d); return d; });
  dice.forEach((d, i) => { d.userData.pick = { die: i }; });
  const trayPos = [0, 1, 2, 3, 4].map(i => new THREE.Vector3(-2.4 + i * 1.2, 0, 0));
  const keepPos = i => new THREE.Vector3(-2.4 + i * 1.2, 0, KEEP_Z);

  let st = null, seat = -1, prevSeq = -1, prevHeld = null, won = false, rolling = false;
  const myTurn = () => st && !st.over && seat >= 0 && st.turn === seat;

  function place(i, animate) {
    const d = dice[i];
    const held = st.held[i] && st.rolls > 0;
    const to = (held ? keepPos(i) : trayPos[i]).clone();
    to.y = (held ? RAIL_Y : FLOOR) + 0.45;
    if (!animate) { d.position.copy(to); return; }
    const from = d.position.clone();
    stage.tween(260, k => { d.position.lerpVectors(from, to, k); d.position.y += Math.sin(k * Math.PI) * 0.5; }, { ease: EASE.inOutCubic, done: () => sfx.knock(0.25) });
  }

  function sync(fresh) {
    if (fresh && st.last && st.last.type === 'roll') {
      const r = seeded(st.rollSeq * 7919 + 17);
      const idx = [], vals = [], targets = [];
      st.last.rolled.forEach((rolled, i) => {
        if (!rolled) return;
        trayPos[i].set(-2.6 + i * 1.3 + (r() - 0.5) * 0.5, 0, (r() - 0.5) * 2.4);
        idx.push(i); vals.push(st.dice[i]); targets.push(trayPos[i]);
      });
      rolling = true;
      const dur = throwDice(stage, idx.map(i => dice[i]), vals, targets, { from: new THREE.Vector3(0, 3, 4.2), floorY: FLOOR });
      setTimeout(() => { rolling = false; }, dur);
      dice.forEach((d, i) => { if (!st.last.rolled[i]) place(i, true); });
    } else {
      dice.forEach((d, i) => {
        if (prevHeld && prevHeld[i] !== st.held[i]) place(i, true);
        else if (!prevHeld) { place(i, false); d.quaternion.copy(topQuat(st.dice[i], (i - 2) * 0.2)); }
      });
      // a new turn: dice slide back into the tray
      if (fresh && st.last && st.last.type === 'score') dice.forEach((d, i) => place(i, true));
    }
    prevHeld = st.held.slice();
  }

  stage.onPick = pick => {
    if (!pick || pick.die == null || !st) return;
    if (!myTurn()) return ctx.toast(st.over ? '게임이 끝났어요.' : '내 차례가 아니에요.');
    if (!st.rolls) return ctx.toast('먼저 굴리세요!');
    if (st.rolls >= 3) return ctx.toast('3번 다 굴렸어요. 점수표에서 칸을 고르세요.');
    stage.finishTweens();
    ctx.send({ type: 'hold', index: pick.die });
  };

  const rollB = btn('🎲 굴리기', 'primary big', () => { if (!rolling) ctx.send({ type: 'roll' }); });
  bar.append(rollB);
  const hud = el('div', 'hud'); holder.appendChild(hud);
  const banner = el('div', 'toastIn'); holder.appendChild(banner);
  let bannerT = 0;
  const flash = t => { banner.innerHTML = t; banner.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => banner.classList.remove('show'), 1500); };
  const onKey = e => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (e.code === 'Space' && myTurn() && st.rolls < 3) { e.preventDefault(); rollB.click(); } };
  window.addEventListener('keydown', onKey);

  function renderSheet() {
    const head = `<tr><th></th>${st.names.map((n, i) => `<th class="${i === st.turn && !st.over ? 'turn' : ''}">${n}</th>`).join('')}</tr>`;
    const row = c => {
      const cells = st.names.map((_, i) => {
        const v = st.sheets[i][c];
        if (v != null) return `<td class="done">${v}</td>`;
        if (i === st.turn && st.preview && !st.over) {
          const p = st.preview[c];
          return i === seat && !rolling ? `<td class="pv mine ${p ? '' : 'zero'}" data-cat="${c}">${p}</td>` : `<td class="pv">${rolling ? '' : p}</td>`;
        }
        return '<td></td>';
      }).join('');
      return `<tr><th>${st.catKo[c]}</th>${cells}</tr>`;
    };
    const up = st.cats.slice(0, 6).map(row).join('');
    const bonusRow = `<tr class="sub"><th>보너스 (63↑ +35)</th>${st.upper.map(u => `<td>${u >= 63 ? '+35' : `${u}/63`}</td>`).join('')}</tr>`;
    const low = st.cats.slice(6).map(row).join('');
    const tot = `<tr class="tot"><th>합계</th>${st.totals.map(t => `<td>${t}</td>`).join('')}</tr>`;
    sheetBox.innerHTML = `<table>${head}${up}${bonusRow}${low}${tot}</table>`;
    sheetBox.querySelectorAll('td.mine').forEach(td => { td.onclick = () => ctx.send({ type: 'score', cat: td.dataset.cat }); });
  }

  ctx.root.__test = {
    screen: k => {
      const [kind, i] = k.split(':');
      if (kind !== 'die') return null;
      return stage.screenOf(dice[+i].position.clone());
    },
    state: () => st,
    rolling: () => rolling,
    tops: () => dice.map(d => {
      const N = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [1, 0, 0], 5: [-1, 0, 0], 3: [0, 0, 1], 4: [0, 0, -1] };
      let best = 0, bv = -2;
      for (const [v, n] of Object.entries(N)) { const w = new THREE.Vector3(...n).applyQuaternion(d.quaternion); if (w.y > bv) { bv = w.y; best = +v; } }
      return best;
    })
  };

  return {
    render(state, mySeat) {
      stage.finishTweens();
      const before = st;
      st = state; seat = mySeat;
      const fresh = !!before && (state.rollSeq !== prevSeq || (state.last && before.last !== state.last && JSON.stringify(before.last) !== JSON.stringify(state.last)));
      sync(fresh);
      prevSeq = state.rollSeq;
      if (fresh && st.last && st.last.type === 'score') {
        const l = st.last;
        if (l.cat === 'yacht' && l.pts) { flash('🛥️ 요트!!! +50'); sfx.bell(0.4); }
        else if (l.pts >= 30) flash(`${st.names[l.seat]}: ${st.catKo[l.cat]} ${l.pts}점!`);
      }
      if (fresh && st.last && st.last.type === 'roll' && st.dice.every(v => v === st.dice[0])) setTimeout(() => { flash('🛥️ 요트!'); sfx.bell(0.4); }, 1300);
      stage.setPickables(dice);
      if (rolling) setTimeout(() => { if (st === state) renderSheet(); }, 1500);
      renderSheet();
      const left = 3 - st.rolls;
      rollB.textContent = st.rolls === 0 ? '🎲 굴리기' : `🎲 다시 굴리기 (${left}번 남음)`;
      rollB.disabled = !myTurn() || st.rolls >= 3 || (st.rolls > 0 && st.held.every(Boolean));
      ctx.status.innerHTML = st.over ? `<b>게임 종료</b><br>${st.result}`
        : `라운드 <b>${Math.min(12, st.round)}</b>/12 · 차례: <b>${st.names[st.turn]}</b>${myTurn() ? ' (나)' : ''}<br>
           <span class="muted">${myTurn() ? (st.rolls === 0 ? '굴리기를 누르세요 (스페이스바).' : st.rolls < 3 ? '남길 주사위를 클릭하고 다시 굴리거나, 점수표의 숫자를 눌러 적으세요.' : '점수표에서 적을 칸을 고르세요.') : '구경 중…'}</span>`;
      hud.innerHTML = st.names.map((nm, i) => `<span class="chip ${st.turn === i && !st.over ? 'turn' : ''} ${i === seat ? 'me' : ''}">${nm} ${st.totals[i]}점</span>`).join('');
      fillLog(log, st.log);
      if (st.over && !won) { won = true; sfx.win(); }
    },
    destroy() { window.removeEventListener('keydown', onKey); stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; delete ctx.root.__test; }
  };
}
