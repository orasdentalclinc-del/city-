import * as THREE from 'three';

export type VehicleType = 'sedan' | 'taxi' | 'pickup' | 'raksha' | 'racer' | 'bus';

export interface VehicleSpec {
  name: string;
  nameAr: string;
  max: number;
  acc: number;
  steer: number;
  radius: number;
  seat: { x: number; y: number; z: number; s: number };
}

export const SPECS: Record<VehicleType, VehicleSpec> = {
  sedan: { name: 'Sedan', nameAr: 'سيارة', max: 32, acc: 13, steer: 1.9, radius: 2.1, seat: { x: 0.42, y: -0.38, z: 0.25, s: 0.82 } },
  taxi: { name: 'Taxi', nameAr: 'تاكسي', max: 30, acc: 12, steer: 1.9, radius: 2.1, seat: { x: 0.42, y: -0.38, z: 0.25, s: 0.82 } },
  racer: { name: 'Sports Car', nameAr: 'سيارة سباق', max: 46, acc: 21, steer: 2.1, radius: 2.1, seat: { x: 0.4, y: -0.55, z: 0.1, s: 0.78 } },
  pickup: { name: 'Pickup Truck', nameAr: 'بيك أب', max: 29, acc: 11, steer: 1.7, radius: 2.5, seat: { x: 0.45, y: -0.15, z: 0.65, s: 0.85 } },
  raksha: { name: 'Raksha', nameAr: 'ركشة', max: 19, acc: 8, steer: 2.5, radius: 1.5, seat: { x: 0, y: -0.28, z: 0.15, s: 0.85 } },
  bus: { name: 'Amjad Bus', nameAr: 'حافلة', max: 22, acc: 7, steer: 1.4, radius: 3.2, seat: { x: 0.9, y: 0.2, z: 3.0, s: 0.85 } },
};

export interface VehicleMesh {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  seat: THREE.Group;
}

const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c141b, metalness: 0.9, roughness: 0.05, clearcoat: 1 });
const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.2 });
const headL = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 1.6 });
const tailL = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xff1010, emissiveIntensity: 1.1 });

function paint(color: number) {
  return new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

function wheel(r: number, w: number, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), dark);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 10), chrome);
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  return g;
}

export function createVehicleMesh(type: VehicleType, color: number): VehicleMesh {
  const group = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const body = paint(color);

  const addWheels = (r: number, w: number, xs: number, zf: number, zr: number) => {
    for (const [x, z] of [[xs, zf], [-xs, zf], [xs, zr], [-xs, zr]]) {
      const wh = wheel(r, w, x, r, z);
      wheels.push(wh);
      group.add(wh);
    }
  };

  if (type === 'sedan' || type === 'taxi' || type === 'racer') {
    const low = type === 'racer';
    group.add(box(1.86, low ? 0.5 : 0.62, 4.4, body, 0, low ? 0.55 : 0.64, 0));
    group.add(box(1.84, 0.1, 1.4, body, 0, low ? 0.84 : 0.98, 1.4));
    const cy = low ? 1.0 : 1.2;
    group.add(box(1.6, low ? 0.36 : 0.44, 2.0, glass, 0, cy, -0.3));
    group.add(box(1.66, 0.07, 2.1, body, 0, cy + (low ? 0.2 : 0.25), -0.3));
    group.add(box(1.9, 0.18, 0.2, dark, 0, 0.42, 2.2));
    group.add(box(1.9, 0.18, 0.2, dark, 0, 0.42, -2.2));
    for (const x of [-0.65, 0.65]) {
      group.add(box(0.4, 0.14, 0.06, headL, x, 0.78, 2.21));
      group.add(box(0.4, 0.14, 0.06, tailL, x, 0.78, -2.21));
    }
    if (type === 'taxi') group.add(box(0.7, 0.2, 0.3, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffcc, emissiveIntensity: 0.5 }), 0, 1.6, -0.3));
    if (low) {
      group.add(box(1.8, 0.07, 0.5, dark, 0, 1.12, -2.0));
      group.add(box(0.07, 0.25, 0.3, dark, 0.7, 1.0, -2.0));
      group.add(box(0.07, 0.25, 0.3, dark, -0.7, 1.0, -2.0));
    }
    addWheels(0.36, 0.28, 0.93, 1.4, -1.4);
  } else if (type === 'pickup') {
    group.add(box(1.95, 0.7, 5.0, body, 0, 0.8, 0));
    group.add(box(1.85, 0.7, 1.9, body, 0, 1.45, 0.7));
    group.add(box(1.88, 0.5, 1.7, glass, 0, 1.5, 0.75));
    group.add(box(1.7, 0.06, 1.9, body, 0, 1.82, 0.65));
    group.add(box(0.1, 0.5, 2.0, body, 0.93, 1.3, -1.45));
    group.add(box(0.1, 0.5, 2.0, body, -0.93, 1.3, -1.45));
    group.add(box(1.9, 0.5, 0.1, body, 0, 1.3, -2.45));
    group.add(box(2.0, 0.2, 0.25, chrome, 0, 0.5, 2.5));
    for (const x of [-0.7, 0.7]) {
      group.add(box(0.4, 0.16, 0.06, headL, x, 0.95, 2.51));
      group.add(box(0.3, 0.16, 0.06, tailL, x, 0.95, -2.51));
    }
    addWheels(0.42, 0.3, 0.98, 1.6, -1.6);
  } else if (type === 'raksha') {
    const yellow = paint(0xf2b705);
    const blue = paint(0x1769aa);
    group.add(box(1.25, 0.55, 2.2, yellow, 0, 0.72, -0.2));
    group.add(box(0.9, 0.75, 0.7, yellow, 0, 0.85, 1.05));
    group.add(box(1.3, 0.08, 2.4, blue, 0, 2.0, -0.1));
    for (const [x, z] of [[0.62, -1.15], [-0.62, -1.15], [0.62, 0.7], [-0.62, 0.7]]) group.add(box(0.06, 1.2, 0.06, dark, x, 1.4, z));
    group.add(box(1.0, 0.1, 0.6, new THREE.MeshStandardMaterial({ color: 0x4a2a1a }), 0, 1.05, -0.6));
    group.add(box(0.35, 0.12, 0.05, headL, 0, 0.9, 1.41));
    const front = wheel(0.3, 0.2, 0, 0.3, 1.15);
    wheels.push(front);
    group.add(front);
    for (const x of [0.7, -0.7]) {
      const w = wheel(0.3, 0.2, x, 0.3, -0.75);
      wheels.push(w);
      group.add(w);
    }
  } else {
    // amjad bus
    const white = paint(0xf1efe6);
    group.add(box(2.4, 1.9, 7.4, white, 0, 1.4, 0));
    group.add(box(2.42, 0.6, 7.2, paint(color), 0, 0.85, 0));
    group.add(box(2.44, 0.75, 6.8, glass, 0, 1.75, -0.1));
    group.add(box(2.3, 0.7, 0.05, glass, 0, 1.75, 3.71));
    for (const x of [-0.85, 0.85]) {
      group.add(box(0.4, 0.2, 0.06, headL, x, 0.8, 3.72));
      group.add(box(0.4, 0.2, 0.06, tailL, x, 0.8, -3.72));
    }
    addWheels(0.5, 0.35, 1.1, 2.3, -2.2);
  }

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  const seat = new THREE.Group();
  group.add(seat);
  return { group, wheels, seat };
}
