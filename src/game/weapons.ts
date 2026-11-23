import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Player weapons: view models, ballistics data and shot effects.
 * ------------------------------------------------------------------ */

export type WeaponId = 'pistol' | 'rifle' | 'sniper';

export interface WeaponSpec {
  id: WeaponId;
  en: string;
  ar: string;
  dmg: number;
  rpm: number;
  mag: number;
  reserve: number;
  spread: number;
  range: number;
  auto: boolean;
  reload: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    en: 'Pistol',
    ar: 'مسدس',
    dmg: 34,
    rpm: 260,
    mag: 12,
    reserve: 96,
    spread: 0.011,
    range: 70,
    auto: false,
    reload: 1.3,
  },
  rifle: {
    id: 'rifle',
    en: 'AKM Rifle',
    ar: 'بندقية كلاشنكوف',
    dmg: 24,
    rpm: 620,
    mag: 30,
    reserve: 210,
    spread: 0.028,
    range: 150,
    auto: true,
    reload: 2.1,
  },
  sniper: {
    id: 'sniper',
    en: 'Dragunov',
    ar: 'قناصة دراغونوف',
    dmg: 92,
    rpm: 50,
    mag: 5,
    reserve: 40,
    spread: 0.004,
    range: 280,
    auto: false,
    reload: 2.6,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'rifle', 'sniper'];

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.6, metal = 0.35) {
  const k = color + '_' + rough + '_' + metal;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(k, m);
  }
  return m;
}

/** First-person view model, parented to the camera. */
export function createViewModel(id: WeaponId): { group: THREE.Group; muzzle: THREE.Object3D } {
  const g = new THREE.Group();
  const steel = mat(0x24262a, 0.45, 0.5);
  const wood = mat(0x6b4a2a, 0.75, 0.05);
  const muzzle = new THREE.Object3D();

  if (id === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.3), steel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), mat(0x1c1d20, 0.85, 0.1));
    grip.position.set(0, -0.1, -0.08);
    grip.rotation.x = 0.35;
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI), steel);
    guard.position.set(0, -0.05, 0.0);
    guard.rotation.x = Math.PI / 2;
    g.add(slide, grip, guard);
    muzzle.position.set(0, 0.005, 0.17);
    g.position.set(0.2, -0.17, -0.42);
  } else if (id === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.66), steel);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 10), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.52);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.11), mat(0x2d2f33, 0.7, 0.3));
    mag.position.set(0, -0.14, 0.12);
    mag.rotation.x = -0.3;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.32), wood);
    stock.position.set(0, -0.01, -0.42);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.24), wood);
    handguard.position.set(0, 0.0, 0.36);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.02), steel);
    sight.position.set(0, 0.08, 0.2);
    g.add(body, barrel, mag, stock, handguard, sight);
    muzzle.position.set(0, 0.02, 0.74);
    g.position.set(0.23, -0.2, -0.55);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.82), steel);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 10), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, 0.7);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12), mat(0x1a1b1e, 0.4, 0.6));
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, 0.24);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.34), wood);
    stock.position.set(0, -0.02, -0.55);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), mat(0x2d2f33, 0.7, 0.3));
    mag.position.set(0, -0.11, 0.14);
    g.add(body, barrel, scope, stock, mag);
    muzzle.position.set(0, 0.02, 1.02);
    g.position.set(0.24, -0.21, -0.6);
  }

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      // View models must never be swallowed by the near plane / fog.
      const m = o.material as THREE.MeshStandardMaterial;
      m.fog = false;
      m.depthWrite = true;
    }
  });
  g.add(muzzle);
  return { group: g, muzzle };
}

/** Bullet tracers, impact sparks and muzzle flashes. */
export class Effects {
  private tracers: { line: THREE.Line; life: number }[] = [];
  private sparks: { sprite: THREE.Sprite; life: number; max: number; vy: number }[] = [];
  private flash: THREE.Sprite;
  private sparkTex: THREE.Texture;
  private lineMat: THREE.LineBasicMaterial;

  constructor(private scene: THREE.Scene) {
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, fog: false });
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,235,1)');
    grd.addColorStop(0.35, 'rgba(255,214,120,0.8)');
    grd.addColorStop(1, 'rgba(255,170,60,0)');
    c.fillStyle = grd;
    c.fillRect(0, 0, 64, 64);
    this.sparkTex = new THREE.CanvasTexture(cv);

    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false })
    );
    this.flash.scale.setScalar(0.42);
    this.flash.visible = false;
    this.flash.renderOrder = 12;
  }

  /** Muzzle flash sprite parented to the weapon. */
  attachFlash(parent: THREE.Object3D, at: THREE.Vector3) {
    this.flash.position.copy(at);
    parent.add(this.flash);
  }

  muzzleFlash() {
    this.flash.visible = true;
    this.flash.material.opacity = 0.95;
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.32 + Math.random() * 0.18);
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.lineMat);
    line.frustumCulled = false;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  impact(x: number, y: number, z: number) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false })
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.45);
    this.scene.add(sprite);
    this.sparks.push({ sprite, life: 0.22, max: 0.22, vy: 1.2 + Math.random() });
  }

  update(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      const m = t.line.material as THREE.LineBasicMaterial;
      m.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.sprite.position.y += s.vy * dt;
      s.sprite.scale.setScalar(0.45 + (1 - s.life / s.max) * 0.5);
      s.sprite.material.opacity = Math.max(0, s.life / s.max) * 0.9;
      if (s.life <= 0) {
        this.scene.remove(s.sprite);
        s.sprite.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
    if (this.flash.visible) {
      this.flash.material.opacity -= dt * 9;
      if (this.flash.material.opacity <= 0) this.flash.visible = false;
    }
  }
}
