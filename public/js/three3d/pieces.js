import * as THREE from '/vendor/three.module.js';

// Procedural Staunton-style chess pieces. Each is built from a lathed profile
// (radius, height) so it reads as a real turned-wood/marble piece, with a few
// extra bits (rook crenellations, king cross, queen crown, knight head).
// Returned groups sit on the y=0 plane and are scaled to a ~0.9-unit square.

function lathe(profile, seg = 48) {
  const pts = profile.map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  return g;
}

// Common pedestal shared by every piece: a wide foot tapering to a stem.
function base(topR, h) {
  return [
    [0.001, 0], [0.30, 0], [0.31, 0.02], [0.29, 0.05], [0.24, 0.09],
    [0.20, 0.12], [0.175, 0.17], [topR, h]
  ];
}

const PROFILES = {
  p() { // pawn
    return [...base(0.11, 0.24), [0.10, 0.30], [0.135, 0.34], [0.11, 0.40], [0.001, 0.40]];
  },
  r() { // rook body (crenellations added separately)
    return [...base(0.135, 0.26), [0.125, 0.42], [0.185, 0.46], [0.185, 0.54], [0.001, 0.54]];
  },
  b() { // bishop
    return [...base(0.10, 0.30), [0.095, 0.44], [0.145, 0.49], [0.10, 0.55],
      [0.075, 0.60], [0.11, 0.63], [0.06, 0.70], [0.001, 0.72]];
  },
  n() { // knight pedestal only; head extruded on top
    return [...base(0.12, 0.26), [0.11, 0.34], [0.15, 0.38], [0.13, 0.42], [0.001, 0.42]];
  },
  q() { // queen
    return [...base(0.115, 0.34), [0.10, 0.52], [0.16, 0.57], [0.12, 0.63],
      [0.145, 0.70], [0.09, 0.74], [0.001, 0.76]];
  },
  k() { // king (cross added separately)
    return [...base(0.12, 0.36), [0.105, 0.56], [0.17, 0.61], [0.125, 0.68],
      [0.15, 0.76], [0.10, 0.80], [0.11, 0.86], [0.001, 0.86]];
  }
};

function knightHead(mat) {
  // Stylised horse-head silhouette, extruded to give the knight real depth.
  const s = new THREE.Shape();
  s.moveTo(-0.02, 0.42);
  s.lineTo(0.11, 0.44);
  s.quadraticCurveTo(0.22, 0.44, 0.20, 0.30);
  s.quadraticCurveTo(0.19, 0.22, 0.10, 0.20);
  s.quadraticCurveTo(0.16, 0.15, 0.10, 0.06);
  s.lineTo(-0.14, 0.06);
  s.quadraticCurveTo(-0.10, 0.20, -0.14, 0.30);
  s.quadraticCurveTo(-0.16, 0.42, -0.02, 0.42);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, steps: 1 });
  geo.center();
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.60; m.rotation.y = Math.PI / 2;
  m.castShadow = true;
  return m;
}

export function buildPiece(type, mat) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(lathe(PROFILES[type]()), mat);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  if (type === 'r') {
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), mat);
      const a = (i / 6) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.15, 0.575, Math.sin(a) * 0.15);
      b.castShadow = true; g.add(b);
    }
  }
  if (type === 'k') {
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.20, 0.05), mat);
    v.position.y = 0.96; v.castShadow = true; g.add(v);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.05), mat);
    h.position.y = 0.98; h.castShadow = true; g.add(h);
  }
  if (type === 'q') {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), mat);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.09, 0.80, Math.sin(a) * 0.09);
      s.castShadow = true; g.add(s);
    }
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), mat);
    top.position.y = 0.80; top.castShadow = true; g.add(top);
  }
  if (type === 'b') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), mat);
    ball.position.y = 0.755; ball.castShadow = true; g.add(ball);
  }
  if (type === 'n') g.add(knightHead(mat));

  return g;
}

export const PIECE_HEIGHT = { p: 0.40, r: 0.60, n: 0.62, b: 0.75, q: 0.86, k: 1.05 };
