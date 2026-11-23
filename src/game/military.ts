import * as THREE from 'three';
import { createHuman, type Human } from './characters';

/* ------------------------------------------------------------------ *
 * Armed factions of the capital: the Sudanese Army and the Rapid
 * Support Forces. They hold checkpoints, patrol the streets and are
 * neutral until the player opens fire on them.
 * ------------------------------------------------------------------ */

export type Faction = 'army' | 'rsf';

export const FACTIONS: Record<
  Faction,
  { en: string; ar: string; uniform: number; wrap: number; vest: number; vehicle: number; flag: number }
> = {
  army: {
    en: 'Sudanese Army',
    ar: 'الجيش السوداني',
    uniform: 0x4d5a3a,
    wrap: 0x36412a,
    vest: 0x2f3724,
    vehicle: 0x4f5a3c,
    flag: 0x1d6b3a,
  },
  rsf: {
    en: 'Rapid Support Forces',
    ar: 'قوات الدعم السريع',
    uniform: 0xb5aa8b,
    wrap: 0xece5d2,
    vest: 0x8b7c52,
    vehicle: 0xc6bfa4,
    flag: 0xd8b13a,
  },
};

export type SoldierState = 'patrol' | 'alert' | 'engage' | 'down';

export interface Soldier {
  faction: Faction;
  human: Human;
  group: THREE.Group;
  rifle: THREE.Group;
  muzzle: THREE.Object3D;
  hp: number;
  x: number;
  z: number;
  heading: number;
  state: SoldierState;
  ax: number;
  az: number;
  tx: number;
  tz: number;
  wait: number;
  cooldown: number;
  burst: number;
  phase: number;
  downT: number;
  flash: number;
}

export interface Technical {
  faction: Faction;
  group: THREE.Group;
  turret: THREE.Object3D;
  muzzle: THREE.Object3D;
  x: number;
  z: number;
  cooldown: number;
  flash: number;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.85, metal = 0) {
  const k = color + '_' + rough + '_' + metal;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(k, m);
  }
  return m;
}

const SKINS = [0x5a3a26, 0x6b4730, 0x7c5538, 0x3e2a1e, 0x8a6244, 0x4d3223];

/** Stylised assault rifle, held across the chest. */
function makeRifle(faction: Faction) {
  const g = new THREE.Group();
  const dark = mat(0x24262a, 0.55, 0.35);
  const wood = mat(faction === 'army' ? 0x6a4a2a : 0x2c2e30, 0.7);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), dark);
  body.position.z = 0.1;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.4, 8), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, 0.56);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.1), dark);
  mag.position.set(0, -0.12, 0.16);
  mag.rotation.x = -0.22;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.3), wood);
  stock.position.set(0, -0.01, -0.3);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), wood);
  grip.position.set(0, -0.1, -0.06);
  grip.rotation.x = 0.3;
  g.add(body, barrel, mag, stock, grip);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
    }
  });
  return g;
}

export function createSoldier(faction: Faction, rng: () => number): Soldier {
  const f = FACTIONS[faction];
  const human = createHuman({
    robe: f.uniform,
    skin: SKINS[Math.floor(rng() * SKINS.length)],
    turban: f.wrap,
  });
  const group = human.group;

  // webbing / plate carrier
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.44, 0.42), mat(f.vest, 0.8));
  vest.position.y = 1.28;
  vest.castShadow = true;
  group.add(vest);
  const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.1), mat(f.vest, 0.85));
  pouch.position.set(0.14, 1.16, 0.24);
  group.add(pouch);

  // faction patch on the shoulder
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.02), mat(f.flag, 0.8));
  patch.position.set(0.3, 1.4, 0.02);
  patch.rotation.y = Math.PI / 2;
  group.add(patch);

  const rifle = makeRifle(faction);
  rifle.position.set(0.12, 1.2, 0.24);
  rifle.rotation.y = -0.12;
  group.add(rifle);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, 0.76);
  rifle.add(muzzle);

  return {
    faction,
    human,
    group,
    rifle,
    muzzle,
    hp: 100,
    x: 0,
    z: 0,
    heading: 0,
    state: 'patrol',
    ax: 0,
    az: 0,
    tx: 0,
    tz: 0,
    wait: rng() * 2,
    cooldown: rng() * 2,
    burst: 0,
    phase: rng() * 6,
    downT: 0,
    flash: 0,
  };
}

/** Parked pickup with a shielded machine gun on the bed. */
export function createTechnical(faction: Faction, rng: () => number): Technical {
  const f = FACTIONS[faction];
  const g = new THREE.Group();
  const paint = mat(f.vehicle, 0.55, 0.25);
  const dark = mat(0x1b1d20, 0.8);
  const glass = mat(0x2b3a42, 0.2, 0.5);

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), paint);
  body.position.y = 0.82;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 1.7), paint);
  cab.position.set(0, 1.42, 1.1);
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.1), glass);
  windscreen.position.set(0, 1.5, 1.93);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 2.0), dark);
  bed.position.set(0, 1.15, -1.15);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.12), dark);
  bar.position.set(0, 1.95, -2.1);
  g.add(body, cab, windscreen, bed, bar);

  const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const tyre = mat(0x171718, 0.95);
  for (const x of [-0.98, 0.98]) {
    for (const z of [1.45, -1.35]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.position.set(x, 0.46, z);
      w.castShadow = true;
      g.add(w);
    }
  }

  // turret: pedestal + shield + MG
  const turret = new THREE.Group();
  turret.position.set(0, 1.35, -1.0);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 10), dark);
  post.position.y = 0.35;
  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.08), mat(0x4a4d3c, 0.7, 0.3));
  shield.position.set(0, 0.78, 0.18);
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.13, 0.9), dark);
  gunBody.position.set(0, 0.72, -0.1);
  const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8), dark);
  gunBarrel.rotation.x = Math.PI / 2;
  gunBarrel.position.set(0, 0.75, -0.75);
  turret.add(post, shield, gunBody, gunBarrel);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.75, -1.15);
  turret.add(muzzle);
  g.add(turret);

  // spare wheel on the tailgate + sandbags for cover
  const spare = new THREE.Mesh(wheelGeo, tyre);
  spare.position.set(0, 1.0, -2.25);
  g.add(spare);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { faction, group: g, turret, muzzle, x: 0, z: 0, cooldown: 2 + rng() * 2, flash: 0 };
}

/** Sandbag wall + barrier + flag pole for a checkpoint. */
export function createCheckpoint(faction: Faction, rng: () => number) {
  const g = new THREE.Group();
  const sand = mat(0xbfae86, 0.95);
  const bagGeo = new THREE.BoxGeometry(0.7, 0.3, 0.4);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(bagGeo, sand);
      b.position.set(-1.75 + i * 0.7 + (row % 2) * 0.12, 0.15 + row * 0.28, -0.02 + row * 0.03);
      b.rotation.y = (rng() - 0.5) * 0.12;
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
  }
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 0.22), mat(0xd94b3a, 0.7));
  barrier.position.set(0, 0.95, 0.1);
  barrier.castShadow = true;
  const legGeo = new THREE.BoxGeometry(0.12, 1.0, 0.12);
  for (const x of [-1.5, 1.5]) {
    const l = new THREE.Mesh(legGeo, mat(0xbdbdbd, 0.6, 0.4));
    l.position.set(x, 0.5, 0.1);
    g.add(l);
  }
  g.add(barrier);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 8), mat(0x9a9a9a, 0.5, 0.6));
  pole.position.set(2.3, 2.1, -0.6);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.7, 8, 1), mat(FACTIONS[faction].flag, 0.9));
  flag.position.set(2.3, 3.55, -0.6);
  flag.rotation.y = Math.PI / 2;
  g.add(pole, flag);

  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, flag };
}

export interface MilitaryCtx {
  px: number;
  py: number;
  pz: number;
  playerAlive: boolean;
  groundY: (x: number, z: number) => number;
  driveable: (x: number, z: number) => boolean;
  onEnemyFire: (x: number, y: number, z: number, dist: number) => void;
  /** True when a building blocks the line between two ground points. */
  isBlocked: (x0: number, z0: number, x1: number, z1: number) => boolean;
  onPlayerHit: (dmg: number, faction: Faction) => void;
  onKill: (faction: Faction) => void;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

export class Military {
  soldiers: Soldier[] = [];
  technicals: Technical[] = [];
  flags: THREE.Mesh[] = [];
  hostile = new Set<Faction>();
  kills = 0;

  constructor(private scene: THREE.Scene, private rng: () => number) {}

  /** Checkpoints on the main road grid, plus foot patrols around them. */
  spawn(driveable: (x: number, z: number) => boolean) {
    const posts: { faction: Faction; x: number; z: number; rotation: number }[] = [
      { faction: 'army', x: 100, z: 100, rotation: 0 },
      { faction: 'army', x: 250, z: 50, rotation: Math.PI / 2 },
      { faction: 'rsf', x: -150, z: 50, rotation: Math.PI },
      { faction: 'rsf', x: -250, z: -100, rotation: -Math.PI / 2 },
    ];
    for (const p of posts) {
      const cp = createCheckpoint(p.faction, this.rng);
      cp.group.position.set(p.x, 0, p.z);
      cp.group.rotation.y = p.rotation;
      this.scene.add(cp.group);
      this.flags.push(cp.flag);

      const tech = createTechnical(p.faction, this.rng);
      let ox = Math.cos(p.rotation) * 6;
      let oz = -Math.sin(p.rotation) * 6;
      if (!driveable(p.x + ox, p.z + oz)) {
        ox = 0;
        oz = 0;
      }
      tech.x = p.x + ox;
      tech.z = p.z + oz;
      tech.group.position.set(tech.x, 0, tech.z);
      tech.group.rotation.y = p.rotation + Math.PI / 2;
      this.scene.add(tech.group);
      this.technicals.push(tech);

      const n = p.faction === 'army' ? 4 : 4;
      for (let i = 0; i < n; i++) {
        const s = createSoldier(p.faction, this.rng);
        const a = (i / n) * Math.PI * 2 + this.rng() * 0.5;
        const r = 6 + this.rng() * 7;
        s.x = p.x + Math.cos(a) * r;
        s.z = p.z + Math.sin(a) * r;
        for (let tries = 0; tries < 10 && !driveable(s.x, s.z); tries++) {
          const aa = this.rng() * Math.PI * 2;
          const rr = 5 + this.rng() * 6;
          s.x = p.x + Math.cos(aa) * rr;
          s.z = p.z + Math.sin(aa) * rr;
        }
        s.ax = p.x;
        s.az = p.z;
        s.tx = s.x;
        s.tz = s.z;
        s.heading = this.rng() * Math.PI * 2;
        s.group.position.set(s.x, 0, s.z);
        s.group.rotation.y = s.heading;
        this.scene.add(s.group);
        this.soldiers.push(s);
      }
    }
  }

  /** Marks a faction hostile and alerts everyone nearby. */
  makeHostile(faction: Faction) {
    this.hostile.add(faction);
    for (const s of this.soldiers) {
      if (s.faction === faction && s.state !== 'down') s.state = 'alert';
    }
  }

  clearHostility() {
    this.hostile.clear();
  }

  alive(faction?: Faction) {
    return this.soldiers.filter((s) => s.state !== 'down' && (!faction || s.faction === faction)).length;
  }

  /** Nearest soldier hit by a ray; headshots are twice as deadly. */
  hitTest(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number) {
    let best: { soldier: Soldier; t: number; head: boolean } | null = null;
    for (const s of this.soldiers) {
      if (s.state === 'down') continue;
      for (const head of [false, true]) {
        const cy = s.group.position.y + (head ? 1.62 : 1.05);
        tmpA.set(s.x, cy, s.z).sub(origin);
        const t = tmpA.dot(dir);
        if (t < 0 || t > maxDist) continue;
        tmpB.copy(dir).multiplyScalar(t).add(origin);
        tmpC.set(s.x, cy, s.z);
        const r = head ? 0.26 : 0.5;
        if (tmpB.distanceTo(tmpC) < r && (!best || t < best.t)) best = { soldier: s, t, head };
      }
    }
    return best;
  }

  damage(s: Soldier, dmg: number) {
    if (s.state === 'down') return false;
    s.hp -= dmg;
    this.makeHostile(s.faction);
    if (s.hp <= 0) {
      s.state = 'down';
      s.hp = 0;
      s.downT = 0;
      this.kills++;
      return true;
    }
    s.state = 'engage';
    return false;
  }

  update(dt: number, time: number, ctx: MilitaryCtx) {
    const px = ctx.px;
    const pz = ctx.pz;
    for (const s of this.soldiers) {
      const g = s.group;

      if (s.state === 'down') {
        s.downT += dt;
        const k = Math.min(1, s.downT * 2.6);
        g.position.y = ctx.groundY(s.x, s.z) - 0.06 * k;
        g.rotation.x = -1.45 * k;
        g.rotation.z = 0.12 * k;
        continue;
      }

      const d = Math.hypot(px - s.x, pz - s.z);
      const wantsFight = this.hostile.has(s.faction) && ctx.playerAlive && d < 85;
      if (wantsFight) s.state = 'engage';
      else if (s.state === 'engage') s.state = 'alert';

      let moving = false;
      let speed = 0;

      if (s.state === 'engage') {
        const desired = 16;
        const err = d - desired;
        s.heading = Math.atan2(px - s.x, pz - s.z);
        if (Math.abs(err) > 4) {
          const dir = Math.sign(err);
          const step = (err > 0 ? 3.4 : 2.6) * dir * dt;
          const nx = s.x + Math.sin(s.heading) * step;
          const nz = s.z + Math.cos(s.heading) * step;
          if (ctx.driveable(nx, nz)) {
            s.x = nx;
            s.z = nz;
            moving = true;
            speed = 3.4;
          }
        }
        // weapon up, firing in bursts
        s.human.armR.rotation.x = -1.45;
        s.human.armL.rotation.x = -1.2;
        s.human.legL.rotation.x = 0;
        s.human.legR.rotation.x = 0;
        s.rifle.rotation.x = 0;
        s.cooldown -= dt;
        const los = !ctx.isBlocked(s.x, s.z, px, pz);
        if (s.cooldown <= 0 && d < 60 && los) {
          s.cooldown = 2.1 + this.rng() * 1.3;
          s.burst = 3 + Math.floor(this.rng() * 2);
        }
        if (s.burst > 0) {
          s.flash -= dt;
          if (s.flash <= 0) {
            s.flash = 0.14;
            s.burst--;
            const dist = d;
            s.muzzle.getWorldPosition(tmpA);
            ctx.onEnemyFire(tmpA.x, tmpA.y, tmpA.z, dist);
            const chance = THREE.MathUtils.clamp(0.36 - dist * 0.006, 0.04, 0.3);
            if (this.rng() < chance) ctx.onPlayerHit(3 + this.rng() * 3, s.faction);
          }
        }
      } else {
        // patrol between points near the post
        s.wait -= dt;
        const tx = s.tx;
        const tz = s.tz;
        const dd = Math.hypot(tx - s.x, tz - s.z);
        if (dd < 1.2) {
          if (s.wait <= 0) {
            const a = this.rng() * Math.PI * 2;
            const r = 5 + this.rng() * 12;
            const nx = s.ax + Math.cos(a) * r;
            const nz = s.az + Math.sin(a) * r;
            if (ctx.driveable(nx, nz)) {
              s.tx = nx;
              s.tz = nz;
            }
            s.wait = 2 + this.rng() * 5;
          }
        } else {
          const h = Math.atan2(tx - s.x, tz - s.z);
          s.heading = h;
          const nx = s.x + Math.sin(h) * 1.5 * dt;
          const nz = s.z + Math.cos(h) * 1.5 * dt;
          if (ctx.driveable(nx, nz)) {
            s.x = nx;
            s.z = nz;
            moving = true;
            speed = 1.5;
          } else {
            s.tx = s.x;
            s.tz = s.z;
          }
        }
        // rifle slung low while walking
        s.human.armR.rotation.x = 0;
        s.human.armL.rotation.x = 0;
        s.rifle.rotation.x = 0.95;
        s.rifle.position.set(0.16, 1.05, 0.16);
      }

      if (moving) {
        s.phase += speed * dt * 3.4;
        s.human.setWalk(s.phase, 0.55);
        if (s.state === 'engage') {
          // legs keep marching while the upper body aims
          s.human.armR.rotation.x = -1.45;
          s.human.armL.rotation.x = -1.2;
        }
      } else {
        s.human.setWalk(0, 0);
        if (s.state === 'engage') {
          s.human.armR.rotation.x = -1.45;
          s.human.armL.rotation.x = -1.2;
        }
      }
      if (s.state === 'engage') s.rifle.position.set(0.12, 1.2, 0.24);

      g.rotation.y += Math.atan2(Math.sin(s.heading - g.rotation.y), Math.cos(s.heading - g.rotation.y)) * Math.min(1, dt * 7);
      g.position.set(s.x, ctx.groundY(s.x, s.z), s.z);
    }

    // mounted guns on the technicals
    for (const t of this.technicals) {
      const d = Math.hypot(px - t.x, pz - t.z);
      const wants =
        this.hostile.has(t.faction) && ctx.playerAlive && d < 75 && !ctx.isBlocked(t.x, t.z, px, pz);
      if (!wants) continue;
      const want = Math.atan2(px - t.x, pz - t.z);
      const local = want - t.group.rotation.y;
      t.turret.rotation.y += Math.atan2(Math.sin(local - t.turret.rotation.y), Math.cos(local - t.turret.rotation.y)) * Math.min(1, dt * 3);
      t.cooldown -= dt;
      if (t.cooldown <= 0 && Math.abs(local - t.turret.rotation.y) < 0.35) {
        t.cooldown = 2.6 + this.rng();
        t.flash = 0.1;
        t.muzzle.getWorldPosition(tmpA);
        ctx.onEnemyFire(tmpA.x, tmpA.y, tmpA.z, d);
        const chance = THREE.MathUtils.clamp(0.3 - d * 0.004, 0.03, 0.26);
        if (this.rng() < chance) ctx.onPlayerHit(4 + this.rng() * 3, t.faction);
      }
    }

    // flags ripple gently
    for (const f of this.flags) {
      f.rotation.z = Math.sin(time * 2.2) * 0.05;
    }
  }
}
