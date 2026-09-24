import * as THREE from '/vendor/three.module.js';

// Shared 3D stage: renderer, camera, lights, a compact orbit control and a
// raycaster for click/hover picking. Games build their meshes and hand the
// pickable ones to setPickables(). Keeps the same lifecycle the 2D renderers
// used (render / destroy) so app.js does not care whether a game is 2D or 3D.
export class Stage {
  constructor(mount, opts = {}) {
    this.mount = mount;
    this.pickables = [];
    this.onPick = null;
    this.onHover = null;
    this._hovered = null;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.borderRadius = '12px';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.style.cursor = 'grab';

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera = camera;

    // Orbit target + spherical position.
    this.target = new THREE.Vector3(0, opts.targetY || 0, 0);
    this.radius = opts.radius || 12;
    this.minR = opts.minR || 6;
    this.maxR = opts.maxR || 22;
    this.theta = opts.theta ?? Math.PI / 2;      // azimuth
    this.phi = opts.phi ?? 0.86;                   // polar (from +Y)
    this.minPhi = 0.18;
    this.maxPhi = 1.45;

    // Lighting: soft ambient + a key light that casts board shadows.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x30404f, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(6, 14, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 12;
    key.shadow.camera.left = -d; key.shadow.camera.right = d;
    key.shadow.camera.top = d; key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.35);
    fill.position.set(-8, 6, -5);
    scene.add(fill);

    this._bind();
    this._raf = 0;
    this._running = true;
    this._loop = this._loop.bind(this);
    this._resize();
    this._raf = requestAnimationFrame(this._loop);
  }

  setPickables(list) { this.pickables = list; }

  _bind() {
    const el = this.renderer.domElement;
    this._ray = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    let dragging = false, moved = 0, lx = 0, ly = 0;

    const ndc = (e) => {
      const r = el.getBoundingClientRect();
      this._ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const hit = () => {
      this._ray.setFromCamera(this._ndc, this.camera);
      const is = this._ray.intersectObjects(this.pickables, true);
      for (const i of is) {
        let o = i.object;
        while (o && o.userData.pick === undefined) o = o.parent;
        if (o) { this._point = i.point; return o; }
      }
      this._point = null;
      return null;
    };

    this._down = (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; el.setPointerCapture?.(e.pointerId); el.style.cursor = 'grabbing'; };
    this._move = (e) => {
      if (dragging) {
        const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        moved += Math.abs(dx) + Math.abs(dy);
        this.theta -= dx * 0.008;
        this.phi = Math.min(this.maxPhi, Math.max(this.minPhi, this.phi - dy * 0.006));
      } else if (this.onHover) {
        ndc(e);
        const o = hit();
        if (o !== this._hovered) { this._hovered = o; }
        this.onHover(o ? o.userData.pick : null, this._point);
      }
    };
    this._up = (e) => {
      const wasDrag = moved > 6;
      dragging = false; el.style.cursor = 'grab';
      if (!wasDrag && this.onPick) { ndc(e); const o = hit(); if (o) this.onPick(o.userData.pick, this._point); }
    };
    this._wheel = (e) => { e.preventDefault(); this.radius = Math.min(this.maxR, Math.max(this.minR, this.radius + Math.sign(e.deltaY) * 0.8)); };

    el.addEventListener('pointerdown', this._down);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerup', this._up);
    el.addEventListener('wheel', this._wheel, { passive: false });
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
  }

  _resize() {
    const w = this.mount.clientWidth || 480;
    const h = Math.max(360, Math.round(w * 0.82));
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _loop() {
    if (!this._running) return;
    this._raf = requestAnimationFrame(this._loop);
    const st = Math.sin(this.phi) * this.radius;
    this.camera.position.set(
      this.target.x + st * Math.sin(this.theta),
      this.target.y + Math.cos(this.phi) * this.radius,
      this.target.z + st * Math.cos(this.theta)
    );
    this.camera.lookAt(this.target);
    if (this.tick) this.tick();
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this._running = false;
    cancelAnimationFrame(this._raf);
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this._down);
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerup', this._up);
    el.removeEventListener('wheel', this._wheel);
    window.removeEventListener('resize', this._onResize);
    this.scene.traverse(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); });
    this.renderer.dispose();
    el.remove();
  }
}

export { THREE };
