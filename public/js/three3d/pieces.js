import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, feltTexture } from './textures.js';

// Hand-authored Staunton chess set. Every piece is turned on a lathe from a
// profile built out of lines, arcs and bezier curves, so collars stay crisp
// and heads stay round. White is lacquered boxwood, black is ebony, and each
// piece stands on a green felt pad. Geometry is shared between instances.

class Profile {
  constructor() { this.pts = []; }
  at(x, y) { this.pts.push([x, y]); return this; }
  line(x, y) { return this.at(x, y); }
  bez(cx, cy, x, y, n = 10) {
    const [x0, y0] = this.pts[this.pts.length - 1];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
    return this;
  }
  arc(cx, cy, r, a0, a1, n = 16) {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      this.pts.push([Math.max(0, cx + Math.cos(a) * r), cy + Math.sin(a) * r]);
    }
    return this;
  }
  geo(seg = 56) {
    const p = this.pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0005, x), y));
    const g = new THREE.LatheGeometry(p, seg);
    g.computeVertexNormals();
    return g;
  }
}

// Weighted foot: rounded edge, cove, bead, then into the stem.
function foot(p, s = 1) {
  return p.at(0, 0).line(0.35 * s, 0)
    .bez(0.385 * s, 0.012, 0.378 * s, 0.045)
    .bez(0.372 * s, 0.07, 0.33 * s, 0.078)
    .bez(0.29 * s, 0.086, 0.3 * s, 0.118)
    .bez(0.325 * s, 0.14, 0.298 * s, 0.165)
    .bez(0.27 * s, 0.186, 0.225 * s, 0.195);
}
function collar(p, y, rIn, rOut) {
  return p.line(rIn, y).bez(rOut + 0.012, y + 0.004, rOut, y + 0.018, 4)
    .line(rOut, y + 0.03).bez(rOut + 0.004, y + 0.044, rIn * 0.98, y + 0.05, 4);
}

const R = Math.PI / 2;
const BUILD = {
  p() {
    const p = foot(new Profile(), 0.9);
    p.bez(0.14, 0.24, 0.115, 0.37);
    collar(p, 0.37, 0.115, 0.2);
    p.line(0.1, 0.43);
    const cy = 0.565, r = 0.155;
    const a0 = Math.asin(-Math.sqrt(1 - (0.1 / r) ** 2));
    p.arc(0, cy, r, a0, R, 22);
    return [p.geo()];
  },
  r() {
    const p = foot(new Profile(), 0.98);
    p.bez(0.17, 0.34, 0.175, 0.56);
    collar(p, 0.56, 0.175, 0.245);
    p.line(0.19, 0.62).bez(0.2, 0.7, 0.262, 0.76).line(0.262, 0.8)
      .line(0.2, 0.8).line(0.2, 0.77).line(0, 0.77);
    const parts = [p.geo()];
    // Six merlons around the parapet.
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + 0.2, a1 = a0 + (Math.PI * 2 / 6) * 0.62;
      const s = new THREE.Shape();
      s.absarc(0, 0, 0.262, a0, a1, false);
      s.absarc(0, 0, 0.2, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 });
      g.rotateX(-R); g.translate(0, 0.8, 0);
      parts.push(g);
    }
    return parts;
  },
  b() {
    const p = foot(new Profile(), 0.95);
    p.bez(0.13, 0.33, 0.115, 0.52);
    collar(p, 0.52, 0.115, 0.2);
    collar(p, 0.575, 0.12, 0.17);
    p.line(0.1, 0.64)
      .bez(0.21, 0.72, 0.185, 0.84)
      .bez(0.16, 0.95, 0.07, 1.0)
      .line(0.04, 1.01);
    p.arc(0, 1.055, 0.05, -Math.PI / 2 + 0.3, R, 10);
    const slit = new THREE.BoxGeometry(0.03, 0.2, 0.4);
    slit.rotateZ(-0.62); slit.translate(0.07, 0.86, 0);
    return [p.geo(), { geo: slit, dark: true }];
  },
  n() {
    const p = foot(new Profile(), 0.98);
    p.bez(0.2, 0.25, 0.235, 0.285).line(0.24, 0.31).line(0, 0.31);
    const s = new THREE.Shape();
    s.moveTo(-0.22, 0);
    s.lineTo(0.2, 0);
    s.quadraticCurveTo(0.27, 0.1, 0.14, 0.22);
    s.quadraticCurveTo(0.2, 0.26, 0.3, 0.3);
    s.quadraticCurveTo(0.37, 0.335, 0.335, 0.405);
    s.quadraticCurveTo(0.3, 0.47, 0.2, 0.52);
    s.lineTo(0.1, 0.6);
    s.lineTo(0.085, 0.69);
    s.lineTo(0.03, 0.625);
    s.lineTo(-0.02, 0.71);
    s.quadraticCurveTo(-0.1, 0.63, -0.145, 0.52);
    s.quadraticCurveTo(-0.27, 0.36, -0.225, 0.18);
    s.quadraticCurveTo(-0.2, 0.08, -0.22, 0);
    const head = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 5, curveSegments: 14 });
    head.translate(0, 0, -0.1);
    head.rotateY(R);                 // forward (+x) -> -z
    head.translate(0, 0.3, 0);
    head.computeVertexNormals();
    const eyeL = new THREE.SphereGeometry(0.02, 10, 8); eyeL.translate(-0.148, 0.82, -0.15);
    const eyeR = new THREE.SphereGeometry(0.02, 10, 8); eyeR.translate(0.148, 0.82, -0.15);
    const nostril = new THREE.SphereGeometry(0.022, 8, 6); nostril.translate(0, 0.68, -0.34);
    return [p.geo(), head, { geo: eyeL, dark: true }, { geo: eyeR, dark: true }, { geo: nostril, dark: true }];
  },
  q() {
    const p = foot(new Profile(), 1.04);
    p.bez(0.14, 0.4, 0.12, 0.64);
    collar(p, 0.64, 0.12, 0.215);
    collar(p, 0.7, 0.125, 0.18);
    p.line(0.12, 0.77)
      .bez(0.14, 0.9, 0.245, 0.98)
      .line(0.245, 1.0).line(0.18, 1.0)
      .bez(0.19, 1.07, 0.06, 1.1).line(0.05, 1.11);
    p.arc(0, 1.16, 0.06, -Math.PI / 2 + 0.25, R, 12);
    const parts = [p.geo()];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const g = new THREE.SphereGeometry(0.03, 12, 10);
      g.translate(Math.cos(a) * 0.23, 1.02, Math.sin(a) * 0.23);
      parts.push(g);
    }
    return parts;
  },
  k() {
    const p = foot(new Profile(), 1.05);
    p.bez(0.15, 0.42, 0.13, 0.69);
    collar(p, 0.69, 0.13, 0.225);
    collar(p, 0.75, 0.135, 0.19);
    p.line(0.13, 0.82)
      .bez(0.15, 0.95, 0.235, 1.03)
      .line(0.235, 1.06)
      .bez(0.17, 1.1, 0.07, 1.14).line(0.06, 1.15).line(0, 1.16);
    const v = new RoundedBoxGeometry(0.075, 0.28, 0.075, 2, 0.02); v.translate(0, 1.28, 0);
    const h = new RoundedBoxGeometry(0.22, 0.075, 0.075, 2, 0.02); h.translate(0, 1.31, 0);
    return [p.geo(), v, h];
  }
};

const geoCache = {};
function partsFor(type) {
  if (!geoCache[type]) geoCache[type] = BUILD[type]().map(x => (x.isBufferGeometry ? { geo: x } : x));
  return geoCache[type];
}

let mats = null;
export function pieceMaterials() {
  if (mats) return mats;
  const box = woodTexture({ light: 0xf3e2bd, dark: 0xd8b77f, rings: 3, seed: 21, figure: 0.6, size: 512, streak: 0.25 });
  const ebony = woodTexture({ light: 0x3b2819, dark: 0x0f0906, rings: 5, seed: 22, figure: 0.8, size: 512, streak: 0.4 });
  const vert = t => { const c = t.clone(); c.center.set(0.5, 0.5); c.rotation = Math.PI / 2; c.repeat.set(1, 2); c.needsUpdate = true; return c; };
  const felt = feltTexture(0x1d5a36, { size: 256, repeat: [1, 1] });
  mats = {
    w: new THREE.MeshPhysicalMaterial({ map: vert(box.map), bumpMap: vert(box.bump), bumpScale: 0.25, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.22, envMapIntensity: 0.55 }),
    b: new THREE.MeshPhysicalMaterial({ map: vert(ebony.map), bumpMap: vert(ebony.bump), bumpScale: 0.25, roughness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.22, envMapIntensity: 0.32 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0b0806, roughness: 0.6 }),
    felt: new THREE.MeshStandardMaterial({ map: felt.map, roughness: 1 })
  };
  return mats;
}

const padGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.014, 40);

// color: 'w' | 'b'
export function buildPiece(type, color) {
  const m = pieceMaterials();
  const g = new THREE.Group();
  const body = color === 'w' ? m.w : m.b;
  for (const part of partsFor(type)) {
    const mesh = new THREE.Mesh(part.geo, part.dark ? m.dark : body);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.y = 0.012;
    g.add(mesh);
  }
  const pad = new THREE.Mesh(padGeo, m.felt);
  pad.position.y = 0.007;
  g.add(pad);
  if (type === 'n' && color === 'b') g.rotation.y = Math.PI;
  g.userData.bodies = g.children.filter(c => c.material === body);
  return g;
}

export const PIECE_HEIGHT = { p: 0.73, r: 0.92, n: 1.02, b: 1.12, q: 1.23, k: 1.4 };
