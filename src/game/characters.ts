import * as THREE from 'three';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, rough = 0.85, metal = 0): THREE.MeshStandardMaterial {
  const key = color + '_' + rough + '_' + metal;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export interface HumanOpts {
  robe: number;
  skin: number;
  turban?: number | null;
  female?: boolean;
  shawl?: number | null;
  sash?: number | null;
  scarf?: number | null;
}

export interface Human {
  group: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  setWalk: (phase: number, amp: number) => void;
  setWave: (t: number) => void;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// All characters are deliberately FACELESS: the head is a smooth featureless form.
export function createHuman(o: HumanOpts): Human {
  const group = new THREE.Group();
  const skin = mat(o.skin, 0.55);
  const robe = mat(o.robe, 0.88);

  const legGeo = geo('leg', () => new THREE.CylinderGeometry(0.075, 0.062, 0.58, 8).translate(0, -0.29, 0));
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(0.1, 0.58, 0);
  legR.position.set(-0.1, 0.58, 0);
  for (const l of [legL, legR]) {
    l.add(mesh(legGeo, skin));
    const shoe = mesh(geo('shoe', () => new THREE.BoxGeometry(0.13, 0.07, 0.26).translate(0, -0.56, 0.05)), mat(0x2a1a10, 0.7));
    l.add(shoe);
    group.add(l);
  }

  const bodyGeo = o.female
    ? geo('bodyF', () => new THREE.CylinderGeometry(0.25, 0.5, 1.2, 18, 1, true))
    : geo('bodyM', () => new THREE.CylinderGeometry(0.25, 0.4, 1.15, 18, 1, true));
  const body = mesh(bodyGeo, robe);
  (body.material as THREE.Material).side = THREE.DoubleSide;
  body.position.y = o.female ? 0.95 : 0.98;
  group.add(body);

  const shoulders = mesh(geo('shoulders', () => new THREE.SphereGeometry(0.27, 16, 10)), robe);
  shoulders.scale.set(1.12, 0.55, 0.72);
  shoulders.position.y = 1.52;
  group.add(shoulders);

  const armGeo = geo('arm', () => new THREE.CylinderGeometry(0.068, 0.055, 0.62, 8).translate(0, -0.31, 0));
  const handGeo = geo('hand', () => new THREE.SphereGeometry(0.06, 8, 6).translate(0, -0.64, 0));
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(0.33, 1.5, 0);
  armR.position.set(-0.33, 1.5, 0);
  for (const a of [armL, armR]) {
    a.add(mesh(armGeo, robe));
    a.add(mesh(handGeo, skin));
    group.add(a);
  }

  const neck = mesh(geo('neck', () => new THREE.CylinderGeometry(0.055, 0.065, 0.12, 8)), skin);
  neck.position.y = 1.63;
  group.add(neck);

  // smooth featureless head
  const head = mesh(geo('head', () => new THREE.SphereGeometry(0.155, 24, 18)), skin);
  head.scale.set(0.94, 1.12, 1);
  head.position.y = 1.78;
  group.add(head);

  if (o.female) {
    const sh = o.shawl ?? o.robe;
    const cover = mesh(geo('cover', () => new THREE.SphereGeometry(0.178, 20, 14, 0, Math.PI * 2, 0, 1.75)), mat(sh, 0.8));
    cover.scale.set(1, 1.1, 1.06);
    cover.position.set(0, 1.78, -0.012);
    group.add(cover);
    const cape = mesh(geo('cape', () => new THREE.SphereGeometry(0.31, 16, 10, 0, Math.PI * 2, 0, 1.9)), mat(sh, 0.8));
    cape.scale.set(1.15, 0.8, 0.85);
    cape.position.set(0, 1.5, -0.03);
    group.add(cape);
  } else {
    const t = o.turban ?? 0xf4f0e6;
    const cap = mesh(geo('turban', () => new THREE.SphereGeometry(0.17, 20, 12, 0, Math.PI * 2, 0, 1.45)), mat(t, 0.8));
    cap.scale.set(1.05, 0.95, 1.1);
    cap.position.set(0, 1.81, 0);
    group.add(cap);
    const ring = mesh(geo('turbanRing', () => new THREE.TorusGeometry(0.165, 0.042, 8, 20)), mat(t, 0.8));
    ring.rotation.x = Math.PI / 2;
    ring.scale.set(1.02, 1.08, 1);
    ring.position.set(0, 1.82, 0);
    group.add(ring);
    if (o.sash) {
      const s = mesh(geo('sash', () => new THREE.TorusGeometry(0.31, 0.035, 6, 20)), mat(o.sash, 0.7));
      s.rotation.x = Math.PI / 2;
      s.scale.set(1, 1.05, 1);
      s.position.y = 1.15;
      group.add(s);
    }
    if (o.scarf) {
      const s = mesh(geo('scarf', () => new THREE.TorusGeometry(0.14, 0.05, 8, 16)), mat(o.scarf, 0.7));
      s.rotation.x = Math.PI / 2;
      s.position.y = 1.62;
      group.add(s);
      const tail = mesh(geo('scarfTail', () => new THREE.BoxGeometry(0.1, 0.5, 0.03)), mat(o.scarf, 0.7));
      tail.position.set(0.1, 1.38, 0.2);
      tail.rotation.z = 0.08;
      group.add(tail);
    }
  }

  group.scale.setScalar(0.93);

  return {
    group,
    armL,
    armR,
    legL,
    legR,
    setWalk(phase: number, amp: number) {
      const s = Math.sin(phase) * amp;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.8;
      armR.rotation.x = s * 0.8;
      armL.rotation.z = 0;
      armR.rotation.z = 0;
    },
    setWave(t: number) {
      armR.rotation.x = 0;
      armR.rotation.z = -2.6 + Math.sin(t * 6) * 0.35;
      armL.rotation.x = 0;
      legL.rotation.x = 0;
      legR.rotation.x = 0;
    },
  };
}

const MALE_ROBES = [0xf6f3ea, 0xefe9da, 0xe4eef2, 0xd9d9d2, 0xf2e8cf, 0xcfd8dc, 0xe9e2c8, 0xb7c7d4, 0xf8f8f8];
const FEMALE_ROBES = [0xc2185b, 0x00897b, 0xef6c00, 0x6a1b9a, 0x2e7d32, 0xf9a825, 0x1565c0, 0xd84315, 0xad1457, 0x00acc1];
const SKINS = [0x5a3a26, 0x6b4730, 0x7c5538, 0x3e2a1e, 0x4d3223, 0x8a6244];

export function randomHuman(rng: () => number): Human {
  const female = rng() < 0.42;
  const pick = <T,>(a: T[]) => a[Math.floor(rng() * a.length)];
  if (female) {
    const c = pick(FEMALE_ROBES);
    return createHuman({ robe: c, skin: pick(SKINS), female: true, shawl: rng() < 0.5 ? c : pick(FEMALE_ROBES) });
  }
  return createHuman({
    robe: pick(MALE_ROBES),
    skin: pick(SKINS),
    turban: rng() < 0.75 ? 0xf6f3ea : pick([0xe8e0c8, 0x9fb2c4, 0xd8c9a2]),
    sash: rng() < 0.2 ? 0x6d4c41 : null,
  });
}

export function createPlayerModel(): Human {
  return createHuman({ robe: 0xfaf8f0, skin: 0x6b4730, turban: 0xffffff, scarf: 0x0b7a3b, sash: 0xc9a227 });
}

// A simple goat for the Tuti Island mission
export function createGoat() {
  const g = new THREE.Group();
  const white = mat(0xf1ece0, 0.9);
  const brown = mat(0x6b4a2e, 0.9);
  const body = mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), white);
  body.position.y = 0.7;
  g.add(body);
  const neck = mesh(new THREE.BoxGeometry(0.22, 0.45, 0.22), white);
  neck.position.set(0, 1.0, 0.5);
  neck.rotation.x = -0.4;
  g.add(neck);
  const head = mesh(new THREE.BoxGeometry(0.24, 0.26, 0.4), white);
  head.position.set(0, 1.2, 0.72);
  g.add(head);
  for (const x of [-0.07, 0.07]) {
    const horn = mesh(new THREE.ConeGeometry(0.04, 0.3, 6), brown);
    horn.position.set(x, 1.42, 0.62);
    horn.rotation.x = -0.5;
    g.add(horn);
  }
  const legs: THREE.Mesh[] = [];
  for (const [x, z] of [[0.18, 0.38], [-0.18, 0.38], [0.18, -0.38], [-0.18, -0.38]]) {
    const l = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 6), brown);
    l.position.set(x, 0.25, z);
    g.add(l);
    legs.push(l);
  }
  const tail = mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), white);
  tail.position.set(0, 0.95, -0.52);
  g.add(tail);
  g.scale.setScalar(1.15);
  return { group: g, legs };
}
