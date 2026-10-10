import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture } from './textures.js';
import { sfx } from './sound.js';

// Six-sided dice with drilled-looking pips, and a scripted throw that
// tumbles across the table and lands showing the value the server rolled.

// face value -> outward normal (opposite faces add up to 7)
const NORMALS = {
  1: new THREE.Vector3(0, 1, 0), 6: new THREE.Vector3(0, -1, 0),
  2: new THREE.Vector3(1, 0, 0), 5: new THREE.Vector3(-1, 0, 0),
  3: new THREE.Vector3(0, 0, 1), 4: new THREE.Vector3(0, 0, -1)
};
// BoxGeometry material order: +x, -x, +y, -y, +z, -z
const ORDER = [2, 5, 1, 6, 3, 4];
const PIPS = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]]
};

function faceTex(v, style) {
  return paintedTexture(`die-${style.key}-${v}`, 256, 256, (g, W) => {
    g.fillStyle = style.body; g.fillRect(0, 0, W, W);
    const grd = g.createRadialGradient(W / 2, W / 2, W * 0.2, W / 2, W / 2, W * 0.75);
    grd.addColorStop(0, 'rgba(255,255,255,0.08)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd; g.fillRect(0, 0, W, W);
    for (const [x, y] of PIPS[v]) {
      const r = v === 1 ? W * 0.13 : W * 0.085;
      const cx = x * W, cy = y * W;
      // drilled pip: darker rim, then the pip colour, then a small highlight
      g.beginPath(); g.arc(cx, cy, r * 1.12, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = v === 1 && style.redOne ? '#c8141e' : style.pip; g.fill();
      g.beginPath(); g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    }
  });
}

const STYLES = {
  ivory: { key: 'ivory', body: '#f5efe2', pip: '#1b1b1b', redOne: true, color: 0xffffff },
  red: { key: 'red', body: '#c81e2b', pip: '#ffffff', redOne: false, color: 0xffffff },
  blue: { key: 'blue', body: '#1f58c8', pip: '#ffffff', redOne: false, color: 0xffffff }
};

const geoCache = {};
export function dieMesh(size = 0.9, style = 'ivory') {
  const st = STYLES[style] || STYLES.ivory;
  const geo = geoCache[size] || (geoCache[size] = new RoundedBoxGeometry(size, size, size, 4, size * 0.16));
  const mats = ORDER.map(v => new THREE.MeshPhysicalMaterial({ map: faceTex(v, st), roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.6 }));
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = m.receiveShadow = true;
  m.userData.size = size;
  return m;
}

// Orientation that shows `v` on top, turned by `yaw` around the vertical.
export function topQuat(v, yaw = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(NORMALS[v], new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}

// Throw `dice` (meshes) from `from` so that die i lands at targets[i] showing
// values[i]. Returns the total duration in ms.
export function throwDice(stage, dice, values, targets, { from = new THREE.Vector3(0, 2.5, 6), floorY = 0, dur = 1300 } = {}) {
  dice.forEach((m, i) => {
    const size = m.userData.size;
    const end = targets[i].clone(); end.y = floorY + size / 2;
    const start = from.clone().add(new THREE.Vector3((i - (dice.length - 1) / 2) * 0.5, Math.random() * 0.4, Math.random() * 0.4));
    const qEnd = topQuat(values[i], (Math.random() - 0.5) * 0.8);
    const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const spins = 3 + Math.random() * 3;
    const d = dur * (0.85 + Math.random() * 0.3);
    const bounces = [0.45, 0.72, 0.88];
    let played = 0;
    const tmp = new THREE.Quaternion();
    stage.tween(d, k => {
      // horizontal glide with drag
      const kx = 1 - Math.pow(1 - k, 2.2);
      m.position.lerpVectors(start, end, kx);
      // height: a fall then shrinking hops
      let h;
      if (k < bounces[0]) { const u = k / bounces[0]; h = (start.y - end.y) * (1 - u * u); }
      else {
        let a = bounces[0], amp = 0.55, j = 0;
        while (j < bounces.length - 1 && k > bounces[j + 1]) { a = bounces[j + 1]; amp *= 0.4; j++; }
        const b = bounces[j + 1] || 1;
        const u = (k - a) / (b - a);
        h = amp * 4 * u * (1 - u);
        if (j + 1 > played && k > a) { played = j + 1; sfx.knock(0.35 * amp + 0.1); }
      }
      m.position.y = end.y + Math.max(0, h);
      tmp.setFromAxisAngle(axis, spins * Math.PI * 2 * Math.pow(1 - k, 2));
      m.quaternion.copy(qEnd).premultiply(tmp);
    }, { ease: k => k, done: () => { m.position.copy(end); m.quaternion.copy(qEnd); sfx.knock(0.2); } });
  });
  sfx.whoosh(0.25);
  return dur * 1.15;
}
