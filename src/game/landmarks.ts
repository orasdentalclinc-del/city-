import * as THREE from 'three';
import { Colliders } from './collision';
import { POIS, MOGRAN, TEA_STALL, type POI } from './world';
import { createHuman } from './characters';

export interface BuildCtx {
  scene: THREE.Scene;
  colliders: Colliders;
  updaters: ((t: number, dt: number) => void)[];
}

// ---------- shared helpers ----------

export function applyWindows(m: THREE.MeshStandardMaterial) {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = vec4(transformed, 1.0);
        vec3 wn = objectNormal;
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          wn = mat3(instanceMatrix) * wn;
        #endif
        wp = modelMatrix * wp;
        vWPos = wp.xyz;
        vWNorm = normalize(mat3(modelMatrix) * wn);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        if (abs(vWNorm.y) < 0.5) {
          float u = dot(vWPos.xz, vec2(-vWNorm.z, vWNorm.x));
          float fx = fract(u / 3.3);
          float fy = fract(vWPos.y / 3.1);
          float win = step(0.2, fx) * step(fx, 0.74) * step(0.32, fy) * step(fy, 0.82);
          win *= step(0.6, vWPos.y);
          float frame = step(0.14, fx) * step(fx, 0.8) * step(0.26, fy) * step(fy, 0.88) * (1.0 - win);
          diffuseColor.rgb *= 1.0 - frame * 0.18;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.11, 0.15), win * 0.88);
        }`
      );
  };
  m.customProgramCacheKey = () => 'windows';
}

const wallCache = new Map<number, THREE.MeshStandardMaterial>();
export function wallMat(color: number) {
  let m = wallCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
    applyWindows(m);
    wallCache.set(color, m);
  }
  return m;
}

const plain = (color: number, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const plaster = plain(0xf2ecdc, 0.9);
const sandstone = plain(0xd7bd8a, 0.95);
const gold = plain(0xd6a62a, 0.3, 0.9);
const domeGreen = plain(0x2f9a74, 0.35, 0.4);
const stone = plain(0x9a958a, 0.9);
const darkMat = plain(0x1f2a33, 0.4, 0.5);
const towerGlass = new THREE.MeshPhysicalMaterial({ color: 0x35607f, metalness: 0.85, roughness: 0.08, clearcoat: 1, side: THREE.DoubleSide, envMapIntensity: 1.6 });
const lawn = plain(0x5f8a35, 1);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x4aa3c8, roughness: 0.05, metalness: 0.2 });

function box(g: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function cyl(g: THREE.Object3D, rt: number, rb: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}
function dome(g: THREE.Object3D, r: number, m: THREE.Material, x: number, y: number, z: number, sy = 1) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), m);
  o.position.set(x, y, z);
  o.scale.y = sy;
  o.castShadow = o.receiveShadow = true;
  g.add(o);
  return o;
}

function addLocalBox(ctx: BuildCtx, g: THREE.Object3D, x0: number, x1: number, z0: number, z1: number) {
  const t = g.rotation.y;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const xs: number[] = [];
  const zs: number[] = [];
  for (const [lx, lz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    xs.push(g.position.x + lx * c + lz * s);
    zs.push(g.position.z - lx * s + lz * c);
  }
  ctx.colliders.add({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
}

export function makeSign(text: string, w: number, h: number, bg = '#0b6b3a', fg = '#ffffff', sub?: string) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const c = cv.getContext('2d')!;
  c.fillStyle = bg;
  c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = fg;
  c.lineWidth = 6;
  c.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  c.fillStyle = fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `bold ${Math.round(cv.height * (sub ? 0.45 : 0.55))}px "Segoe UI", Tahoma, Arial, sans-serif`;
  c.fillText(text, cv.width / 2, cv.height * (sub ? 0.38 : 0.52));
  if (sub) {
    c.font = `bold ${Math.round(cv.height * 0.22)}px "Segoe UI", Arial, sans-serif`;
    c.fillText(sub, cv.width / 2, cv.height * 0.78);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  m.castShadow = false;
  return m;
}

let flagTex: THREE.CanvasTexture | null = null;
function sudanFlagTexture() {
  if (flagTex) return flagTex;
  const cv = document.createElement('canvas');
  cv.width = 300;
  cv.height = 200;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#d21034';
  c.fillRect(0, 0, 300, 67);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 67, 300, 66);
  c.fillStyle = '#000000';
  c.fillRect(0, 133, 300, 67);
  c.fillStyle = '#007229';
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(120, 100);
  c.lineTo(0, 200);
  c.fill();
  flagTex = new THREE.CanvasTexture(cv);
  flagTex.colorSpace = THREE.SRGBColorSpace;
  return flagTex;
}

export function addFlag(ctx: BuildCtx, parent: THREE.Object3D, x: number, y: number, z: number, h = 12) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, h, 8), plain(0xcccccc, 0.4, 0.8));
  pole.position.set(x, y + h / 2, z);
  pole.castShadow = true;
  parent.add(pole);
  const geo = new THREE.PlaneGeometry(3.4, 2.3, 14, 6);
  geo.translate(1.7, 0, 0);
  const base = geo.attributes.position.array.slice() as Float32Array;
  const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: sudanFlagTexture(), side: THREE.DoubleSide, roughness: 0.8 }));
  flag.position.set(x, y + h - 1.3, z);
  flag.castShadow = true;
  parent.add(flag);
  const phase = Math.random() * 6;
  ctx.updaters.push((t) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3];
      pos.setZ(i, Math.sin(bx * 2.2 - t * 4 + phase) * 0.14 * bx);
    }
    pos.needsUpdate = true;
  });
}

function crescentSign(w: number, h: number, label: string) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = Math.round((512 * h) / w);
  const c = cv.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = '#d21034';
  c.beginPath();
  c.arc(cv.height / 2, cv.height / 2, cv.height * 0.34, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.arc(cv.height / 2 + cv.height * 0.1, cv.height / 2, cv.height * 0.28, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#d21034';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `bold ${cv.height * 0.4}px "Segoe UI", Tahoma, Arial, sans-serif`;
  c.fillText(label, cv.width * 0.62, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
}

function clockTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f7f3e4';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = '#222';
  c.lineWidth = 8;
  c.beginPath();
  c.arc(128, 128, 112, 0, Math.PI * 2);
  c.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.lineWidth = i % 3 === 0 ? 7 : 3;
    c.beginPath();
    c.moveTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
    c.lineTo(128 + Math.sin(a) * 106, 128 - Math.cos(a) * 106);
    c.stroke();
  }
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(128, 128);
  c.lineTo(128 - 40, 128 - 38);
  c.stroke();
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(128, 128);
  c.lineTo(128 + 20, 128 - 80);
  c.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- landmark builders ----------

function palace(ctx: BuildCtx, g: THREE.Group) {
  box(g, 20, 10, 14, wallMat(0xf4efe0), 0, 5, 0);
  for (let i = 0; i < 9; i++) cyl(g, 0.5, 0.55, 9.5, plaster, -9 + i * 2.25, 4.75, 8.6, 14);
  box(g, 22, 1, 5.5, plaster, 0, 10, 8.4);
  box(g, 7, 6.5, 12, wallMat(0xeee6d2), 13.5, 3.25, 0);
  box(g, 7, 6.5, 12, wallMat(0xeee6d2), -13.5, 3.25, 0);
  cyl(g, 4.2, 4.2, 2.4, plaster, 0, 11.2, 0, 24);
  dome(g, 4.4, domeGreen, 0, 12.4, 0, 1.0);
  cyl(g, 0.12, 0.12, 3, gold, 0, 18, 0, 6);
  const fountain = cyl(g, 2.2, 2.4, 0.7, stone, 0, 0.35, 15);
  fountain.receiveShadow = true;
  cyl(g, 1.8, 1.8, 0.75, waterMat, 0, 0.4, 15);
  cyl(g, 0.2, 0.2, 2.2, stone, 0, 1.2, 15);
  addFlag(ctx, g, 0, 0, 12.5, 13);
  // guards (faceless)
  for (const x of [-4, 4]) {
    const h = createHuman({ robe: 0x3e4a3a, skin: 0x4d3223, turban: 0x3e4a3a });
    h.group.position.set(x, 0, 12);
    g.add(h.group);
  }
  addLocalBox(ctx, g, -17.5, 17.5, -7, 11);
}

function burj(ctx: BuildCtx, g: THREE.Group) {
  box(g, 30, 7, 26, wallMat(0xcfd3d6), 0, 3.5, 0);
  box(g, 32, 0.8, 28, plaster, 0, 7.2, 0);
  const pts: THREE.Vector2[] = [];
  const H = 96;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const r = 13.5 * Math.sin(Math.PI * (0.08 + 0.84 * Math.pow(t, 0.8))) * (1 - 0.35 * t) + 0.3;
    pts.push(new THREE.Vector2(r, 7.6 + t * H));
  }
  const tower = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), towerGlass);
  tower.scale.set(1, 1, 0.82);
  tower.castShadow = true;
  g.add(tower);
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    const r = 13.5 * Math.sin(Math.PI * (0.08 + 0.84 * Math.pow(t, 0.8))) * (1 - 0.35 * t) + 0.3;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.18, 6, 40), gold);
    ring.rotation.x = Math.PI / 2;
    ring.scale.y = 0.82;
    ring.position.y = 7.6 + t * H;
    g.add(ring);
  }
  cyl(g, 0.15, 0.4, 14, plain(0xbbbbbb, 0.3, 0.9), 0, 7.6 + H + 5, 0, 8);
  addLocalBox(ctx, g, -15, 15, -13, 13);
}

function mosque(ctx: BuildCtx, g: THREE.Group) {
  box(g, 28, 11, 22, wallMat(0xf3eee0), 0, 5.5, 0);
  box(g, 29, 0.8, 23, plaster, 0, 11.4, 0);
  cyl(g, 8, 8.4, 3.2, plaster, 0, 13, 0, 32);
  dome(g, 8.2, domeGreen, 0, 14.6, 0, 0.95);
  cyl(g, 0.15, 0.15, 5, gold, 0, 23, 0, 6);
  const moon = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.14, 6, 14, Math.PI * 1.6), gold);
  moon.position.set(0, 25.6, 0);
  g.add(moon);
  for (const sx of [-1, 1]) {
    const mx = sx * 15.5;
    cyl(g, 1.3, 1.7, 22, plaster, mx, 11, 8, 16);
    cyl(g, 2.5, 2.5, 0.6, stone, mx, 22.2, 8, 16);
    cyl(g, 1.0, 1.2, 6, plaster, mx, 25.3, 8, 16);
    cyl(g, 1.6, 1.6, 0.5, stone, mx, 28.5, 8, 16);
    dome(g, 1.4, gold, mx, 28.7, 8, 1.4);
    cyl(g, 0.07, 0.07, 3, gold, mx, 31.4, 8, 6);
  }
  for (let i = 0; i < 7; i++) box(g, 2.2, 5, 0.5, darkMat, -9 + i * 3, 3.6, 11.1);
  box(g, 5, 7, 0.6, plain(0x6b4a2a, 0.6), 0, 3.5, 11.2);
  box(g, 32, 0.4, 3, stone, 0, 0.2, 15);
  addLocalBox(ctx, g, -17, 17, -11.5, 11.5);
}

function museum(ctx: BuildCtx, g: THREE.Group) {
  box(g, 32, 9, 15, wallMat(0xd9c08e), 0, 4.5, -3);
  box(g, 33, 0.7, 16, sandstone, 0, 9.3, -3);
  for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 13, 4), sandstone);
    p.rotation.y = Math.PI / 4;
    p.position.set(sx * 5.5, 6.5, 6);
    p.castShadow = true;
    g.add(p);
  }
  box(g, 14, 2, 3, sandstone, 0, 12, 6);
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) {
      box(g, 1.1, 1.0, 2.6, sandstone, sx * (8 + i * 3.2), 0.6, 12);
      box(g, 0.8, 0.9, 0.8, sandstone, sx * (8 + i * 3.2), 1.5, 13.3);
    }
  }
  const ob = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 9, 4), stone);
  ob.rotation.y = Math.PI / 4;
  ob.position.set(0, 4.5, 14);
  ob.castShadow = true;
  g.add(ob);
  cyl(g, 0.01, 0.55, 1.2, gold, 0, 9.6, 14, 4);
  addLocalBox(ctx, g, -16.5, 16.5, -11, 9);
}

function friendship(ctx: BuildCtx, g: THREE.Group) {
  const base = cyl(g, 14, 14, 6, towerGlass, 0, 3, 0, 40);
  base.scale.z = 0.8;
  const roof = new THREE.Mesh(new THREE.SphereGeometry(16, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), plaster);
  roof.scale.set(1, 0.45, 0.78);
  roof.position.y = 6;
  roof.castShadow = true;
  g.add(roof);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(g, 0.8, 7, 0.8, plaster, Math.sin(a) * 14.5, 3.5, Math.cos(a) * 11.7);
  }
  box(g, 20, 0.6, 4, stone, 0, 0.3, 14.5);
  addFlag(ctx, g, 13, 0, 13, 11);
  addLocalBox(ctx, g, -16, 16, -12.5, 12.5);
}

function clockTower(ctx: BuildCtx, g: THREE.Group) {
  box(g, 9, 2, 9, stone, 0, 1, 0);
  box(g, 6.5, 14, 6.5, wallMat(0xe6dcc2), 0, 9, 0);
  box(g, 7.4, 1.2, 7.4, stone, 0, 16.4, 0);
  box(g, 7, 7, 7, plaster, 0, 20.5, 0);
  const tex = clockTexture();
  const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), fm);
    const a = (i * Math.PI) / 2;
    f.position.set(Math.sin(a) * 3.55, 20.5, Math.cos(a) * 3.55);
    f.rotation.y = a;
    g.add(f);
  }
  box(g, 7.8, 0.8, 7.8, stone, 0, 24.4, 0);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.6, 8, 4), plain(0x2f6f5a, 0.5, 0.3));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 28.8;
  roof.castShadow = true;
  g.add(roof);
  cyl(g, 0.1, 0.1, 3, gold, 0, 34, 0, 6);
  const fountain = cyl(g, 4, 4.2, 0.7, stone, 0, 0.35, 12);
  void fountain;
  cyl(g, 3.5, 3.5, 0.75, waterMat, 0, 0.4, 12);
  addLocalBox(ctx, g, -4.5, 4.5, -4.5, 4.5);
}

function hospital(ctx: BuildCtx, g: THREE.Group, label: string) {
  box(g, 30, 14, 16, wallMat(0xf2f2ee), 0, 7, 0);
  box(g, 31, 0.8, 17, plaster, 0, 14.4, 0);
  box(g, 12, 5, 4, wallMat(0xe8ecee), 0, 2.5, 10);
  box(g, 13, 0.6, 5, stone, 0, 5.2, 10);
  const s = crescentSign(11, 2.6, label);
  s.position.set(0, 11, 8.05);
  g.add(s);
  box(g, 3, 3, 3, plaster, 11, 16, -3);
  const pad = cyl(g, 4, 4, 0.3, plain(0x55606a), -9, 14.9, -2);
  void pad;
  addFlag(ctx, g, 14, 14.8, 5, 8);
  addLocalBox(ctx, g, -15, 15, -8, 12);
}

function mahdi(ctx: BuildCtx, g: THREE.Group) {
  box(g, 20, 10, 20, wallMat(0xf6f1e2), 0, 5, 0);
  box(g, 21, 0.8, 21, plaster, 0, 10.4, 0);
  const pts = [
    [0.01, 0], [8, 0], [8.7, 1.6], [8.2, 4], [6.6, 7], [4.4, 9.8], [2.4, 12], [1.0, 14], [0.35, 16], [0.01, 17],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const dm = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), plain(0xfbf8ee, 0.55, 0.05));
  dm.position.y = 10.8;
  dm.castShadow = true;
  g.add(dm);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), gold);
  ball.position.y = 28.4;
  g.add(ball);
  cyl(g, 0.08, 0.08, 3.5, gold, 0, 30, 0, 6);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(g, 3, 13, 3, plaster, sx * 10.5, 6.5, sz * 10.5);
      dome(g, 1.9, gold, sx * 10.5, 13, sz * 10.5, 1.2);
    }
  }
  for (let i = 0; i < 4; i++) box(g, 1.6, 4, 0.4, darkMat, -6 + i * 4, 4, 10.1);
  // compound wall
  const wallM = wallMat(0xe9dfc6);
  box(g, 38, 2.6, 0.8, wallM, 0, 1.3, -18.4);
  box(g, 0.8, 2.6, 36, wallM, 18.8, 1.3, 0);
  box(g, 0.8, 2.6, 36, wallM, -18.8, 1.3, 0);
  box(g, 14, 2.6, 0.8, wallM, -12, 1.3, 18.4);
  box(g, 14, 2.6, 0.8, wallM, 12, 1.3, 18.4);
  addLocalBox(ctx, g, -11, 11, -11, 11);
  addLocalBox(ctx, g, -19.2, 19.2, -18.8, -18);
  addLocalBox(ctx, g, 18.4, 19.2, -18, 18.8);
  addLocalBox(ctx, g, -19.2, -18.4, -18, 18.8);
  addLocalBox(ctx, g, -19, -5, 18, 18.8);
  addLocalBox(ctx, g, 5, 19, 18, 18.8);
}

function khalifa(ctx: BuildCtx, g: THREE.Group) {
  const mud = wallMat(0xb88f5c);
  box(g, 28, 8, 7, mud, 0, 4, -10);
  box(g, 28, 8, 7, mud, 0, 4, 10);
  box(g, 7, 8, 14, mud, -10.5, 4, 0);
  box(g, 7, 8, 14, mud, 10.5, 4, 0);
  for (const [x, z, w, d] of [[0, -10, 28.6, 7.6], [0, 10, 28.6, 7.6], [-10.5, 0, 7.6, 14.6], [10.5, 0, 7.6, 14.6]]) box(g, w, 0.7, d, plain(0xa57d4a, 1), x, 8.3, z);
  box(g, 4, 5, 0.5, plain(0x5a3a22, 0.7), 0, 2.5, 13.6);
  cyl(g, 0.35, 0.5, 3, plain(0x6b4a2e), 0, 1.5, 0, 8);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4, 1), plain(0x4f7a2f, 0.95));
  crown.position.set(0, 5, 0);
  crown.castShadow = true;
  g.add(crown);
  addFlag(ctx, g, 12, 8.5, 12, 8);
  addLocalBox(ctx, g, -14, 14, -13.5, -6.5);
  addLocalBox(ctx, g, -14, 14, 6.5, 13.5);
  addLocalBox(ctx, g, -14, -7, -7, 7);
  addLocalBox(ctx, g, 7, 14, -7, 7);
}

// ---------- markets ----------

export function buildMarket(ctx: BuildCtx, blocks: [number, number][], rng: () => number, density: number) {
  const cloth = [0xc0392b, 0xe67e22, 0x2e86ab, 0x16a085, 0xf1c40f, 0x8e44ad, 0xeaeaea, 0xd35400, 0x27ae60];
  const goods = [0xb5321e, 0xe08a1e, 0xe5c13a, 0x4c7a2a, 0x6b3f1f, 0xa3532c, 0xf0e6c8];
  const awnM: THREE.Matrix4[] = [];
  const awnC: THREE.Color[] = [];
  const tabM: THREE.Matrix4[] = [];
  const postM: THREE.Matrix4[] = [];
  const goodM: THREE.Matrix4[] = [];
  const goodC: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const mk = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0) => {
    e.set(rx, ry, 0);
    q.setFromEuler(e);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
  };
  for (const [bx, bz] of blocks) {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (rng() > density) continue;
        const x = bx - 14 + i * 7 + (rng() - 0.5) * 0.6;
        const z = bz - 14 + j * 7 + (rng() - 0.5) * 0.6;
        const ry = rng() < 0.5 ? 0 : Math.PI / 2;
        const c = new THREE.Color(cloth[Math.floor(rng() * cloth.length)]);
        awnM.push(mk(x, 2.55, z, 3.6, 0.1, 2.8, 0.1, ry));
        awnC.push(c);
        tabM.push(mk(x, 0.45, z, 2.8, 0.9, 1.5, 0, ry));
        const ca = Math.cos(ry);
        const sa = Math.sin(ry);
        for (const [px, pz] of [[1.6, 1.2], [-1.6, 1.2], [1.6, -1.2], [-1.6, -1.2]]) {
          postM.push(mk(x + px * ca + pz * sa, 1.25, z - px * sa + pz * ca, 0.1, 2.5, 0.1));
        }
        for (let k = 0; k < 4; k++) {
          const gx = (k - 1.5) * 0.65;
          goodM.push(mk(x + gx * ca, 1.05, z - gx * sa, 0.5, 0.3, 0.5, 0, ry + rng()));
          goodC.push(new THREE.Color(goods[Math.floor(rng() * goods.length)]));
        }
        ctx.colliders.addCenter(x, z, ry === 0 ? 3.0 : 1.7, ry === 0 ? 1.7 : 3.0);
      }
    }
  }
  const mkInst = (geo: THREE.BufferGeometry, m: THREE.Material, mats: THREE.Matrix4[], cols?: THREE.Color[]) => {
    const im = new THREE.InstancedMesh(geo, m, mats.length);
    mats.forEach((mm, i) => {
      im.setMatrixAt(i, mm);
      if (cols) im.setColorAt(i, cols[i]);
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    ctx.scene.add(im);
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  mkInst(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }), awnM, awnC);
  mkInst(unit, plain(0x6b4a2e, 0.9), tabM);
  mkInst(unit, plain(0x3b3b3b, 0.7), postM);
  mkInst(new THREE.BoxGeometry(1, 1, 1), plain(0xffffff, 0.95), goodM, goodC);
}

// ---------- mogran, tea stall, souq gate ----------

function mogran(ctx: BuildCtx) {
  const g = new THREE.Group();
  g.position.set(MOGRAN.x, 0, MOGRAN.z);
  cyl(g, 1.8, 2.4, 16, plaster, 0, 8, 0, 16);
  cyl(g, 5, 5, 0.7, stone, 0, 16.2, 0, 24);
  cyl(g, 4.2, 4.2, 2.4, towerGlass, 0, 17.6, 0, 24);
  const top = new THREE.Mesh(new THREE.ConeGeometry(5, 2, 24), domeGreen);
  top.position.y = 19.9;
  g.add(top);
  const sign = makeSign('المقرن · ملتقى النيلين', 7, 1.8, '#0b5d8c');
  sign.position.set(5.5, 1.8, 5.5);
  sign.rotation.y = -Math.PI * 0.75;
  g.add(sign);
  box(g, 0.2, 2, 0.2, stone, 5.5, 1, 5.5);
  addFlag(ctx, g, -6, 0, 6, 11);
  ctx.scene.add(g);
  ctx.colliders.addCenter(MOGRAN.x, MOGRAN.z, 4.8, 4.8);
  // benches
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    box(b, 2.2, 0.15, 0.6, plain(0x5a3f26), 0, 0.5, 0);
    box(b, 2.2, 0.5, 0.1, plain(0x5a3f26), 0, 0.85, -0.3);
    b.position.set(MOGRAN.x + 8, 0, MOGRAN.z - 4 + i * 4);
    b.rotation.y = Math.PI / 2;
    ctx.scene.add(b);
  }
}

function teaStall(ctx: BuildCtx) {
  const g = new THREE.Group();
  g.position.set(TEA_STALL.x, 0, TEA_STALL.z);
  const wood = plain(0x7a5230, 0.8);
  box(g, 2.2, 0.9, 0.9, wood, 0, 0.45, 0);
  box(g, 2.3, 0.08, 1.0, plain(0x946a3e, 0.7), 0, 0.92, 0);
  cyl(g, 0.05, 0.05, 3.2, plain(0x333333), 0, 1.6, -0.6, 6);
  const um = new THREE.Mesh(new THREE.ConeGeometry(2.6, 0.9, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8742a, side: THREE.DoubleSide, roughness: 0.8 }));
  um.position.set(0, 3.2, -0.6);
  um.castShadow = true;
  g.add(um);
  // charcoal stove + kettle
  box(g, 0.5, 0.35, 0.5, plain(0x222222, 0.7), -0.7, 1.12, 0.05);
  cyl(g, 0.2, 0.26, 0.4, plain(0xb8b8b8, 0.25, 0.9), -0.7, 1.5, 0.05, 12);
  const spout = cyl(g, 0.03, 0.05, 0.3, plain(0xb8b8b8, 0.25, 0.9), -0.45, 1.55, 0.05, 6);
  spout.rotation.z = -0.9;
  for (let i = 0; i < 5; i++) cyl(g, 0.045, 0.04, 0.1, new THREE.MeshPhysicalMaterial({ color: 0xc8782d, transmission: 0.2, roughness: 0.1 }), 0.1 + i * 0.18, 1.02, 0.1, 8);
  for (let i = 0; i < 3; i++) cyl(g, 0.22, 0.2, 0.32, plain(0x2e6fa8, 0.8), -1.4 + i * 1.4, 0.16, 1.5, 10);
  const sign = makeSign('ست الشاي', 1.9, 0.6, '#e8742a', '#ffffff');
  sign.position.set(0, 1.6, 0.52);
  g.add(sign);
  // the faceless tea lady
  const lady = createHuman({ robe: 0xc2185b, skin: 0x5a3a26, female: true, shawl: 0xffc107 });
  lady.group.position.set(0.1, 0, -0.9);
  lady.group.rotation.y = 0;
  g.add(lady.group);
  ctx.scene.add(g);
  ctx.updaters.push((t) => {
    lady.setWave(t * 0.4);
    lady.armR.rotation.z = -0.3;
    lady.armR.rotation.x = -0.9 + Math.sin(t * 2) * 0.15;
  });
  ctx.colliders.addCenter(TEA_STALL.x, TEA_STALL.z - 0.2, 2.4, 2.2);
}

function souqGate(ctx: BuildCtx) {
  const g = new THREE.Group();
  g.position.set(-96, 0, 0);
  const col = wallMat(0xe5d6b0);
  box(g, 2, 8.5, 2, col, 0, 4.25, 7);
  box(g, 2, 8.5, 2, col, 0, 4.25, -7);
  box(g, 2.4, 2.4, 16, col, 0, 9, 0);
  for (const dir of [-1, 1]) {
    const s = makeSign('سوق أم درمان', 11, 2.0, '#8a3b12', '#fff3d0', 'OMDURMAN SOUQ');
    s.position.set(dir * 1.25, 9, 0);
    s.rotation.y = dir * (Math.PI / 2);
    g.add(s);
  }
  ctx.scene.add(g);
  ctx.colliders.addCenter(-96, 7, 2, 2);
  ctx.colliders.addCenter(-96, -7, 2, 2);
}

export function buildLandmarks(ctx: BuildCtx, rng: () => number) {
  const builders: Record<string, (c: BuildCtx, g: THREE.Group) => void> = {
    palace,
    burj,
    museum,
    mosque,
    friendship,
    clock: clockTower,
    bahrihosp: (c, g) => hospital(c, g, 'مستشفى بحري'),
    omdhosp: (c, g) => hospital(c, g, 'مستشفى أم درمان'),
    mahdi,
    khalifa,
  };
  for (const p of POIS as POI[]) {
    const b = builders[p.id];
    if (!b) continue;
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.face;
    b(ctx, g);
    ctx.scene.add(g);
  }
  const souq = POIS.find((p) => p.id === 'souq')!;
  buildMarket(ctx, souq.blocks, rng, 0.82);
  buildMarket(ctx, [[125, -125]], rng, 0.7);
  mogran(ctx);
  teaStall(ctx);
  souqGate(ctx);
  void lawn;
}
