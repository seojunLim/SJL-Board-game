import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { woodTexture, feltTexture, setMaxAnisotropy, roundRect } from './textures.js';

// Shared 3D stage for every game: a lamp-lit wooden table in a dark room.
//  - ACES filmic tone mapping + a room environment map for real reflections
//  - a warm pendant spotlight with soft shadows, a cool rim light
//  - damped orbit camera (drag / wheel / pinch), raycast picking + hover
//  - a small tween engine for piece animations
// Renderers call render(state, seat) and destroy() exactly like before.

export const EASE = {
  linear: k => k,
  outCubic: k => 1 - Math.pow(1 - k, 3),
  inOutCubic: k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: k => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); },
  outBounce: k => {
    const n1 = 7.5625, d1 = 2.75;
    if (k < 1 / d1) return n1 * k * k;
    if (k < 2 / d1) return n1 * (k -= 1.5 / d1) * k + 0.75;
    if (k < 2.5 / d1) return n1 * (k -= 2.25 / d1) * k + 0.9375;
    return n1 * (k -= 2.625 / d1) * k + 0.984375;
  }
};

const BG = 0x0d0b0a;

export class Stage {
  constructor(mount, opts = {}) {
    this.mount = mount;
    this.opts = opts;
    this.pickables = [];
    this.onPick = null;
    this.onHover = null;
    this.tick = null;
    this._tweens = [];

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure || 1.05;
    renderer.setClearColor(BG, 1);
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
    this.renderer = renderer;
    const el = renderer.domElement;
    el.className = 'stage3d';
    mount.appendChild(el);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    scene.fog = new THREE.Fog(BG, 22, 48);
    this.scene = scene;

    // Image-based lighting from a neutral studio room.
    this._pmrem = new THREE.PMREMGenerator(renderer);
    this._env = this._pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    scene.environment = this._env;

    const cam = opts.camera || {};
    this.camera = new THREE.PerspectiveCamera(cam.fov || 38, 1, 0.1, 120);
    this.target = new THREE.Vector3(...(cam.target || [0, 0, 0]));
    this.view = { theta: cam.theta ?? 0, phi: cam.phi ?? 0.8, radius: cam.radius ?? 14 };
    this.cur = { ...this.view };
    this.lim = {
      minR: cam.minR ?? this.view.radius * 0.6, maxR: cam.maxR ?? this.view.radius * 1.6,
      minPhi: cam.minPhi ?? 0.12, maxPhi: cam.maxPhi ?? 1.32
    };

    this._lights(opts);
    if (opts.table !== false) this._table(opts);

    this._bind();
    this._running = true;
    this._last = performance.now();
    this._loop = this._loop.bind(this);
    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(mount);
    this._raf = requestAnimationFrame(this._loop);
  }

  _lights(opts) {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xfff1e0, 0x20150d, 0.22));
    const lamp = new THREE.SpotLight(0xffe2bd, opts.lamp || 3.6, 0, 0.5, 0.9, 0);
    lamp.position.set(2.5, 17, 5.5);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.00015;
    lamp.shadow.normalBias = 0.02;
    lamp.shadow.camera.near = 6; lamp.shadow.camera.far = 36;
    lamp.shadow.radius = 4;
    s.add(lamp, lamp.target);
    this.lamp = lamp;
    const rim = new THREE.DirectionalLight(0xa9c1ff, 0.4);
    rim.position.set(-9, 7, -10);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0xffd9b0, 0.12);
    fill.position.set(8, 4, 10);
    s.add(fill);
  }

  _table(opts) {
    const wood = woodTexture({ light: 0x553520, dark: 0x24150b, rings: 2, planks: 5, seed: 11, repeat: [7, 7], figure: 1.1, streak: 0.55 });
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 0.35, roughness: 0.7, metalness: 0, envMapIntensity: 0.25 })
    );
    table.position.y = opts.tableY ?? -0.02;
    table.receiveShadow = true;
    this.scene.add(table);
    this.matTop = table.position.y;
    this.tableMesh = table;
    if (opts.mat) {
      const m = opts.mat;
      const shape = new THREE.Shape();
      const w = m.w, h = m.h, r = m.r ?? 0.8;
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 16 });
      geo.rotateX(-Math.PI / 2);
      remapPlanarUV(geo, w, h, 'xz');
      const felt = feltTexture(m.color || 0x1b5e3c, { repeat: [w / 3, h / 3] });
      const mat = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        map: felt.map, roughness: 0.95, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(m.sheen || 0x6fbf8f), envMapIntensity: 0.2
      }));
      mat.position.y = table.position.y + 0.005;
      mat.receiveShadow = true;
      this.matTop = mat.position.y + 0.05 + 0.02;
      this.scene.add(mat);
      this.matMesh = mat;
    }
  }

  setPickables(list) { this.pickables = list; }

  setView(v, animate = true) {
    Object.assign(this.view, v);
    if (!animate) Object.assign(this.cur, this.view);
  }

  // Generic tween: update(k) gets eased 0..1. Returns a handle with cancel().
  tween(dur, update, o = {}) {
    const tw = { t0: performance.now() + (o.delay || 0), dur, update, ease: o.ease || EASE.outCubic, done: o.done, dead: false };
    this._tweens.push(tw);
    if (!o.delay) update(tw.ease(0));
    return { cancel: () => { tw.dead = true; } };
  }

  // Jump every running tween to its end state (e.g. the player clicked mid-animation).
  finishTweens() {
    let guard = 0;
    while (this._tweens.some(t => !t.dead) && guard++ < 10) {
      const list = this._tweens.slice();
      for (const tw of list) {
        if (tw.dead) continue;
        tw.dead = true;
        tw.update(tw.ease(1));
        tw.done && tw.done();
      }
      this._tweens = this._tweens.filter(x => !x.dead);
    }
  }

  _applyCamera() {
    const R = this.cur.radius * (this._aspectBoost || 1);
    const st = Math.sin(this.cur.phi) * R;
    this.camera.position.set(
      this.target.x + st * Math.sin(this.cur.theta),
      this.target.y + Math.cos(this.cur.phi) * R,
      this.target.z + st * Math.cos(this.cur.theta)
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  screenOf(v3) {
    this._applyCamera();
    const p = v3.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  }

  _bind() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointers = new Map();
    let downOnCanvas = false, moved = 0, pinch0 = 0, r0 = 0;

    const setNdc = e => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    this._hit = e => {
      setNdc(e);
      ray.setFromCamera(ndc, this.camera);
      const is = ray.intersectObjects(this.pickables, true);
      for (const i of is) {
        let o = i.object;
        while (o && o.userData.pick === undefined) o = o.parent;
        if (o && o.visible !== false) return { obj: o, pick: o.userData.pick, point: i.point };
      }
      return null;
    };

    this._down = e => {
      downOnCanvas = true; moved = 0;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture?.(e.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y); r0 = this.view.radius;
      }
    };
    this._move = e => {
      const p = pointers.get(e.pointerId);
      if (p) {
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        if (pointers.size === 1 && moved > 4) {
          this.view.theta -= dx * 0.007;
          this.view.phi = clamp(this.view.phi - dy * 0.005, this.lim.minPhi, this.lim.maxPhi);
          el.style.cursor = 'grabbing';
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinch0) this.view.radius = clamp(r0 * pinch0 / d, this.lim.minR, this.lim.maxR);
        }
      } else if (e.target === el && this.onHover && e.pointerType === 'mouse') {
        const h = this._hit(e);
        el.style.cursor = h ? 'pointer' : 'grab';
        this.onHover(h ? h.pick : null, h ? h.point : null, h ? h.obj : null);
      }
    };
    this._up = e => {
      const had = pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch0 = 0;
      if (!had) return;
      el.style.cursor = 'grab';
      if (downOnCanvas && moved <= 6 && pointers.size === 0 && this.onPick) {
        const h = this._hit(e);
        this.onPick(h ? h.pick : null, h ? h.point : null, h ? h.obj : null);
      }
      if (pointers.size === 0) downOnCanvas = false;
    };
    this._leave = () => { if (this.onHover) this.onHover(null, null, null); };
    this._wheel = e => {
      e.preventDefault();
      this.view.radius = clamp(this.view.radius * (1 + Math.sign(e.deltaY) * 0.09), this.lim.minR, this.lim.maxR);
    };
    el.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    window.addEventListener('pointercancel', this._up);
    el.addEventListener('pointerleave', this._leave);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  _resize() {
    const w = Math.max(280, this.mount.clientWidth || 600);
    const ratio = this.opts.aspect || 0.78;
    const h = Math.round(clamp(w * ratio, 340, Math.max(360, window.innerHeight * 0.76)));
    if (w === this._w && h === this._h) return;
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    // Pull the camera back on tall/narrow screens so the whole board fits.
    this._aspectBoost = w / h < 1 ? 1 / Math.max(0.62, w / h) : 1;
    this.camera.updateProjectionMatrix();
  }

  _loop(now) {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.1, (now - this._last) / 1000);
    this._last = now;

    const a = 1 - Math.exp(-dt * 9);
    this.cur.theta += (this.view.theta - this.cur.theta) * a;
    this.cur.phi += (this.view.phi - this.cur.phi) * a;
    this.cur.radius += (this.view.radius - this.cur.radius) * a;
    this._applyCamera();

    const t = performance.now();
    if (this._tweens.length) {
      for (const tw of this._tweens) {
        if (tw.dead || t < tw.t0) continue;
        const k = Math.min(1, (t - tw.t0) / tw.dur);
        tw.update(tw.ease(k));
        if (k >= 1) { tw.dead = true; tw.done && tw.done(); }
      }
      this._tweens = this._tweens.filter(x => !x.dead);
    }
    if (this.tick) this.tick(dt, t);
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    this._ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    window.removeEventListener('pointercancel', this._up);
    el.removeEventListener('pointerleave', this._leave);
    el.removeEventListener('wheel', this._wheel);
    this.scene.traverse(o => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    this._env.dispose();
    this._pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// Planar UVs across an extruded/flat geometry so a texture lies flat on top.
export function remapPlanarUV(geo, w, h, plane = 'xz') {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const a = plane === 'xz' ? pos.getX(i) : pos.getX(i);
    const b = plane === 'xz' ? pos.getZ(i) : pos.getY(i);
    uv.setXY(i, a / w + 0.5, plane === 'xz' ? 0.5 - b / h : b / h + 0.5);
  }
  uv.needsUpdate = true;
}

// Billboard name tag.
export function textSprite(text, o = {}) {
  const fs = o.size || 44;
  const pad = 18;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const font = `700 ${fs}px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  cv.width = w; cv.height = fs + pad * 1.6;
  g.font = font;
  g.fillStyle = o.bg || 'rgba(12,10,8,0.72)';
  roundRect(g, 0, 0, cv.width, cv.height, cv.height / 2); g.fill();
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = 5; roundRect(g, 2.5, 2.5, cv.width - 5, cv.height - 5, cv.height / 2); g.stroke(); }
  g.fillStyle = o.color || '#f4ead8';
  g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText(text, cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, toneMapped: false }));
  const s = (o.scale || 0.012);
  sp.scale.set(cv.width * s, cv.height * s, 1);
  sp.renderOrder = 10;
  return sp;
}

export function shadowed(o, cast = true, recv = true) {
  o.traverse(m => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = recv; } });
  return o;
}

export { THREE };
