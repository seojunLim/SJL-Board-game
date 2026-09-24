import { Stage, THREE } from '../three3d/scene.js';

const sqWorld = (r, c) => [c - 3.5, r - 3.5];

export default function othello(ctx) {
  const holder = document.createElement('div'); holder.style.width = '100%';
  const bar = document.createElement('div'); bar.className = 'row'; bar.style.marginTop = '10px';
  ctx.root.appendChild(holder); ctx.root.appendChild(bar);
  ctx.extra.innerHTML = '';

  const stage = new Stage(holder, { radius: 11, minR: 7, maxR: 17, phi: 0.7, targetY: -0.1 });

  // Felt board in a wooden frame.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.5, 9.0),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.7 }));
  frame.position.y = -0.28; frame.receiveShadow = true; stage.scene.add(frame);
  const felt = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.12, 8.2),
    new THREE.MeshStandardMaterial({ color: 0x0f7a42, roughness: 0.9 }));
  felt.position.y = 0.0; felt.receiveShadow = true; stage.scene.add(felt);
  // Grid lines.
  const lineMat = new THREE.LineBasicMaterial({ color: 0x0a3b22 });
  for (let i = 0; i <= 8; i++) {
    const a = i - 4;
    const g1 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a, 0.07, -4), new THREE.Vector3(a, 0.07, 4)]);
    const g2 = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-4, 0.07, a), new THREE.Vector3(4, 0.07, a)]);
    stage.scene.add(new THREE.Line(g1, lineMat), new THREE.Line(g2, lineMat));
  }

  const tiles = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.02, 0.98), new THREE.MeshBasicMaterial({ visible: false }));
    const [x, z] = sqWorld(r, c); t.position.set(x, 0.08, z);
    t.userData.pick = { r, c }; stage.scene.add(t); tiles.push(t);
  }
  stage.setPickables(tiles);

  // A disc: black on top, white on bottom (rotate 180° to flip colours).
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.35 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.35 });
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5 });
  function makeDisc() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 40), [edgeMat, blackMat, whiteMat]);
    body.castShadow = true; body.receiveShadow = true;
    g.add(body); return g;
  }
  // colour: 1 black shows up (rot 0), 2 white shows up (rot PI)
  const overlay = new THREE.Group(); stage.scene.add(overlay);
  const legalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28 });
  const lastMat = new THREE.MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.6 });

  let st = null, seat = -1;
  const discs = new Map();        // "r,c" -> { group, color, targetRot }

  const controls = document.createElement('div'); controls.className = 'row';
  const passB = document.createElement('button'); passB.textContent = '패스'; passB.className = 'primary';
  passB.onclick = () => ctx.send({ type: 'pass' });
  const resign = document.createElement('button'); resign.textContent = '기권'; resign.className = 'ghost';
  resign.onclick = () => { if (confirm('정말 기권하시겠습니까?')) ctx.send({ type: 'resign' }); };
  bar.append(passB, resign);

  stage.onPick = (sq) => { if (sq && !st.over && st.turn === seat) ctx.send({ type: 'place', r: sq.r, c: sq.c }); };

  stage.tick = () => {
    for (const d of discs.values()) {
      const cur = d.group.rotation.z;
      const diff = d.targetRot - cur;
      if (Math.abs(diff) > 0.01) d.group.rotation.z = cur + diff * 0.25;
      else d.group.rotation.z = d.targetRot;
    }
  };

  function sync() {
    const seen = new Set();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const v = st.board[r][c];
      if (!v) continue;
      const key = r + ',' + c; seen.add(key);
      let d = discs.get(key);
      const targetRot = v === 1 ? 0 : Math.PI;
      if (!d) {
        const group = makeDisc();
        const [x, z] = sqWorld(r, c); group.position.set(x, 0.14, z);
        group.rotation.z = targetRot;           // new discs appear already correct
        stage.scene.add(group);
        d = { group, targetRot }; discs.set(key, d);
      }
      d.targetRot = targetRot;                    // existing discs animate the flip
    }
    for (const [k, d] of discs) if (!seen.has(k)) { stage.scene.remove(d.group); discs.delete(k); }

    overlay.clear();
    const add = (mesh, r, c, y) => { const [x, z] = sqWorld(r, c); mesh.position.set(x, y, z); overlay.add(mesh); };
    if (st.turn === seat && !st.over) for (const m of st.legal || [])
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 20), legalMat), m.r, m.c, 0.12);
    if (st.lastMove) add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 10, 28).rotateX(Math.PI / 2), lastMat), st.lastMove.r, st.lastMove.c, 0.16);

    const my = seat === 0 ? '흑' : seat === 1 ? '백' : '관전';
    ctx.status.innerHTML = st.over
      ? `<b>게임 종료</b><br>${st.result}<br>흑 ${st.counts.black} : 백 ${st.counts.white}`
      : `차례: <b>${st.turn === 0 ? '흑' : '백'}</b><br>나: ${my}<br>흑 ${st.counts.black} : 백 ${st.counts.white}<br>
         <span class="muted">${st.turn === seat ? (st.mustPass ? '둘 곳이 없습니다 — 패스.' : '놓을 칸을 클릭하세요.') : '상대 차례…'} · 드래그 회전</span>`;
    passB.disabled = st.over || st.turn !== seat || !st.mustPass;
    resign.disabled = st.over || seat < 0;
  }

  let orientedFor = null;
  return {
    render(state, mySeat) {
      st = state; seat = mySeat;
      if (orientedFor !== seat) { stage.theta = seat === 1 ? Math.PI : 0; orientedFor = seat; }
      sync();
    },
    destroy() { stage.destroy(); ctx.root.innerHTML = ''; ctx.extra.innerHTML = ''; }
  };
}
