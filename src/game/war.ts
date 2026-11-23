import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingRecord, CityBuild } from './city';

/* ------------------------------------------------------------------ *
 * "War damage" layer: a set of the city's buildings are collapsed into
 * rubble, craters open in the streets and smoke columns rise over the
 * skyline (with the occasional distant blast).
 * ------------------------------------------------------------------ */

interface Puff {
  sprite: THREE.Sprite;
  site: number;
  t: number;
  speed: number;
  drift: number;
  base: number;
  max: number;
}

interface Site {
  x: number;
  z: number;
  y: number;
  emissive: number;
  glow: THREE.Sprite;
  smokeCount: number;
}

function smokeTexture() {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(240,238,232,0.55)');
  g.addColorStop(1, 'rgba(225,222,214,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

function glowTexture() {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,246,210,1)');
  g.addColorStop(0.3, 'rgba(255,170,60,0.8)');
  g.addColorStop(0.65, 'rgba(220,70,20,0.28)');
  g.addColorStop(1, 'rgba(140,30,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

export class WarMode {
  active = false;
  sites: Site[] = [];
  private rubble = new THREE.Group();
  private puffs: Puff[] = [];
  private smokeTex: THREE.Texture;
  private glowTex: THREE.Texture;
  private picks: BuildingRecord[] = [];
  private boomT = 6;
  private blast: THREE.Sprite;
  private smokeMat: THREE.SpriteMaterial;
  private destroyed = 0;

  constructor(
    private scene: THREE.Scene,
    private city: CityBuild,
    private rng: () => number,
    private onBoom: () => void
  ) {
    this.smokeTex = smokeTexture();
    this.glowTex = glowTexture();
    this.smokeMat = new THREE.SpriteMaterial({
      map: this.smokeTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      color: 0x54514c,
      fog: true,
    });
    this.rubble.visible = false;
    scene.add(this.rubble);

    this.blast = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
    );
    this.blast.scale.setScalar(90);
    this.blast.visible = false;
    scene.add(this.blast);
  }

  /** Collapse a spread of buildings and start the smoke. */
  setActive(on: boolean, groundY: (x: number, z: number) => number) {
    if (on === this.active) return;
    this.active = on;
    this.rubble.visible = on;
    for (const p of this.puffs) p.sprite.visible = on;
    for (const s of this.sites) s.glow.visible = on;
    if (!on) {
      this.restore();
      return;
    }
    if (this.picks.length) {
      for (const r of this.picks) this.hideAll(r);
      return;
    }
    this.build(groundY);
  }

  private restore() {
    const m = new THREE.Matrix4();
    for (const [im, map] of this.saved) {
      for (const [i, mat] of map) {
        m.copy(mat);
        im.setMatrixAt(i, m);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  private hideAll(r: BuildingRecord) {
    this.hide(this.city.buildings, r.i);
    this.hide(this.city.slabs, r.slab);
    if (r.tank >= 0) this.hide(this.city.tanks, r.tank);
    if (r.ac >= 0) this.hide(this.city.acs, r.ac);
  }

  private saved = new Map<THREE.InstancedMesh, Map<number, THREE.Matrix4>>();

  private hide(im: THREE.InstancedMesh, idx: number) {
    if (idx < 0 || idx >= im.count) return;
    let map = this.saved.get(im);
    if (!map) {
      map = new Map();
      this.saved.set(im, map);
    }
    if (!map.has(idx)) {
      const m = new THREE.Matrix4();
      im.getMatrixAt(idx, m);
      map.set(idx, m);
    }
    im.setMatrixAt(idx, new THREE.Matrix4().makeScale(0, 0, 0));
    im.instanceMatrix.needsUpdate = true;
  }

  private build(groundY: (x: number, z: number) => number) {
    if (this.sites.length) return;
    const recs = this.city.records.filter((r) => r.h > 3 && Math.abs(r.x) < 460 && Math.abs(r.z) < 460);
    // spread the destruction across the three cities
    const picks: typeof recs = [];
    const regions: [number, number, number, number][] = [
      [0, 500, 0, 500],
      [0, 500, -500, 0],
      [-500, 0, -500, 500],
    ];
    for (const [x0, x1, z0, z1] of regions) {
      const pool = recs.filter((r) => r.x > x0 && r.x < x1 && r.z > z0 && r.z < z1);
      for (let i = 0; i < 5 && pool.length; i++) {
        const k = Math.floor(this.rng() * pool.length);
        picks.push(pool.splice(k, 1)[0]);
      }
    }

    const parts: THREE.BufferGeometry[] = [];
    const capParts: THREE.BufferGeometry[] = [];

    for (const r of picks) {
      const y = groundY(r.x, r.z);
      this.picks.push(r);
      this.hideAll(r);

      // collapsed shell: two or three jagged wall stubs
      const wallH = Math.min(r.h * 0.45, 6.5);
      const stubs = 3 + Math.floor(this.rng() * 2);
      for (let i = 0; i < stubs; i++) {
        const bw = 1.6 + this.rng() * (r.w * 0.5);
        const bd = 0.6 + this.rng() * 1.2;
        const bh = wallH * (0.35 + this.rng() * 0.8);
        const g = new THREE.BoxGeometry(bw, bh, bd);
        const side = i % 4;
        const ox = side < 2 ? (side === 0 ? -1 : 1) * (r.w / 2 - bd * 0.4) : (this.rng() - 0.5) * r.w * 0.7;
        const oz = side >= 2 ? (side === 2 ? -1 : 1) * (r.d / 2 - bd * 0.4) : (this.rng() - 0.5) * r.d * 0.7;
        g.rotateY(Math.atan2(ox, oz) + (this.rng() - 0.5) * 0.35);
        g.translate(r.x + ox, y + bh / 2, r.z + oz);
        parts.push(g);
      }

      // rubble field
      const chunks = 14 + Math.floor(this.rng() * 10);
      for (let i = 0; i < chunks; i++) {
        const a = this.rng() * Math.PI * 2;
        const rad = this.rng() * Math.max(r.w, r.d) * 0.55;
        const s = 0.5 + this.rng() * 1.9;
        const g = new THREE.BoxGeometry(s, s * (0.35 + this.rng() * 0.6), s * (0.6 + this.rng() * 0.8));
        g.rotateX((this.rng() - 0.5) * 0.9);
        g.rotateY(this.rng() * Math.PI);
        g.rotateZ((this.rng() - 0.5) * 0.9);
        g.translate(r.x + Math.cos(a) * rad, y + s * 0.22, r.z + Math.sin(a) * rad);
        capParts.push(g);
      }

      // crater: a dark ring lying on the ground
      const crater = new THREE.Mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false })
      );
      crater.rotation.x = -Math.PI / 2;
      crater.scale.setScalar(2.2 + this.rng() * 2.6);
      crater.position.set(r.x, y + 0.07, r.z);
      this.rubble.add(crater);

      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
      );
      glow.position.set(r.x, y + 1.1, r.z);
      glow.scale.setScalar(7 + this.rng() * 6);
      this.rubble.add(glow);

      this.sites.push({ x: r.x, z: r.z, y, emissive: this.rng(), glow, smokeCount: 0 });
      this.destroyed++;
    }

    const rubbleMesh = new THREE.Mesh(
      mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!,
      new THREE.MeshStandardMaterial({ color: 0xa89c88, roughness: 0.98 })
    );
    rubbleMesh.castShadow = rubbleMesh.receiveShadow = true;
    this.rubble.add(rubbleMesh);

    const chunkMesh = new THREE.Mesh(
      mergeGeometries(capParts.map((p) => (p.index ? p.toNonIndexed() : p)))!,
      new THREE.MeshStandardMaterial({ color: 0x9b9182, roughness: 1 })
    );
    chunkMesh.castShadow = chunkMesh.receiveShadow = true;
    this.rubble.add(chunkMesh);

    // smoke columns
    for (let si = 0; si < this.sites.length; si++) {
      const s = this.sites[si];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const mat = this.smokeMat.clone();
        mat.opacity = 0;
        const sp = new THREE.Sprite(mat);
        const spread = 3.5;
        const life = this.rng();
        sp.position.set(s.x + (this.rng() - 0.5) * spread, s.y + 2 + life * 40, s.z + (this.rng() - 0.5) * spread);
        const size = 7 + this.rng() * 9;
        sp.scale.setScalar(size);
        sp.visible = true;
        this.scene.add(sp);
        this.puffs.push({
          sprite: sp,
          site: si,
          t: life,
          speed: 1.1 + this.rng() * 1.3,
          drift: (this.rng() - 0.5) * 1.1,
          base: size,
          max: size * 2.6,
        });
        s.smokeCount++;
      }
    }
  }

  update(dt: number, time: number) {
    if (!this.active) return;
    for (const p of this.puffs) {
      const s = this.sites[p.site];
      p.t += dt / 9;
      if (p.t > 1) p.t = 0;
      const sp = p.sprite;
      sp.position.y = s.y + 2 + p.t * 52;
      sp.position.x = s.x + p.drift * p.t * 22 + Math.sin(time * 0.4 + p.site) * 0.6;
      sp.position.z = s.z + Math.cos(time * 0.33 + p.site * 1.7) * 1.4;
      const g = p.t;
      sp.scale.setScalar(p.base + (p.max - p.base) * g);
      const fade = Math.sin(Math.min(1, g) * Math.PI);
      (sp.material as THREE.SpriteMaterial).opacity = 0.5 * fade;
    }
    for (const s of this.sites) {
      const flicker = 0.42 + Math.sin(time * 6 + s.emissive * 9) * 0.12 + Math.sin(time * 17 + s.emissive * 3) * 0.06;
      (s.glow.material as THREE.SpriteMaterial).opacity = flicker;
      s.glow.scale.setScalar(7 + Math.sin(time * 3 + s.emissive * 5) * 1.2 + s.emissive * 3);
    }
    // distant blasts
    this.boomT -= dt;
    if (this.boomT <= 0) {
      this.boomT = 9 + this.rng() * 14;
      const a = this.rng() * Math.PI * 2;
      const d = 220 + this.rng() * 320;
      this.blast.position.set(Math.cos(a) * d, 6 + this.rng() * 20, Math.sin(a) * d);
      (this.blast.material as THREE.SpriteMaterial).opacity = 0.9;
      this.blast.visible = true;
      this.onBoom();
    }
    if (this.blast.visible) {
      const m = this.blast.material as THREE.SpriteMaterial;
      m.opacity -= dt * 2.4;
      if (m.opacity <= 0) this.blast.visible = false;
    }
  }

  get count() {
    return this.destroyed;
  }
}
