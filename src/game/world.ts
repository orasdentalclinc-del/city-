// World definition for the Khartoum open world (Khartoum, Omdurman, Khartoum Bahri)
// Coordinates: x = east, z = south. The Blue Nile flows in from the east (z=0),
// the White Nile from the south (x=0). They meet at Al-Mogran (0,0) and become the Nile.

export const HALF = 700;
export const WATER_Y = -1.6;
export const ROAD_STEP = 50;
export const ROAD_HALF = 4;
export const SIDEWALK_HALF = 5.2;
export const CITY_EDGE = 550;
export const PLAY_LIMIT = 592;
export const ISLAND = { x: 100, z: 0, rx: 70, rz: 17 };

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fbm(x: number, z: number) {
  return (
    Math.sin(x * 0.013 + Math.sin(z * 0.011) * 2) * 0.5 +
    Math.sin(z * 0.02 + x * 0.007) * 0.3 +
    Math.sin((x + z) * 0.045) * 0.2
  );
}

export function vertHalfWidth(z: number) {
  return 30 + 10 * smooth(20, -20, z);
}

export function riverDist(x: number, z: number) {
  let d = Math.abs(x) - vertHalfWidth(z);
  if (x > 0) d = Math.min(d, Math.abs(z) - 24);
  return d;
}

export function islandE(x: number, z: number) {
  return ((x - ISLAND.x) / ISLAND.rx) ** 2 + ((z - ISLAND.z) / ISLAND.rz) ** 2;
}

export function heightAt(x: number, z: number) {
  const m = Math.max(Math.abs(x), Math.abs(z));
  const edge = smooth(640, 700, m);
  const d = riverDist(x, z);
  const t = smooth(4, -6, d) * (1 - edge);
  let h = -4 * t;
  const isl = -4 + 4.35 * smooth(1.35, 0.8, islandE(x, z));
  if (isl > h) h = isl;
  const bump = smooth(565, 620, m) * (1 - smooth(660, 700, m));
  h += bump * fbm(x, z) * 5 + smooth(565, 700, m) * 3;
  return h;
}

export interface Bridge {
  id: string;
  name: string;
  nameAr: string;
  axis: 'x' | 'z'; // direction the bridge runs along
  c: number; // fixed coordinate
  a: number;
  b: number;
  half: number;
  arch?: boolean;
}

export const BRIDGE_DECK = 0.35;

export const BRIDGES: Bridge[] = [
  { id: 'macnimir', name: 'Mac Nimir Bridge', nameAr: 'كوبري المك نمر', axis: 'z', c: 250, a: -46, b: 46, half: 6.5, arch: true },
  { id: 'tuti', name: 'Tuti Bridge', nameAr: 'كوبري توتي', axis: 'z', c: 100, a: 8, b: 54, half: 5.5 },
  { id: 'omdurman', name: 'Omdurman Bridge', nameAr: 'كوبري أم درمان', axis: 'x', c: 250, a: -54, b: 54, half: 6.5, arch: true },
  { id: 'shambat', name: 'Shambat Bridge', nameAr: 'كوبري شمبات', axis: 'x', c: -250, a: -58, b: 58, half: 6.5 },
];

export function bridgeAt(x: number, z: number): number | null {
  for (const br of BRIDGES) {
    const u = br.axis === 'z' ? x : z;
    const v = br.axis === 'z' ? z : x;
    if (Math.abs(u - br.c) <= br.half && v >= br.a && v <= br.b) {
      return BRIDGE_DECK * smooth(br.a, br.a + 5, v) * smooth(br.b, br.b - 5, v);
    }
  }
  return null;
}

export function groundY(x: number, z: number) {
  const b = bridgeAt(x, z);
  const h = heightAt(x, z);
  return b !== null ? Math.max(b, h) : h;
}

export function isWater(x: number, z: number) {
  return bridgeAt(x, z) === null && heightAt(x, z) < -1.1;
}

export function isDry(x: number, z: number) {
  return heightAt(x, z) > -0.3;
}

export function driveable(x: number, z: number) {
  if (islandE(x, z) < 1.5) return false;
  if (bridgeAt(x, z) !== null) return true;
  return heightAt(x, z) > -0.3;
}

export function districtAt(x: number, z: number): { en: string; ar: string } {
  if (islandE(x, z) < 1.1) return { en: 'Tuti Island', ar: 'جزيرة توتي' };
  if (Math.hypot(x - 42, z - 38) < 22) return { en: 'Al-Mogran', ar: 'المقرن' };
  const d = riverDist(x, z);
  if (d < 0) {
    if (x > 0 && Math.abs(z) < 24) return { en: 'Blue Nile', ar: 'النيل الأزرق' };
    if (z > 0) return { en: 'White Nile', ar: 'النيل الأبيض' };
    return { en: 'The Nile', ar: 'نهر النيل' };
  }
  if (x < 0) return { en: 'Omdurman', ar: 'أم درمان' };
  return z > 0 ? { en: 'Khartoum', ar: 'الخرطوم' } : { en: 'Khartoum Bahri', ar: 'الخرطوم بحري' };
}

export interface POI {
  id: string;
  name: string;
  nameAr: string;
  x: number; // landmark center
  z: number;
  ex: number; // entry point (reachable on road)
  ez: number;
  face: number; // rotation y
  blocks: [number, number][];
  fact: string;
}

export const POIS: POI[] = [
  { id: 'palace', name: 'Republican Palace', nameAr: 'القصر الجمهوري', x: 75, z: 75, ex: 75, ez: 50, face: Math.PI, blocks: [[75, 75]], fact: 'The Republican Palace stands on the bank of the Blue Nile, on the site of the old Governor-General’s palace.' },
  { id: 'burj', name: 'Burj Al-Fateh', nameAr: 'برج الفاتح', x: 125, z: 75, ex: 125, ez: 50, face: Math.PI, blocks: [[125, 75]], fact: 'Burj Al-Fateh (the Corinthian Hotel) is the sail-shaped glass tower that dominates the Khartoum skyline.' },
  { id: 'museum', name: 'National Museum', nameAr: 'المتحف القومي', x: 175, z: 75, ex: 175, ez: 50, face: Math.PI, blocks: [[175, 75]], fact: 'The Sudan National Museum keeps Nubian temples, statues and treasures of Kush and Meroë.' },
  { id: 'mosque', name: 'Great Mosque of Khartoum', nameAr: 'المسجد الكبير', x: 175, z: 175, ex: 175, ez: 150, face: Math.PI, blocks: [[175, 175]], fact: 'The Great Mosque sits in the heart of downtown Khartoum with its two tall minarets.' },
  { id: 'friendship', name: 'Friendship Hall', nameAr: 'قاعة الصداقة', x: 75, z: -75, ex: 75, ez: -50, face: 0, blocks: [[75, -75]], fact: 'Friendship Hall hosts conferences and national celebrations beside the Blue Nile.' },
  { id: 'bahrimarket', name: 'Bahri Market', nameAr: 'سوق بحري', x: 125, z: -125, ex: 125, ez: -100, face: 0, blocks: [[125, -125]], fact: 'Bahri’s market is full of fruit, vegetables and bright textiles.' },
  { id: 'clock', name: 'Bahri Clock Tower', nameAr: 'برج ساعة بحري', x: 175, z: -175, ex: 175, ez: -150, face: 0, blocks: [[175, -175]], fact: 'The clock tower is a meeting point for the people of Khartoum Bahri.' },
  { id: 'bahrihosp', name: 'Bahri Teaching Hospital', nameAr: 'مستشفى بحري', x: 225, z: -125, ex: 225, ez: -100, face: 0, blocks: [[225, -125]], fact: 'Bahri hospital serves thousands of families every day.' },
  { id: 'mahdi', name: 'Mahdi’s Tomb', nameAr: 'ضريح المهدي', x: -125, z: 125, ex: -125, ez: 100, face: Math.PI, blocks: [[-125, 125]], fact: 'The white dome of the Mahdi’s Tomb is one of Omdurman’s best-known landmarks.' },
  { id: 'khalifa', name: 'Khalifa House Museum', nameAr: 'بيت الخليفة', x: -175, z: 125, ex: -175, ez: 100, face: Math.PI, blocks: [[-175, 125]], fact: 'Khalifa House is a two-storey mud-brick house that is now a museum.' },
  { id: 'souq', name: 'Omdurman Souq', nameAr: 'سوق أم درمان', x: -150, z: 0, ex: -150, ez: 0, face: 0, blocks: [[-125, -25], [-175, -25], [-125, 25], [-175, 25]], fact: 'Omdurman Souq is the largest traditional market in Sudan: spices, gold, leather and incense.' },
  { id: 'omdhosp', name: 'Omdurman Teaching Hospital', nameAr: 'مستشفى أم درمان', x: -225, z: -125, ex: -225, ez: -100, face: 0, blocks: [[-225, -125]], fact: 'Omdurman Teaching Hospital is one of the oldest hospitals in the capital.' },
  { id: 'university', name: 'University of Khartoum', nameAr: 'جامعة الخرطوم', x: 225, z: 175, ex: 225, ez: 150, face: Math.PI, blocks: [[225, 175]], fact: 'Founded in 1902 as Gordon Memorial College and renamed in 1956, the University of Khartoum is the oldest university in Sudan.' },
  { id: 'arabi', name: 'Souq Al-Arabi', nameAr: 'السوق العربي', x: 275, z: 75, ex: 275, ez: 50, face: Math.PI, blocks: [[275, 75]], fact: 'Souq Al-Arabi is central Khartoum’s busiest market: textiles, gold, perfume and electronics packed into covered alleys.' },
  { id: 'airport', name: 'Khartoum International Airport', nameAr: 'مطار الخرطوم الدولي', x: 375, z: 175, ex: 375, ez: 150, face: Math.PI, blocks: [[375, 175], [425, 175], [475, 175]], fact: 'Khartoum International Airport lies a few kilometres east of the centre, its runway running parallel to the Blue Nile.' },
  { id: 'stadium', name: 'Khartoum Stadium', nameAr: 'استاد الخرطوم', x: 325, z: 125, ex: 325, ez: 100, face: Math.PI, blocks: [[325, 125]], fact: 'Khartoum Stadium is home to league football and to the Sudan national team, with the crowd spilling into the streets after big wins.' },
  { id: 'railway', name: 'Bahri Railway Station', nameAr: 'محطة سكة حديد بحري', x: 325, z: -175, ex: 325, ez: -150, face: 0, blocks: [[325, -175]], fact: 'Sudan’s railway was begun in 1874; from Khartoum North trains still head to Atbara, Port Sudan and El Obeid.' },
  { id: 'tuti', name: 'Tuti Island Mosque', nameAr: 'مسجد توتي', x: 100, z: 6, ex: 100, ez: 6, face: 0, blocks: [], fact: 'Tuti Island, at the confluence of the two Niles, has been farmed and fished for centuries; its white mosque and palm groves are a Khartoum landmark.' },
];

export const MOGRAN = { x: 42, z: 38 };
export const TEA_STALL = { x: 70, z: 40 };

export const reservedBlocks = new Set<string>();
POIS.forEach((p) => p.blocks.forEach(([bx, bz]) => reservedBlocks.add(bx + ',' + bz)));

export type City = 'khartoum' | 'bahri' | 'omdurman';
export interface Block {
  x: number;
  z: number;
  city: City;
}

export function getBlocks(): Block[] {
  const out: Block[] = [];
  for (let k = -11; k <= 10; k++) {
    for (let j = -11; j <= 10; j++) {
      const cx = 25 + 50 * k;
      const cz = 25 + 50 * j;
      let ok = true;
      for (const [ox, oz] of [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, 0]]) {
        const px = cx + ox;
        const pz = cz + oz;
        if (riverDist(px, pz) < 8 || islandE(px, pz) < 1.8) ok = false;
      }
      if (!ok) continue;
      out.push({ x: cx, z: cz, city: cx < 0 ? 'omdurman' : cz > 0 ? 'khartoum' : 'bahri' });
    }
  }
  return out;
}

export const roadCoords: number[] = [];
for (let c = -550; c <= 550; c += 50) roadCoords.push(c);

// ---------- ground map (texture + minimap) ----------

function px(v: number, size: number) {
  return ((v + HALF) / (2 * HALF)) * size;
}

export function drawGroundMap(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const rng = mulberry32(99);
  const k = size / (2 * HALF);

  ctx.fillStyle = '#cdb485';
  ctx.fillRect(0, 0, size, size);
  const pal = ['#c4a672', '#d8c394', '#bfa06b', '#dccaa0', '#c9b27f'];
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = 0.1 + rng() * 0.18;
    ctx.fillStyle = pal[Math.floor(rng() * pal.length)];
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, (6 + rng() * 40) * (size / 1024) * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const riverStroke = (extra: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineCap = 'butt';
    ctx.lineWidth = 2 * (30 + extra) * k;
    ctx.beginPath();
    ctx.moveTo(px(0, size), px(20, size));
    ctx.lineTo(px(0, size), px(HALF, size));
    ctx.stroke();
    ctx.lineWidth = 2 * (40 + extra) * k;
    ctx.beginPath();
    ctx.moveTo(px(0, size), px(-HALF, size));
    ctx.lineTo(px(0, size), px(-20, size));
    ctx.stroke();
    ctx.lineWidth = 2 * (35 + extra) * k;
    ctx.beginPath();
    ctx.moveTo(px(0, size), px(-22, size));
    ctx.lineTo(px(0, size), px(22, size));
    ctx.stroke();
    ctx.lineWidth = 2 * (24 + extra) * k;
    ctx.beginPath();
    ctx.moveTo(px(0, size), px(0, size));
    ctx.lineTo(px(HALF, size), px(0, size));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };
  for (const e of [95, 75, 58, 44, 32, 22, 14]) riverStroke(e, '#78914a', 0.17);
  riverStroke(7, '#6d5d40', 1);

  // island
  ctx.fillStyle = '#b9a56f';
  ctx.beginPath();
  ctx.ellipse(px(ISLAND.x, size), px(ISLAND.z, size), (ISLAND.rx + 3) * k, (ISLAND.rz + 2.5) * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7d9b45';
  ctx.beginPath();
  ctx.ellipse(px(ISLAND.x, size), px(ISLAND.z, size), (ISLAND.rx - 3) * k, (ISLAND.rz - 3) * k, 0, 0, Math.PI * 2);
  ctx.fill();

  // city pavement per block
  const cityColor: Record<City, string> = { khartoum: '#b9b3a2', bahri: '#b4aa8f', omdurman: '#b39b6d' };
  for (const b of getBlocks()) {
    ctx.fillStyle = cityColor[b.city];
    ctx.fillRect(px(b.x - 25, size), px(b.z - 25, size), 50 * k + 1, 50 * k + 1);
  }

  const rect = (cx: number, cz: number, w: number, d: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(px(cx - w / 2, size), px(cz - d / 2, size), w * k, d * k);
  };
  rect(75, 75, 38, 38, '#6f9040');
  rect(125, 75, 38, 38, '#a9a08a');
  rect(175, 75, 38, 38, '#8aa048');
  rect(175, 175, 38, 38, '#d9cfb8');
  rect(75, -75, 38, 38, '#7c9a45');
  rect(125, -125, 38, 38, '#a58d62');
  rect(175, -175, 38, 38, '#c9c0a8');
  rect(225, -125, 38, 38, '#a4a28f');
  rect(-125, 125, 38, 38, '#d8cdb0');
  rect(-175, 125, 38, 38, '#c3a878');
  rect(-225, -125, 38, 38, '#a7a592');
  for (const [bx, bz] of POIS.find((p) => p.id === 'souq')!.blocks) rect(bx, bz, 40, 40, '#a98a5c');
  rect(225, 175, 40, 40, '#7c9a45'); // University lawn
  rect(225, 175, 26, 26, '#cfc7b2');
  rect(275, 75, 40, 40, '#a98a5c'); // Souq Al-Arabi
  rect(325, 125, 40, 40, '#7f9c4b'); // Stadium pitch
  rect(325, 125, 24, 15, '#5f8a35');
  rect(325, -175, 40, 40, '#9a948a'); // Bahri railway
  rect(100, 6, 18, 12, '#d3c4a1'); // Tuti mosque yard
  // airport apron, taxiway and runway
  rect(375, 175, 50, 50, '#b9b6ab');
  rect(425, 175, 50, 50, '#a8a49a');
  rect(475, 175, 50, 50, '#a8a49a');
  rect(41, 37, 18, 26, '#78994a');
  const prom = (x0: number, z0: number, w: number, d: number) => rect(x0 + w / 2, z0 + d / 2, w, d, '#7f9c4b');
  prom(50, 28, 500, 18);
  prom(50, -46, 500, 18);
  prom(34, 54, 10, 496);
  prom(34, -550, 10, 496);

  // roads
  const segs = (draw: (x: number, z: number, x2: number, z2: number) => void) => {
    const ok = (x: number, z: number) => isDry(x, z) || bridgeAt(x, z) !== null;
    for (const c of roadCoords) {
      for (let v = -550; v < 550; v += 10) {
        if (c !== 0 && ok(c, v) && ok(c, v + 10)) draw(c, v, c, v + 10);
        if (ok(v, c) && ok(v + 10, c)) draw(v, c, v + 10, c);
      }
    }
  };
  const strokeRoads = (color: string, width: number, dash?: number[]) => {
    ctx.lineCap = 'butt';
    ctx.strokeStyle = color;
    ctx.lineWidth = width * k;
    ctx.setLineDash(dash ? dash.map((d) => d * k) : []);
    ctx.beginPath();
    segs((a, b, c, d) => {
      ctx.moveTo(px(a, size), px(b, size));
      ctx.lineTo(px(c, size), px(d, size));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  };
  strokeRoads('#a49d8d', SIDEWALK_HALF * 2);
  strokeRoads('#928b7c', ROAD_HALF * 2 + 1.6); // kerb
  strokeRoads('#3a3a3e', ROAD_HALF * 2);
  strokeRoads('#4a4a4e', ROAD_HALF * 2 - 2.2); // worn centre of the lane
  strokeRoads('#e6d9a0', 0.35, [3, 3]);

  // airport runway (drawn over the streets it crosses)
  ctx.fillStyle = '#3d3d40';
  ctx.fillRect(px(352, size), px(171, size), 148 * k, 22 * k);
  ctx.fillStyle = '#4a4a4d';
  ctx.fillRect(px(352, size), px(171, size), 148 * k, 2.2 * k);
  ctx.fillRect(px(352, size), px(190.8, size), 148 * k, 2.2 * k);
  ctx.fillStyle = '#e8e4d2';
  ctx.globalAlpha = 0.85;
  for (let d = 0; d < 9; d++) ctx.fillRect(px(362 + d * 15, size), px(181.4, size), 7 * k, 1.0 * k);
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(px(354, size), px(173 + i * 2.4, size), 3.4 * k, 1.2 * k);
    ctx.fillRect(px(497, size), px(173 + i * 2.4, size), 3.4 * k, 1.2 * k);
  }
  ctx.globalAlpha = 1;


  // ---- street level detail ----
  const dry = (x: number, z: number) => isDry(x, z) || bridgeAt(x, z) !== null;

  // block paving grid + kerb around each city block
  ctx.lineJoin = 'round';
  for (const b of getBlocks()) {
    const x0 = b.x - 25;
    const z0 = b.z - 25;
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#8d8778';
    ctx.lineWidth = 0.22 * k;
    ctx.beginPath();
    for (let g = 0; g <= 50; g += 5) {
      ctx.moveTo(px(x0 + g, size), px(z0, size));
      ctx.lineTo(px(x0 + g, size), px(z0 + 50, size));
      ctx.moveTo(px(x0, size), px(z0 + g, size));
      ctx.lineTo(px(x0 + 50, size), px(z0 + g, size));
    }
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#8a8272';
    ctx.lineWidth = 0.5 * k;
    ctx.strokeRect(px(x0 + 1.2, size), px(z0 + 1.2, size), 47.6 * k, 47.6 * k);
  }
  ctx.globalAlpha = 1;

  // zebra crossings just outside road junctions
  ctx.fillStyle = '#ded8c6';
  for (const c of roadCoords) {
    for (const d of roadCoords) {
      if (Math.abs(c) === 550 || Math.abs(d) === 550) continue;
      if (!dry(c, d + 7) || !dry(c + 7, d)) continue;
      for (let i = 0; i < 5; i++) {
        const o = -3.2 + i * 1.35;
        // across the north-south road
        ctx.globalAlpha = 0.55;
        ctx.fillRect(px(c + o, size), px(d + 6.4, size), 0.7 * k, 5.2 * k);
        ctx.fillRect(px(c + o, size), px(d - 11.6, size), 0.7 * k, 5.2 * k);
        // across the east-west road
        ctx.fillRect(px(c + 6.4, size), px(d + o, size), 5.2 * k, 0.7 * k);
        ctx.fillRect(px(c - 11.6, size), px(d + o, size), 5.2 * k, 0.7 * k);
      }
    }
  }
  ctx.globalAlpha = 1;

  // tar patches, oil stains and manholes along the roads
  for (let i = 0; i < 2200; i++) {
    const horizontal = rng() > 0.5;
    const along = (Math.round((rng() * 1100 - 550) / 50) * 50) + (rng() - 0.5) * 60;
    const across = (rng() - 0.5) * ROAD_HALF * 2.1;
    const x = horizontal ? along : across + Math.round((rng() * 1100 - 550) / 50) * 50;
    const z = horizontal ? across + Math.round((rng() * 1100 - 550) / 50) * 50 : along;
    if (!dry(x, z)) continue;
    ctx.globalAlpha = 0.06 + rng() * 0.16;
    ctx.fillStyle = rng() > 0.35 ? '#2c2c30' : '#55555a';
    ctx.beginPath();
    ctx.ellipse(px(x, size), px(z, size), (0.6 + rng() * 3.2) * k, (0.5 + rng() * 2.2) * k, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const c of roadCoords) {
    for (let v = -540; v < 540; v += 50) {
      const x = c + (rng() - 0.5) * 8;
      const z = v + (rng() - 0.5) * 8;
      if (!dry(x, z)) continue;
      ctx.fillStyle = '#3f3f42';
      ctx.beginPath();
      ctx.arc(px(x, size), px(z, size), 0.45 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#26262a';
      ctx.lineWidth = 0.12 * k;
      ctx.stroke();
    }
  }

  // sand drifts spilling onto the tarmac at the desert edges
  for (let i = 0; i < 900; i++) {
    const x = rng() * 1100 - 550;
    const z = Math.abs(rng() * 1100 - 550);
    if (!dry(x, z)) continue;
    ctx.globalAlpha = 0.05 + rng() * 0.12;
    ctx.fillStyle = rng() > 0.5 ? '#d9c79b' : '#c9b083';
    ctx.beginPath();
    ctx.ellipse(px(x, size), px(z, size), (1 + rng() * 6) * k, (0.8 + rng() * 3) * k, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // speckles: two scales of grain so the ground never looks like a flat wash
  for (let i = 0; i < 160000; i++) {
    ctx.globalAlpha = 0.04 + rng() * 0.07;
    ctx.fillStyle = rng() > 0.5 ? '#ffffff' : '#000000';
    const s = 1 + rng() * 2;
    ctx.fillRect(rng() * size, rng() * size, s, s);
  }
  for (let i = 0; i < 30000; i++) {
    ctx.globalAlpha = 0.03 + rng() * 0.05;
    ctx.fillStyle = rng() > 0.5 ? '#f2e6c8' : '#6b5a3c';
    ctx.fillRect(rng() * size, rng() * size, 3 + rng() * 5, 2 + rng() * 4);
  }
  ctx.globalAlpha = 1;
  return cv;
}

export function drawMiniBase(ground: HTMLCanvasElement, size = 1400): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.drawImage(ground, 0, 0, size, size);
  const k = size / (2 * HALF);
  ctx.fillStyle = '#4f8aa6';
  const wr = (x0: number, z0: number, x1: number, z1: number) => ctx.fillRect(px(x0, size), px(z0, size), (x1 - x0) * k, (z1 - z0) * k);
  wr(-30, 20, 30, HALF);
  wr(-40, -HALF, 40, -20);
  wr(-35, -22, 35, 22);
  wr(0, -24, HALF, 24);
  ctx.fillStyle = '#86a352';
  ctx.beginPath();
  ctx.ellipse(px(ISLAND.x, size), px(ISLAND.z, size), ISLAND.rx * k, ISLAND.rz * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e7e2d0';
  ctx.lineWidth = 3;
  for (const b of BRIDGES) {
    ctx.beginPath();
    if (b.axis === 'z') {
      ctx.moveTo(px(b.c, size), px(b.a, size));
      ctx.lineTo(px(b.c, size), px(b.b, size));
    } else {
      ctx.moveTo(px(b.a, size), px(b.c, size));
      ctx.lineTo(px(b.b, size), px(b.c, size));
    }
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px sans-serif';
  const label = (t: string, x: number, z: number, col = 'rgba(20,20,20,.75)') => {
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.strokeText(t, px(x, size), px(z, size));
    ctx.fillStyle = col;
    ctx.fillText(t, px(x, size), px(z, size));
  };
  label('OMDURMAN', -300, -300);
  label('KHARTOUM', 320, 320);
  label('BAHRI', 320, -320);
  ctx.font = 'bold 17px sans-serif';
  label('Blue Nile', 400, 6, '#0b3d5c');
  label('White Nile', 0, 450, '#0b3d5c');
  label('Nile', 0, -420, '#0b3d5c');
  label('Tuti', 100, 5, '#245c1b');
  return cv;
}
