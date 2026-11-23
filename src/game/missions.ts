import { MOGRAN, POIS, TEA_STALL } from './world';
import type { VehicleType } from './vehicles';

export interface Step {
  kind: 'goto' | 'enter' | 'catch';
  text: string;
  textAr?: string;
  x?: number;
  z?: number;
  radius?: number;
  vehicle?: 'in' | 'out';
  vehicleId?: string;
  npc?: { x: number; z: number; robe: number; female?: boolean };
  fact?: string;
}

export interface Mission {
  id: string;
  title: string;
  titleAr: string;
  district: string;
  icon: string;
  desc: string;
  reward: number;
  stars: number;
  time?: number; // seconds
  timeStart?: number; // step index at which the timer starts
  steps: Step[];
}

export interface SpecialVehicle {
  id: string;
  type: VehicleType;
  color: number;
  x: number;
  z: number;
  heading: number;
}

export const SPECIAL_VEHICLES: SpecialVehicle[] = [
  { id: 'taxi1', type: 'taxi', color: 0xf2b705, x: 48, z: 82, heading: 0 },
  { id: 'raksha', type: 'raksha', color: 0xf2b705, x: 52, z: 128, heading: Math.PI },
  { id: 'hilux', type: 'pickup', color: 0xf3f3f1, x: 230, z: -98, heading: Math.PI / 2 },
  { id: 'racer', type: 'racer', color: 0xc62828, x: 125, z: 152, heading: Math.PI / 2 },
  { id: 'sedan1', type: 'sedan', color: 0x2c4a7a, x: 60, z: 46, heading: Math.PI / 2 },
  { id: 'bus1', type: 'bus', color: 0x1b8a4a, x: -102, z: 60, heading: 0 },
];

const poi = (id: string) => POIS.find((p) => p.id === id)!;
const p = (id: string) => ({ x: poi(id).ex, z: poi(id).ez });

export const MISSIONS: Mission[] = [
  {
    id: 'welcome',
    title: 'Where the Niles Meet',
    titleAr: 'ملتقى النيلين',
    district: 'Khartoum',
    icon: '🌊',
    desc: 'Your first day in the capital. Visit Al-Mogran, borrow a taxi and see the skyline.',
    reward: 1500,
    stars: 1,
    steps: [
      { kind: 'goto', text: 'Walk to Al-Mogran, where the Blue and White Niles meet.', textAr: 'اذهب إلى المقرن', x: MOGRAN.x, z: MOGRAN.z, radius: 6, vehicle: 'out', fact: 'At Al-Mogran the Blue Nile (from Ethiopia) and the White Nile (from Uganda) join to form the River Nile.' },
      { kind: 'enter', text: 'Get into the yellow taxi on the road (press E near it).', vehicleId: 'taxi1' },
      { kind: 'goto', text: 'Drive to Burj Al-Fateh on Nile Street.', ...p('burj'), radius: 10, vehicle: 'in', fact: poi('burj').fact },
      { kind: 'goto', text: 'Park up and walk to the Republican Palace.', ...p('palace'), radius: 9, vehicle: 'out', fact: poi('palace').fact },
    ],
  },
  {
    id: 'tea',
    title: 'Sitt al-Shai: Tea Run',
    titleAr: 'ست الشاي',
    district: 'Khartoum',
    icon: '🫖',
    desc: 'The famous tea lady of Nile Street has three orders waiting for customers around downtown. Deliver them hot!',
    reward: 2500,
    stars: 1,
    time: 170,
    steps: [
      { kind: 'goto', text: 'Pick up the tea tray from Sitt al-Shai at her stall.', textAr: 'خذ الشاي من ست الشاي', x: TEA_STALL.x, z: TEA_STALL.z + 3, radius: 3.5, vehicle: 'out' },
      { kind: 'goto', text: 'Deliver tea to the office clerk.', x: 150, z: 75, radius: 4, vehicle: 'out', npc: { x: 154.8, z: 77, robe: 0xb7c7d4 } },
      { kind: 'goto', text: 'Deliver tea to the shopkeeper.', x: 200, z: 125, radius: 4, vehicle: 'out', npc: { x: 205, z: 127, robe: 0xf4efe0 } },
      { kind: 'goto', text: 'Deliver the last glass to the taxi driver’s mother.', x: 125, z: 150, radius: 4, vehicle: 'out', npc: { x: 127, z: 155, robe: 0x00897b, female: true }, fact: 'Sudanese tea is sweet, often spiced with ginger or cinnamon, and sold by women under shady trees.' },
    ],
  },
  {
    id: 'raksha',
    title: 'Raksha Rider',
    titleAr: 'سائق الركشة',
    district: 'Khartoum → Omdurman',
    icon: '🛺',
    desc: 'Take a passenger by raksha across the White Nile to the great souq of Omdurman.',
    reward: 3000,
    stars: 2,
    time: 160,
    timeStart: 1,
    steps: [
      { kind: 'enter', text: 'Hop into the Raksha parked on the White Nile road.', vehicleId: 'raksha' },
      { kind: 'goto', text: 'Pick up your passenger waiting on the corner.', x: 150, z: 150, radius: 7, vehicle: 'in', npc: { x: 153, z: 155.4, robe: 0xad1457, female: true } },
      { kind: 'goto', text: 'Cross the Omdurman Bridge and drop the passenger at the Souq.', ...p('souq'), radius: 10, vehicle: 'in', fact: poi('souq').fact },
    ],
  },
  {
    id: 'souq',
    title: 'Souq Spice Run',
    titleAr: 'جولة السوق',
    district: 'Omdurman',
    icon: '🌶️',
    desc: 'Collect five Sudanese goods from the stalls of Omdurman Souq and deliver them to Abu Ahmed.',
    reward: 2200,
    stars: 2,
    steps: [
      { kind: 'goto', text: 'Buy Karkadeh (hibiscus) from the first stall.', x: -125, z: 0, radius: 4, vehicle: 'out' },
      { kind: 'goto', text: 'Buy Gum Arabic (Hashab) at the south aisle.', x: -150, z: -30, radius: 4, vehicle: 'out' },
      { kind: 'goto', text: 'Buy Simsim (sesame) from the stall in the west.', x: -175, z: 0, radius: 4, vehicle: 'out' },
      { kind: 'goto', text: 'Buy fresh dates from the north aisle.', x: -150, z: 30, radius: 4, vehicle: 'out' },
      { kind: 'goto', text: 'Buy Cinnamon at the central crossing.', x: -150, z: 0, radius: 4, vehicle: 'out' },
      { kind: 'goto', text: 'Deliver the basket to Abu Ahmed.', x: -100, z: 25, radius: 4, vehicle: 'out', npc: { x: -94.8, z: 26, robe: 0xf8f8f8 }, fact: 'Sudan is the world’s largest producer of gum arabic, used in drinks and medicine around the world.' },
    ],
  },
  {
    id: 'goat',
    title: 'The Runaway Goat',
    titleAr: 'الخروف الهارب',
    district: 'Tuti Island',
    icon: '🐐',
    desc: 'A goat has escaped onto Tuti Island! Cross the bridge, sprint (Shift) and catch it before it gets away.',
    reward: 1800,
    stars: 2,
    steps: [
      { kind: 'goto', text: 'Cross the Tuti Bridge onto the green island.', x: 100, z: 26, radius: 6, vehicle: 'out' },
      { kind: 'catch', text: 'Catch the runaway goat! Hold Shift to sprint.' },
      { kind: 'goto', text: 'Lead the goat back to its owner at the bridge.', x: 100, z: 60, radius: 5, vehicle: 'out', npc: { x: 105.4, z: 62, robe: 0xe9e2c8 }, fact: 'Tuti is a farming island where the Blue and White Niles meet — quiet, green and car-light.' },
    ],
  },
  {
    id: 'medicine',
    title: 'Medicine Express',
    titleAr: 'توصيل الدواء',
    district: 'Bahri → Omdurman',
    icon: '💊',
    desc: 'Race a pickup truck of medical supplies from Bahri Hospital to Omdurman Hospital before the clock runs out.',
    reward: 4000,
    stars: 3,
    time: 120,
    timeStart: 1,
    steps: [
      { kind: 'enter', text: 'Get into the white pickup near Bahri Hospital.', vehicleId: 'hilux' },
      { kind: 'goto', text: 'Load the supplies at Bahri Teaching Hospital.', ...p('bahrihosp'), radius: 9, vehicle: 'in' },
      { kind: 'goto', text: 'Cross Shambat Bridge and deliver to Omdurman Hospital.', ...p('omdhosp'), radius: 10, vehicle: 'in', fact: poi('omdhosp').fact },
    ],
  },
  {
    id: 'race',
    title: 'Three Cities Time Trial',
    titleAr: 'سباق المدن الثلاث',
    district: 'Whole Capital',
    icon: '🏁',
    desc: 'Drive the red sports car through every checkpoint: Khartoum, Bahri, Omdurman and back across the bridges.',
    reward: 6000,
    stars: 3,
    time: 130,
    timeStart: 1,
    steps: [
      { kind: 'enter', text: 'Jump in the red sports car on Nile Street.', vehicleId: 'racer' },
      { kind: 'goto', text: 'Checkpoint 1: head east towards Mac Nimir Bridge.', x: 250, z: 150, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 2: cross Mac Nimir Bridge over the Blue Nile.', x: 250, z: 0, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 3: Khartoum Bahri.', x: 250, z: -150, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 4: along the northern avenue.', x: 100, z: -250, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 5: across Shambat Bridge.', x: 0, z: -250, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 6: into Omdurman.', x: -150, z: -250, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 7: the western crossroads.', x: -250, z: 0, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 8: head south and then east.', x: -150, z: 250, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Checkpoint 9: the Omdurman Bridge.', x: 0, z: 250, radius: 13, vehicle: 'in' },
      { kind: 'goto', text: 'Finish line in Khartoum!', x: 100, z: 250, radius: 13, vehicle: 'in' },
    ],
  },
  {
    id: 'tour',
    title: 'Capital Landmarks Tour',
    titleAr: 'جولة المعالم',
    district: 'All cities',
    icon: '📸',
    desc: 'Visit five famous landmarks of the three cities and learn their stories. Walk or drive — your choice.',
    reward: 3500,
    stars: 2,
    steps: [
      { kind: 'goto', text: 'Visit the Republican Palace.', ...p('palace'), radius: 10, fact: poi('palace').fact },
      { kind: 'goto', text: 'Visit the Great Mosque of Khartoum.', ...p('mosque'), radius: 10, fact: poi('mosque').fact },
      { kind: 'goto', text: 'Visit the Bahri Clock Tower.', ...p('clock'), radius: 10, fact: poi('clock').fact },
      { kind: 'goto', text: 'Visit Friendship Hall.', ...p('friendship'), radius: 10, fact: poi('friendship').fact },
      { kind: 'goto', text: 'Visit the Mahdi’s Tomb in Omdurman.', ...p('mahdi'), radius: 10, fact: poi('mahdi').fact },
    ],
  },
];
