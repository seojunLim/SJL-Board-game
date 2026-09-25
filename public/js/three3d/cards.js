import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { paintedTexture, roundRect } from './textures.js';

// Printed cards and tiles: thin rounded card bodies with a painted face and
// back, plus the artwork for UNO, Halli Galli and Da Vinci Code, all drawn on
// canvases at load time.

// ------------------------------------------------------------ card mesh
const geoCache = {};
function roundedShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function cardGeos(w, h, t) {
  const k = [w, h, t].join('x');
  if (geoCache[k]) return geoCache[k];
  const r = Math.min(w, h) * 0.08;
  const shape = roundedShape(w, h, r);
  const face = new THREE.ShapeGeometry(shape, 8);
  const pos = face.attributes.position, uv = face.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5);
  const front = face.clone().rotateX(-Math.PI / 2).translate(0, t / 2 + 0.0005, 0);
  const back = face.clone().rotateY(Math.PI).rotateX(-Math.PI / 2).translate(0, -t / 2 - 0.0005, 0);
  // back: mirror so the artwork reads correctly when the card is flipped
  const edge = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 6 });
  edge.translate(0, 0, -t / 2).rotateX(-Math.PI / 2);
  return (geoCache[k] = { front, back, edge });
}

const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 });
const matCache = new Map();
function faceMat(tex, gloss) {
  const k = tex.uuid + gloss;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshPhysicalMaterial({ map: tex, roughness: gloss ? 0.42 : 0.6, clearcoat: gloss ? 0.45 : 0.1, clearcoatRoughness: 0.35, envMapIntensity: 0.35 }));
  return matCache.get(k);
}

// A card lying face-up (+y). Use rotation.z = PI to show the back.
export function cardMesh(frontTex, backTex, { w = 1.1, h = 1.7, t = 0.012, gloss = true } = {}) {
  const g = cardGeos(w, h, t);
  const grp = new THREE.Group();
  const f = new THREE.Mesh(g.front, faceMat(frontTex, gloss));
  const b = new THREE.Mesh(g.back, faceMat(backTex, gloss));
  const e = new THREE.Mesh(g.edge, edgeMat);
  for (const m of [f, b, e]) { m.castShadow = true; m.receiveShadow = true; grp.add(m); }
  grp.userData.front = f;
  grp.userData.back = b;
  return grp;
}
export function setCardFront(card, tex, gloss = true) { card.userData.front.material = faceMat(tex, gloss); }

// A neat deck: one box with the back printed on top.
export function deckMesh(backTex, count, { w = 1.1, h = 1.7, t = 0.012 } = {}) {
  const thick = Math.max(t, count * t * 0.9);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, thick, h, 2, Math.min(0.05, thick / 2.1)), new THREE.MeshStandardMaterial({ color: 0xece7da, roughness: 0.8 }));
  body.position.y = thick / 2; body.castShadow = body.receiveShadow = true;
  const g = cardGeos(w, h, t);
  const top = new THREE.Mesh(g.front, faceMat(backTex, true));
  top.position.y = thick - t / 2 + 0.001; top.receiveShadow = true;
  grp.add(body, top);
  grp.userData.height = thick;
  return grp;
}

// ------------------------------------------------------------ UNO art
export const UNO_COLORS = { r: '#d7261e', y: '#f4c20d', g: '#2e9a3e', b: '#1d6bc6', w: '#161616' };
const UNO_FONT = s => `italic 900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;

function outlinedText(g, text, x, y, size, fill, stroke = '#111', lw = size * 0.09, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = UNO_FONT(size); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(text, size * 0.05, size * 0.06);
  g.strokeStyle = stroke; g.lineWidth = lw; g.strokeText(text, 0, 0);
  g.fillStyle = fill; g.fillText(text, 0, 0);
  g.restore();
}
function skipIcon(g, x, y, s, color) {
  g.save(); g.translate(x, y);
  g.lineWidth = s * 0.34;
  g.strokeStyle = '#111'; g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.7, s * 0.7); g.lineTo(s * 0.7, -s * 0.7); g.stroke();
  g.lineWidth = s * 0.22; g.strokeStyle = color;
  g.beginPath(); g.arc(0, 0, s, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.7, s * 0.7); g.lineTo(s * 0.7, -s * 0.7); g.stroke();
  g.restore();
}
function reverseIcon(g, x, y, s, color) {
  g.save(); g.translate(x, y); g.rotate(-Math.PI / 4);
  for (const d of [0, 1]) {
    g.save(); g.translate(d ? s * 0.32 : -s * 0.32, 0); g.rotate(d ? Math.PI : 0);
    g.beginPath();
    g.moveTo(-s * 0.16, s * 0.85); g.lineTo(-s * 0.16, -s * 0.15); g.lineTo(-s * 0.46, -s * 0.15);
    g.lineTo(0, -s * 0.85); g.lineTo(s * 0.46, -s * 0.15); g.lineTo(s * 0.16, -s * 0.15); g.lineTo(s * 0.16, s * 0.85);
    g.closePath();
    g.lineJoin = 'round'; g.lineWidth = s * 0.14; g.strokeStyle = '#111'; g.stroke();
    g.fillStyle = color; g.fill();
    g.restore();
  }
  g.restore();
}
function miniCards(g, x, y, s, colors) {
  // stacked mini cards (Draw Two / Wild Draw Four artwork)
  const n = colors.length;
  colors.forEach((c, i) => {
    const dx = (i - (n - 1) / 2) * s * 0.42, dy = (i - (n - 1) / 2) * -s * 0.3;
    g.save(); g.translate(x + dx, y + dy); g.rotate(-0.08);
    roundRect(g, -s * 0.36, -s * 0.54, s * 0.72, s * 1.08, s * 0.1);
    g.fillStyle = '#fff'; g.fill(); g.lineWidth = s * 0.05; g.strokeStyle = '#111'; g.stroke();
    roundRect(g, -s * 0.28, -s * 0.46, s * 0.56, s * 0.92, s * 0.07);
    g.fillStyle = c; g.fill();
    g.restore();
  });
}

export function unoFaceTexture(card) {
  const k = `uno-${card.color}-${card.kind}-${card.value ?? ''}`;
  return paintedTexture(k, 512, 794, (g, W, H) => {
    const col = UNO_COLORS[card.color] || UNO_COLORS.w;
    g.fillStyle = '#fbfbf8'; roundRect(g, 0, 0, W, H, 44); g.fill();
    const inset = 30;
    g.fillStyle = card.kind === 'wild' || card.kind === 'wd4' ? '#141414' : col;
    roundRect(g, inset, inset, W - inset * 2, H - inset * 2, 30); g.fill();
    // subtle print texture
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, 'rgba(255,255,255,0.12)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = grd; roundRect(g, inset, inset, W - inset * 2, H - inset * 2, 30); g.fill();
    // tilted white oval
    g.save(); g.translate(W / 2, H / 2); g.rotate(0.52);
    g.beginPath(); g.ellipse(0, 0, W * 0.34, H * 0.4, 0, 0, Math.PI * 2);
    if (card.kind === 'wild' || card.kind === 'wd4') {
      g.clip();
      const q = [UNO_COLORS.r, UNO_COLORS.b, UNO_COLORS.y, UNO_COLORS.g];
      for (let i = 0; i < 4; i++) {
        g.fillStyle = q[i];
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, H, i * Math.PI / 2, (i + 1) * Math.PI / 2); g.closePath(); g.fill();
      }
    } else { g.fillStyle = '#fbfbf8'; g.fill(); }
    g.restore();
    const big = H * 0.34, small = H * 0.1;
    const cx = W / 2, cy = H / 2;
    let corner = '';
    if (card.kind === 'num') {
      outlinedText(g, String(card.value), cx, cy + 6, big, col, '#111', big * 0.07);
      if (card.value === 6 || card.value === 9) { g.fillStyle = col; g.strokeStyle = '#111'; g.lineWidth = 4; g.fillRect(cx - 44, cy + big * 0.44, 88, 12); g.strokeRect(cx - 44, cy + big * 0.44, 88, 12); }
      corner = String(card.value);
    } else if (card.kind === 'skip') { skipIcon(g, cx, cy, big * 0.34, col); corner = '⊘'; }
    else if (card.kind === 'rev') { reverseIcon(g, cx, cy, big * 0.46, col); corner = '⇄'; }
    else if (card.kind === 'd2') { miniCards(g, cx, cy, big * 0.5, [col, col]); corner = '+2'; }
    else if (card.kind === 'wd4') { miniCards(g, cx, cy, big * 0.44, [UNO_COLORS.b, UNO_COLORS.g, UNO_COLORS.y, UNO_COLORS.r]); corner = '+4'; }
    else if (card.kind === 'wild') { corner = ''; }
    const drawCorner = (x, y, rot) => {
      if (card.kind === 'skip') { g.save(); g.translate(x, y); g.rotate(rot); skipIcon(g, 0, 0, small * 0.34, '#fff'); g.restore(); return; }
      if (card.kind === 'rev') { g.save(); g.translate(x, y); g.rotate(rot); reverseIcon(g, 0, 0, small * 0.42, '#fff'); g.restore(); return; }
      if (card.kind === 'wild') {
        g.save(); g.translate(x, y); g.rotate(rot + 0.52);
        const q = [UNO_COLORS.r, UNO_COLORS.b, UNO_COLORS.y, UNO_COLORS.g];
        for (let i = 0; i < 4; i++) { g.fillStyle = q[i]; g.beginPath(); g.moveTo(0, 0); g.ellipse(0, 0, small * 0.34, small * 0.46, 0, i * Math.PI / 2, (i + 1) * Math.PI / 2); g.closePath(); g.fill(); }
        g.restore(); return;
      }
      outlinedText(g, corner, x, y, small, '#fff', '#111', small * 0.12, rot);
    };
    drawCorner(inset + 48, inset + 58, 0);
    drawCorner(W - inset - 48, H - inset - 58, Math.PI);
  });
}

export function unoBackTexture() {
  return paintedTexture('uno-back', 512, 794, (g, W, H) => {
    g.fillStyle = '#fbfbf8'; roundRect(g, 0, 0, W, H, 44); g.fill();
    g.fillStyle = '#121212'; roundRect(g, 30, 30, W - 60, H - 60, 30); g.fill();
    g.save(); g.translate(W / 2, H / 2); g.rotate(0.52);
    g.beginPath(); g.ellipse(0, 0, W * 0.34, H * 0.4, 0, 0, Math.PI * 2); g.fillStyle = '#d7261e'; g.fill();
    g.restore();
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.28);
    g.font = UNO_FONT(170); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.fillStyle = '#111'; g.fillText('UNO', 12, 14);
    g.lineWidth = 18; g.strokeStyle = '#111'; g.strokeText('UNO', 0, 0);
    g.fillStyle = '#f7d117'; g.fillText('UNO', 0, 0);
    g.restore();
  });
}

// ------------------------------------------------------------ Halli Galli art
function banana(g, s) {
  g.save(); g.rotate(-0.35);
  g.beginPath();
  g.moveTo(-s * 0.95, -s * 0.2);
  g.quadraticCurveTo(-s * 0.2, s * 0.95, s * 0.95, -s * 0.12);
  g.quadraticCurveTo(s * 0.9, -s * 0.02, s * 0.82, -s * 0.02);
  g.quadraticCurveTo(-s * 0.1, s * 0.5, -s * 0.78, -s * 0.34);
  g.closePath();
  const gr = g.createLinearGradient(0, -s * 0.3, 0, s * 0.6);
  gr.addColorStop(0, '#fff07a'); gr.addColorStop(0.6, '#f7cf1d'); gr.addColorStop(1, '#d99a0a');
  g.fillStyle = gr; g.fill();
  g.lineWidth = s * 0.07; g.strokeStyle = '#6b4a05'; g.lineJoin = 'round'; g.stroke();
  g.beginPath(); g.moveTo(-s * 0.55, -s * 0.05); g.quadraticCurveTo(0, s * 0.5, s * 0.55, s * 0.1);
  g.lineWidth = s * 0.035; g.strokeStyle = 'rgba(160,110,10,0.6)'; g.stroke();
  g.fillStyle = '#4d3308';
  g.beginPath(); g.ellipse(-s * 0.9, -s * 0.28, s * 0.09, s * 0.06, 0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(s * 0.92, -s * 0.07, s * 0.07, s * 0.05, -0.3, 0, Math.PI * 2); g.fill();
  g.restore();
}
function strawberry(g, s) {
  g.beginPath();
  g.moveTo(0, s * 0.95);
  g.bezierCurveTo(-s * 0.95, s * 0.2, -s * 0.85, -s * 0.72, 0, -s * 0.55);
  g.bezierCurveTo(s * 0.85, -s * 0.72, s * 0.95, s * 0.2, 0, s * 0.95);
  const gr = g.createRadialGradient(-s * 0.25, -s * 0.2, s * 0.1, 0, 0, s);
  gr.addColorStop(0, '#ff7a6e'); gr.addColorStop(0.5, '#e8212b'); gr.addColorStop(1, '#a70d18');
  g.fillStyle = gr; g.fill();
  g.lineWidth = s * 0.07; g.strokeStyle = '#6e0810'; g.stroke();
  g.fillStyle = '#ffe27a';
  for (let yy = -0.3; yy < 0.8; yy += 0.24) for (let xx = -0.6; xx <= 0.6; xx += 0.26) {
    const x = xx + (Math.round(yy / 0.24) % 2 ? 0.13 : 0);
    if (Math.abs(x) > 0.72 - (yy + 0.3) * 0.45) continue;
    g.beginPath(); g.ellipse(x * s, yy * s, s * 0.035, s * 0.055, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#2f9a3a'; g.strokeStyle = '#17561c'; g.lineWidth = s * 0.04;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.55;
    g.beginPath(); g.moveTo(0, -s * 0.55);
    g.quadraticCurveTo(Math.cos(a - 0.35) * s * 0.5, -s * 0.55 + Math.sin(a - 0.35) * s * 0.3, Math.cos(a) * s * 0.55, -s * 0.55 + Math.sin(a) * s * 0.28 + s * 0.12);
    g.quadraticCurveTo(Math.cos(a + 0.35) * s * 0.5, -s * 0.55 + Math.sin(a + 0.35) * s * 0.3, 0, -s * 0.55);
    g.fill(); g.stroke();
  }
}
function lime(g, s) {
  g.beginPath(); g.ellipse(0, 0, s * 0.85, s * 0.75, -0.3, 0, Math.PI * 2);
  const gr = g.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s * 0.9);
  gr.addColorStop(0, '#c9f27a'); gr.addColorStop(0.55, '#6cc12e'); gr.addColorStop(1, '#2f7d14');
  g.fillStyle = gr; g.fill();
  g.lineWidth = s * 0.07; g.strokeStyle = '#1f5a0b'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath(); g.ellipse(-s * 0.35, -s * 0.3, s * 0.2, s * 0.1, -0.7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3f7d1a'; g.beginPath(); g.ellipse(s * 0.78, -s * 0.3, s * 0.09, s * 0.06, -0.3, 0, Math.PI * 2); g.fill();
}
function plum(g, s) {
  g.beginPath(); g.arc(0, s * 0.08, s * 0.82, 0, Math.PI * 2);
  const gr = g.createRadialGradient(-s * 0.3, -s * 0.2, s * 0.08, 0, s * 0.08, s * 0.85);
  gr.addColorStop(0, '#d9a2ef'); gr.addColorStop(0.45, '#8e3bb3'); gr.addColorStop(1, '#4a1265');
  g.fillStyle = gr; g.fill();
  g.lineWidth = s * 0.07; g.strokeStyle = '#2d0a40'; g.stroke();
  g.beginPath(); g.moveTo(0, -s * 0.55); g.quadraticCurveTo(s * 0.05, s * 0.2, -s * 0.05, s * 0.85);
  g.lineWidth = s * 0.03; g.strokeStyle = 'rgba(45,10,64,0.5)'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.beginPath(); g.ellipse(-s * 0.35, -s * 0.2, s * 0.14, s * 0.09, -0.6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5a3a14'; g.lineWidth = s * 0.07; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -s * 0.7); g.quadraticCurveTo(s * 0.05, -s * 0.95, s * 0.18, -s * 1.02); g.stroke();
  g.fillStyle = '#3a9a36'; g.strokeStyle = '#1b5a18'; g.lineWidth = s * 0.035;
  g.beginPath(); g.moveTo(s * 0.06, -s * 0.85); g.quadraticCurveTo(s * 0.45, -s * 1.15, s * 0.7, -s * 0.9); g.quadraticCurveTo(s * 0.4, -s * 0.7, s * 0.06, -s * 0.85); g.fill(); g.stroke();
}
const FRUIT = { banana, strawberry, lime, plum };
const PIPS = {
  1: [[0.5, 0.5]],
  2: [[0.32, 0.3], [0.68, 0.7]],
  3: [[0.28, 0.24], [0.5, 0.5], [0.72, 0.76]],
  4: [[0.3, 0.27], [0.7, 0.27], [0.3, 0.73], [0.7, 0.73]],
  5: [[0.28, 0.22], [0.72, 0.22], [0.5, 0.5], [0.28, 0.78], [0.72, 0.78]]
};
export function galliFaceTexture(card) {
  return paintedTexture(`hg-${card.fruit}-${card.n}`, 512, 768, (g, W, H) => {
    g.fillStyle = '#fdfcf7'; roundRect(g, 0, 0, W, H, 40); g.fill();
    g.strokeStyle = '#d7d0bd'; g.lineWidth = 8; roundRect(g, 18, 18, W - 36, H - 36, 28); g.stroke();
    const s = card.n === 1 ? W * 0.34 : card.n === 2 ? W * 0.24 : card.n === 3 ? W * 0.19 : W * 0.17;
    for (const [x, y] of PIPS[card.n]) {
      g.save(); g.translate(x * W, y * H);
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.ellipse(s * 0.1, s * 0.95, s * 0.75, s * 0.14, 0, 0, Math.PI * 2); g.fill();
      FRUIT[card.fruit](g, s);
      g.restore();
    }
  });
}
export function galliBackTexture() {
  return paintedTexture('hg-back', 512, 768, (g, W, H) => {
    g.fillStyle = '#fdfcf7'; roundRect(g, 0, 0, W, H, 40); g.fill();
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#1f3f8f'); gr.addColorStop(1, '#0f1f4f');
    g.fillStyle = gr; roundRect(g, 18, 18, W - 36, H - 36, 28); g.fill();
    g.globalAlpha = 0.14; g.fillStyle = '#fff';
    for (let y = 40; y < H; y += 56) for (let x = 40 + ((y / 56) % 2) * 28; x < W; x += 56) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.2);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(0, 0, 170, 90, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#b3232a'; g.lineWidth = 10; g.stroke();
    g.font = 'italic 900 74px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#b3232a'; g.fillText('HALLI', 0, -24); g.fillText('GALLI', 0, 44);
    g.restore();
  });
}

// ------------------------------------------------------------ Da Vinci tiles
export function davinciFaceTexture(color, v) {
  const joker = v === 12;
  return paintedTexture(`dv-${color}-${v}`, 256, 384, (g, W, H) => {
    const bg = color === 'b' ? '#17171a' : '#f4f2ec', fg = color === 'b' ? '#f4f2ec' : '#17171a';
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${joker ? 200 : 188}px "Helvetica Neue", Arial, sans-serif`;
    g.fillText(joker ? '–' : String(v), W / 2, H / 2 + 8);
    if (v === 6 || v === 9) g.fillRect(W / 2 - 36, H / 2 + 92, 72, 12);
    g.strokeStyle = color === 'b' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; g.lineWidth = 6;
    g.strokeRect(14, 14, W - 28, H - 28);
  });
}
