import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BRIDGES,
  BRIDGE_DECK,
  ISLAND,
  PLAY_LIMIT,
  bridgeAt,
  getBlocks,
  heightAt,
  islandE,
  reservedBlocks,
  riverDist,
  vertHalfWidth,
  type Bridge,
} from './world';
import { applyWindows, type BuildCtx } from './landmarks';

function paintGeo(g: THREE.BufferGeometry, color: number) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function mergeParts(parts: THREE.BufferGeometry[]) {
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
}

function makePalmGeo() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintGeo(new THREE.CylinderGeometry(0.2, 0.36, 8.4, 7).translate(0, 4.2, 0), 0x7d6141));
  const greens = [0x3f7d2a, 0x4b8c31, 0x377225];
  for (let i = 0; i < 10; i++) {
    const f = new THREE.ConeGeometry(0.42, 4.6, 4).translate(0, 2.3, 0).scale(1, 1, 0.1);
    f.rotateX(1.05 + (i % 3) * 0.12);
    f.rotateY((i / 10) * Math.PI * 2 + (i % 2) * 0.2);
    f.translate(0, 8.3, 0);
    parts.push(paintGeo(f, greens[i % 3]));
  }
  parts.push(paintGeo(new THREE.SphereGeometry(0.35, 6, 5).translate(0, 8.3, 0), 0x6a4f2f));
  return mergeParts(parts);
}

function makeNeemGeo() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(paintGeo(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 7).translate(0, 1.6, 0), 0x6a4e32));
  const offs = [[0, 5, 0, 2.5], [1.6, 4.2, 0.8, 1.9], [-1.5, 4.4, -0.6, 2.0], [0.3, 4.2, -1.7, 1.8], [-0.4, 6.0, 0.8, 1.6]];
  const greens = [0x4f7a2f, 0x5a8836, 0x436e29, 0x57823a, 0x4a7530];
  offs.forEach(([x, y, z, r], i) => {
    parts.push(paintGeo(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), greens[i]));
  });
  return mergeParts(parts);
}

function instanced(geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], cols?: THREE.Color[], shadow = true) {
  const im = new THREE.InstancedMesh(geo, m, mats.length);
  mats.forEach((mm, i) => {
    im.setMatrixAt(i, mm);
    if (cols) im.setColorAt(i, cols[i]);
  });
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = shadow;
  im.receiveShadow = true;
  im.frustumCulled = false;
  return im;
}

const q = new THREE.Quaternion();
const e = new THREE.Euler();
function M(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  e.set(0, ry, 0);
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

export function buildCity(ctx: BuildCtx, rng: () => number) {
  const palettes = {
    khartoum: [0xe8e2d2, 0xd9d4c6, 0xcfd6d9, 0xf0ebe0, 0xbfc5c8, 0xe4d9c0, 0xb7c3cc],
    bahri: [0xe9d9b8, 0xd8c7a5, 0xe7e0cf, 0xcdbf9f, 0xe3c9a3, 0xc8d3cf],
    omdurman: [0xc9a46c, 0xb88e57, 0xd3b27b, 0xa87f4d, 0xc7ad84, 0xdcc49a],
  } as const;

  const bM: THREE.Matrix4[] = [];
  const bC: THREE.Color[] = [];
  const slabM: THREE.Matrix4[] = [];
  const slabC: THREE.Color[] = [];
  const tankM: THREE.Matrix4[] = [];
  const acM: THREE.Matrix4[] = [];

  const addBuilding = (x: number, z: number, w: number, d: number, h: number, color: THREE.Color, collide = true) => {
    bM.push(M(x, -1, z, w, h + 1, d));
    bC.push(color);
    slabM.push(M(x, h + 0.25, z, w + 0.5, 0.5, d + 0.5));
    slabC.push(color.clone().multiplyScalar(1.12));
    if (rng() < 0.65) {
      tankM.push(M(x + (rng() - 0.5) * (w - 3), h + 1.2, z + (rng() - 0.5) * (d - 3), 1, 1, 1));
    }
    if (rng() < 0.7) acM.push(M(x + (rng() - 0.5) * (w - 2), h + 0.9, z + (rng() - 0.5) * (d - 2), 1.4, 0.8, 1, rng() * 3));
    if (collide) ctx.colliders.addCenter(x, z, w, d);
  };

  const blocks = getBlocks().filter((b) => !reservedBlocks.has(b.x + ',' + b.z));
  for (const b of blocks) {
    const pal = palettes[b.city];
    const half = 17.5;
    const split = rng();
    const lots: [number, number, number, number][] = [];
    if (split < 0.22) lots.push([b.x, b.z, half * 2, half * 2]);
    else if (split < 0.5) {
      if (rng() < 0.5) {
        lots.push([b.x - half / 2, b.z, half, half * 2]);
        lots.push([b.x + half / 2, b.z, half, half * 2]);
      } else {
        lots.push([b.x, b.z - half / 2, half * 2, half]);
        lots.push([b.x, b.z + half / 2, half * 2, half]);
      }
    } else {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push([b.x + (sx * half) / 2, b.z + (sz * half) / 2, half, half]);
    }
    for (const [lx, lz, lw, ld] of lots) {
      if (rng() < 0.06) continue; // empty lot
      const w = lw - 1.5 - rng() * 3;
      const d = ld - 1.5 - rng() * 3;
      let h: number;
      if (b.city === 'khartoum') {
        const f = Math.exp(-Math.hypot(b.x - 175, b.z - 175) / 130);
        h = 6 + rng() * 9 + f * rng() * rng() * 60;
        if (lw > 30) h *= 0.8 + rng() * 0.4;
      } else if (b.city === 'bahri') {
        const f = Math.exp(-Math.hypot(b.x - 175, b.z + 175) / 110);
        h = 5 + rng() * 9 + f * rng() * 22;
      } else {
        h = 3.6 + rng() * 3.5;
        if (rng() < 0.1) h += 5 + rng() * 5;
      }
      const col = new THREE.Color(pal[Math.floor(rng() * pal.length)]);
      addBuilding(lx + (rng() - 0.5) * 1.2, lz + (rng() - 0.5) * 1.2, w, d, h, col);
    }
  }

  // Tuti Island houses
  for (let i = 0; i < 16; i++) {
    const x = ISLAND.x + (rng() - 0.5) * 100;
    const z = ISLAND.z + (rng() - 0.5) * 20;
    if (islandE(x, z) > 0.45 || Math.abs(x - 100) < 8) continue;
    addBuilding(x, z, 5 + rng() * 3, 5 + rng() * 3, 3.2 + rng() * 2, new THREE.Color(palettes.omdurman[Math.floor(rng() * 6)]));
  }

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 });
  applyWindows(wallMaterial);
  const unitUp = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  ctx.scene.add(instanced(unitUp, wallMaterial, bM, bC));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  ctx.scene.add(instanced(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), slabM, slabC));
  ctx.scene.add(instanced(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 12), new THREE.MeshStandardMaterial({ color: 0x1f1f22, roughness: 0.6, metalness: 0.2 }), tankM));
  ctx.scene.add(instanced(unit, new THREE.MeshStandardMaterial({ color: 0xd8dadb, roughness: 0.6, metalness: 0.4 }), acM));

  // ---- trees ----
  const palmGeo = makePalmGeo();
  const neemGeo = makeNeemGeo();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const palms: THREE.Matrix4[] = [];
  const neems: THREE.Matrix4[] = [];
  const nearBridge = (x: number, z: number) => {
    for (const br of BRIDGES) {
      const u = br.axis === 'z' ? x : z;
      const v = br.axis === 'z' ? z : x;
      if (Math.abs(u - br.c) < br.half + 6 && v > br.a - 8 && v < br.b + 8) return true;
    }
    return false;
  };
  const addPalm = (x: number, z: number, s = 0.9 + rng() * 0.5) => {
    if (Math.abs(x) > PLAY_LIMIT || Math.abs(z) > PLAY_LIMIT) return;
    palms.push(M(x, heightAt(x, z), z, s, s, s, rng() * 6));
  };
  // riverside promenade palms
  for (let z = -540; z <= 540; z += 11) {
    const hw = vertHalfWidth(z);
    for (const sgn of [-1, 1]) {
      const x = sgn * (hw + 9);
      if (riverDist(x, z) < 6 || nearBridge(x, z)) continue;
      if (Math.abs(z) < 60 && sgn > 0) continue;
      addPalm(x + (rng() - 0.5) * 2, z);
    }
  }
  for (let x = 38; x <= 540; x += 11) {
    for (const sgn of [-1, 1]) {
      const z = sgn * 33;
      if (nearBridge(x, z) || islandE(x, z) < 2) continue;
      addPalm(x, z + (rng() - 0.5) * 2);
    }
  }
  // island palms
  for (let i = 0; i < 45; i++) {
    const x = ISLAND.x + (rng() - 0.5) * 130;
    const z = ISLAND.z + (rng() - 0.5) * 30;
    if (islandE(x, z) > 0.7 || Math.abs(x - 100) < 6) continue;
    addPalm(x, z);
  }
  // palms in front of landmarks
  for (const [px, pz] of [[60, 52], [90, 52], [110, 52], [140, 52], [160, 52], [190, 52], [40, 62], [40, 90]]) addPalm(px, pz);
  // neem trees in blocks corners
  for (const b of getBlocks()) {
    if (b.city === 'omdurman' && rng() < 0.4) continue;
    for (let i = 0; i < 2; i++) {
      const sx = rng() < 0.5 ? -1 : 1;
      const sz = rng() < 0.5 ? -1 : 1;
      const s = 0.8 + rng() * 0.5;
      const x = b.x + sx * (19.3 + rng() * 0.5);
      const z = b.z + sz * (3 + rng() * 14);
      const x2 = b.x + sx * (3 + rng() * 14);
      const z2 = b.z + sz * 19.3;
      const useA = rng() < 0.5;
      neems.push(M(useA ? x : x2, 0, useA ? z : z2, s, s, s, rng() * 6));
    }
  }
  // neem in lawns
  for (const [px, pz] of [[60, 70], [90, 82], [90, 66], [165, 70], [185, 82], [60, -70], [90, -66], [-110, 118], [-140, 130], [-160, 100]]) {
    neems.push(M(px, 0, pz, 1.1, 1.1, 1.1, rng() * 6));
  }
  ctx.scene.add(instanced(palmGeo, treeMat, palms));
  ctx.scene.add(instanced(neemGeo, treeMat, neems));
  // tiny trunk colliders for palms near player are skipped for fluidity

  // ---- bridges ----
  for (const br of BRIDGES) buildBridge(ctx, br);
}

function buildBridge(ctx: BuildCtx, br: Bridge) {
  const g = new THREE.Group();
  const L = br.b - br.a;
  const W = br.half * 2 + 1.4;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x38383c, roughness: 0.9 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b6ac, roughness: 0.9 });
  const steel = new THREE.MeshStandardMaterial({
    color: br.id === 'macnimir' ? 0x3a6a8a : br.id === 'omdurman' ? 0xe4e6e8 : 0x8a9096,
    roughness: 0.35,
    metalness: 0.7,
  });
  // build along local +X, then rotate
  const deckY = BRIDGE_DECK;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, W), concrete);
  deck.position.set(0, deckY - 0.46, 0);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  const road = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, br.half * 2 - 2.4), asphalt);
  road.position.set(0, deckY + 0.02, 0);
  road.receiveShadow = true;
  g.add(road);
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(L, 0.3), new THREE.MeshBasicMaterial({ color: 0xe6d9a0 }));
  dash.rotation.x = -Math.PI / 2;
  dash.position.set(0, deckY + 0.05, 0);
  g.add(dash);
  for (const sgn of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.3), concrete);
    rail.position.set(0, deckY + 0.5, sgn * (br.half + 0.5));
    rail.castShadow = true;
    g.add(rail);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(L, 0.18, 1.4), new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.9 }));
    sw.position.set(0, deckY + 0.1, sgn * (br.half - 0.9));
    g.add(sw);
  }
  // piers
  for (let v = -L / 2 + 8; v < L / 2 - 6; v += 14) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6, W - 2), concrete);
    pier.position.set(v, deckY - 3.4, 0);
    pier.castShadow = true;
    g.add(pier);
  }
  if (br.arch) {
    for (const sgn of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      const x0 = -L / 2 + 8;
      const x1 = L / 2 - 8;
      const H = 15;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, deckY + 0.4 + H * 4 * t * (1 - t), sgn * (br.half + 0.6)));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.45, 8), steel);
      tube.castShadow = true;
      g.add(tube);
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const y = H * 4 * t * (1 - t);
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, y, 5), steel);
        h.position.set(x0 + (x1 - x0) * t, deckY + 0.4 + y / 2, sgn * (br.half + 0.6));
        g.add(h);
      }
    }
  } else if (br.id === 'tuti') {
    // suspension towers & cables
    const t0 = -L / 2 + 16;
    const t1 = L / 2 - 8;
    for (const sgn of [-1, 1]) {
      for (const tx of [t0, t1]) {
        const tw = new THREE.Mesh(new THREE.BoxGeometry(0.8, 15, 0.8), steel);
        tw.position.set(tx, deckY + 7.5, sgn * (br.half + 0.6));
        tw.castShadow = true;
        g.add(tw);
      }
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const x = t0 + (t1 - t0) * t;
        pts.push(new THREE.Vector3(x, deckY + 3 + 12 * Math.pow(2 * t - 1, 2), sgn * (br.half + 0.6)));
      }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.14, 6), steel));
      for (let i = 1; i < 24; i += 2) {
        const p = pts[i];
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, p.y - deckY, 4), steel);
        h.position.set(p.x, deckY + (p.y - deckY) / 2, p.z);
        g.add(h);
      }
    }
  } else {
    // simple steel girders
    const gd = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, W + 0.4), steel);
    gd.position.set(0, deckY - 1.1, 0);
    gd.castShadow = true;
    g.add(gd);
  }

  const mid = (br.a + br.b) / 2;
  if (br.axis === 'x') {
    g.position.set(mid, 0, br.c);
  } else {
    g.rotation.y = Math.PI / 2;
    g.position.set(br.c, 0, mid);
  }
  ctx.scene.add(g);
  // sanity: ensure bridge deck query matches mesh
  void bridgeAt;
}

// ---- boats on the river (feluccas) ----
export function buildBoats(ctx: BuildCtx, rng: () => number) {
  const boats: { g: THREE.Group; axis: 'z' | 'x'; fixed: number; pos: number; speed: number; dir: number; bob: number }[] = [];
  const hull = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.9, side: THREE.DoubleSide });
  const make = () => {
    const g = new THREE.Group();
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 7), hull);
    h.position.y = 0.2;
    h.castShadow = true;
    g.add(h);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.8, 4), hull);
    bow.rotation.x = Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.2, 4.2);
    bow.scale.set(1, 1, 0.45);
    g.add(bow);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), hull);
    mast.position.set(0, 4, 0.5);
    g.add(mast);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0, 6.4);
    shape.lineTo(4.4, 0.2);
    shape.lineTo(0, 0);
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(shape), sailMat);
    sail.rotation.y = Math.PI / 2;
    sail.position.set(0, 1.0, 0.5);
    sail.castShadow = true;
    g.add(sail);
    return g;
  };
  for (let i = 0; i < 9; i++) {
    const g = make();
    const white = i < 4;
    const axis: 'z' | 'x' = i % 3 === 2 ? 'x' : 'z';
    let fixed = 0;
    let pos = 0;
    if (axis === 'z') {
      const south = white;
      pos = south ? 80 + rng() * 450 : -(80 + rng() * 450);
      fixed = (rng() - 0.5) * (south ? 36 : 56);
    } else {
      pos = 120 + rng() * 420;
      fixed = (rng() < 0.5 ? -1 : 1) * 20.5;
    }
    ctx.scene.add(g);
    boats.push({ g, axis, fixed, pos, speed: 2 + rng() * 2.5, dir: -1, bob: rng() * 6 });
  }
  ctx.updaters.push((t, dt) => {
    for (const b of boats) {
      b.pos += b.dir * b.speed * dt;
      if (b.axis === 'z') {
        if (b.pos < -560) b.pos = 560;
        // skip crossing bridge spans visually fine
        b.g.position.set(b.fixed, -1.45 + Math.sin(t * 1.3 + b.bob) * 0.05, b.pos);
        b.g.rotation.y = Math.PI; // heading north (-z)
      } else {
        if (b.pos < 40) b.pos = 560;
        b.g.position.set(b.pos, -1.45 + Math.sin(t * 1.3 + b.bob) * 0.05, b.fixed);
        b.g.rotation.y = -Math.PI / 2;
      }
      b.g.rotation.z = Math.sin(t * 0.9 + b.bob) * 0.03;
    }
  });
}
