import * as THREE from 'three';

// Procedural textures painted on <canvas>: wood grain, felt, shell. No image
// assets ship with the site, so every surface is generated here once and cached
// for the lifetime of the page.

// ---------------------------------------------------------------- noise
function makeNoise(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed * 9301 + 49297;
  for (let i = 255; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) val[i] = perm[i] / 255;
  const fade = t => t * t * (3 - 2 * t);
  const md = (a, p) => ((a % p) + p) % p;
  // Periodic value noise: with px/py set, the pattern tiles every px x py
  // lattice cells, so textures repeat without visible seams.
  function noise(x, y, px = 0, py = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = px ? md(xi, px) : xi, x1 = px ? md(xi + 1, px) : xi + 1;
    const y0 = py ? md(yi, py) : yi, y1 = py ? md(yi + 1, py) : yi + 1;
    const h = (X, Y) => val[perm[(X & 255) + perm[Y & 255]]];
    const a = h(x0, y0), b = h(x1, y0), c = h(x0, y1), d = h(x1, y1);
    const u = fade(xf), v = fade(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct = 4, px = 0, py = 0) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += noise(x * f, y * f, px * f, py * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }
  return { noise, fbm };
}

const cache = new Map();
let maxAniso = 8;
export function setMaxAnisotropy(n) { maxAniso = n; }

function finish(canvas, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

const hex = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const mix = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- wood
// light/dark: 0xRRGGBB. rings: ring frequency across the grain. planks: split
// into boards with seams. Grain runs along the U (x) axis.
export function woodTexture(opts = {}) {
  const o = Object.assign({ light: 0xc89b5f, dark: 0x8a5a2b, rings: 9, size: 1024, planks: 0, seed: 1, figure: 1, repeat: [1, 1], streak: 0.35 }, opts);
  const key = 'wood:' + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const W = o.size, H = o.size;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const bumpCv = document.createElement('canvas'); bumpCv.width = W; bumpCv.height = H;
  const bg = bumpCv.getContext('2d');
  const bimg = bg.createImageData(W, H);
  const { fbm, noise } = makeNoise(o.seed);
  const L = hex(o.light), D = hex(o.dark);
  const plankH = o.planks ? H / o.planks : H;
  // Low-frequency terms (ring warp, grain streaks) are evaluated on coarse
  // column blocks per row and interpolated; only pores are per-pixel. This
  // keeps a 1024px board texture well under 100ms.
  const BW = 8, BS = 16;
  const nW = W / BW, nS = W / BS;
  const warpRow = new Float32Array(nW + 1), streakRow = new Float32Array(nS + 1);
  for (let y = 0; y < H; y++) {
    const plank = o.planks ? Math.floor(y / plankH) : 0;
    const py = o.planks ? (y % plankH) / plankH : y / H;
    const off = plank * 37.13;
    const seamDist = o.planks ? Math.min(py, 1 - py) * plankH : 99;
    const v = y / H;
    for (let b = 0; b <= nW; b++) {
      const u = b / nW;
      // Growth rings bend slowly along the grain (cathedral figure) and only
      // wobble a little across it, like flat-sawn boards.
      warpRow[b] = (fbm(u * 1 + off, v * 2, 4, 1, 2) - 0.5) * 3.4 * o.figure
        + (fbm(u * 4 + off, v * 6, 2, 4, 6) - 0.5) * 0.35;
    }
    for (let b = 0; b <= nS; b++) streakRow[b] = fbm((b / nS) * 2 + off, v * 320, 3, 2, 320);
    const tint = o.planks ? 0.84 + ((Math.sin(plank * 12.9898 + o.seed) * 43758.5453) % 1 + 1) % 1 * 0.3 : 1;
    for (let x = 0; x < W; x++) {
      const fw = x / BW, iw = fw | 0, tw = fw - iw;
      const warp = warpRow[iw] + (warpRow[iw + 1] - warpRow[iw]) * tw;
      const fs = x / BS, is = fs | 0, ts = fs - is;
      const streak = streakRow[is] + (streakRow[is + 1] - streakRow[is]) * ts;
      let ring = Math.sin((py * o.rings + warp + plank * 0.37) * Math.PI * 2) * 0.5 + 0.5;
      ring = ring * ring * ring;
      // pores: cheap integer hash on cells stretched along the grain
      const h = Math.imul(((x / 5) | 0) + plank * 131, 73856093) ^ Math.imul(y, 19349663);
      const pores = ((h >>> 7) & 1023) > 972 ? 0.1 : 0;
      let t = ring * 0.5 + (streak - 0.5) * o.streak * 1.6 + 0.24 + pores;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      let r = mix(L[0], D[0], t) * tint, gg = mix(L[1], D[1], t) * tint, b = mix(L[2], D[2], t) * tint;
      if (seamDist < 1.6) { r *= 0.45; gg *= 0.45; b *= 0.45; }
      const i = (y * W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
      const bv = seamDist < 1.6 ? 0 : 255 - t * 110 - pores * 400;
      bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = bv > 0 ? bv : 0; bimg.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  const out = { map: finish(cv, { repeat: o.repeat }), bump: finish(bumpCv, { srgb: false, repeat: o.repeat }), canvas: cv };
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- felt
export function feltTexture(color = 0x1f6b43, opts = {}) {
  const o = Object.assign({ size: 512, repeat: [4, 4], seed: 3 }, opts);
  const key = 'felt:' + color + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const W = o.size;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, W);
  const { fbm, noise } = makeNoise(o.seed);
  const C = hex(color);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    // tileable-ish: sample on a torus-free grid; repeat hides the seam at 4x4
    const n = fbm(x / W * 12, y / W * 12, 3, 12, 12) * 0.5 + noise(x / W * 400, y / W * 400, 400, 400) * 0.5;
    const f = 0.88 + n * 0.24;
    const i = (y * W + x) * 4;
    img.data[i] = Math.min(255, C[0] * f); img.data[i + 1] = Math.min(255, C[1] * f); img.data[i + 2] = Math.min(255, C[2] * f); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const out = { map: finish(cv, { repeat: o.repeat }) };
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- clam shell (white go stones)
export function shellTexture() {
  const key = 'shell';
  if (cache.has(key)) return cache.get(key);
  const W = 512;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, W);
  const { fbm } = makeNoise(7);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const v = y / W;
    const band = Math.sin((v * 34 + fbm(x / 120, y / 120, 3) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
    const f = 0.93 + band * 0.07;
    const i = (y * W + x) * 4;
    img.data[i] = 246 * f; img.data[i + 1] = 243 * f; img.data[i + 2] = 234 * f; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const out = { map: finish(cv) };
  cache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- generic painted canvas
// draw(ctx, w, h) paints the canvas. Cached by key.
export function paintedTexture(key, w, h, draw, opts = {}) {
  const k = 'paint:' + key;
  if (cache.has(k)) return cache.get(k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = finish(cv, opts);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(k, t);
  return t;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
