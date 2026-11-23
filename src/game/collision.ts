export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export class Colliders {
  private cell = 40;
  private map = new Map<string, Box[]>();

  add(b: Box) {
    const c = this.cell;
    for (let i = Math.floor(b.x0 / c); i <= Math.floor(b.x1 / c); i++) {
      for (let j = Math.floor(b.z0 / c); j <= Math.floor(b.z1 / c); j++) {
        const k = i + ',' + j;
        let a = this.map.get(k);
        if (!a) {
          a = [];
          this.map.set(k, a);
        }
        a.push(b);
      }
    }
  }

  addCenter(x: number, z: number, w: number, d: number) {
    this.add({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }

  /** Push a circle out of all boxes. Returns the corrected position and whether a hit happened. */
  resolve(x: number, z: number, r: number) {
    let hit = false;
    const c = this.cell;
    for (let iter = 0; iter < 2; iter++) {
      const i0 = Math.floor((x - r) / c);
      const i1 = Math.floor((x + r) / c);
      const j0 = Math.floor((z - r) / c);
      const j1 = Math.floor((z + r) / c);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const arr = this.map.get(i + ',' + j);
          if (!arr) continue;
          for (const b of arr) {
            const cx = Math.max(b.x0, Math.min(x, b.x1));
            const cz = Math.max(b.z0, Math.min(z, b.z1));
            const dx = x - cx;
            const dz = z - cz;
            const d2 = dx * dx + dz * dz;
            if (d2 < r * r) {
              hit = true;
              if (d2 > 1e-8) {
                const d = Math.sqrt(d2);
                x = cx + (dx / d) * r;
                z = cz + (dz / d) * r;
              } else {
                // center inside box: push out along the shortest axis
                const l = x - b.x0;
                const rr = b.x1 - x;
                const t = z - b.z0;
                const bt = b.z1 - z;
                const m = Math.min(l, rr, t, bt);
                if (m === l) x = b.x0 - r;
                else if (m === rr) x = b.x1 + r;
                else if (m === t) z = b.z0 - r;
                else z = b.z1 + r;
              }
            }
          }
        }
      }
    }
    return { x, z, hit };
  }
}
