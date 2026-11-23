import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  HALF,
  ISLAND,
  PLAY_LIMIT,
  POIS,
  WATER_Y,
  districtAt,
  drawGroundMap,
  drawMiniBase,
  driveable,
  groundY,
  heightAt,
  isDry,
  isWater,
  islandE,
  mulberry32,
  roadCoords,
} from './world';
import { Colliders } from './collision';
import { buildLandmarks, type BuildCtx } from './landmarks';
import { buildBoats, buildCity, type CityBuild } from './city';
import { WarMode } from './war';
import { SPECS, createVehicleMesh, type VehicleMesh, type VehicleSpec, type VehicleType } from './vehicles';
import { createGoat, createPlayerModel, createHuman, randomHuman, type Human } from './characters';
import { MISSIONS, SPECIAL_VEHICLES, type Mission, type Step } from './missions';
import { FACTIONS, Military, type Faction } from './military';
import { Effects, WEAPONS, WEAPON_ORDER, createViewModel, type WeaponId } from './weapons';

export interface HudState {
  money: number;
  district: { en: string; ar: string };
  speedKmh: number;
  inVehicle: boolean;
  vehicleName: string | null;
  prompt: string | null;
  mission: null | {
    id: string;
    title: string;
    titleAr: string;
    stepIndex: number;
    steps: number;
    text: string;
    textAr?: string;
    distance: number;
    angle: number;
    timeLeft: number | null;
    hint: string | null;
  };
  locked: boolean;
  completed: string[];
  /** 0-100 */
  hp: number;
  /** 0-1 screen damage pulse */
  hurt: number;
  weapon: null | { name: string; nameAr: string; mag: number; reserve: number; reloading: number };
  hostile: string[];
  kills: number;
}

export interface GameMessage {
  kind: 'info' | 'success' | 'fail' | 'fact';
  title: string;
  body?: string;
}

export interface GameCallbacks {
  onHud: (h: HudState) => void;
  onMessage: (m: GameMessage) => void;
}

interface Veh {
  id: string;
  type: VehicleType;
  spec: VehicleSpec;
  mesh: VehicleMesh;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  ai: boolean;
  special: boolean;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  s: number;
  spin: number;
}

interface Ped {
  human: Human;
  axis: 'x' | 'z';
  fixed: number;
  v: number;
  lo: number;
  hi: number;
  dir: number;
  speed: number;
  phase: number;
  x: number;
  z: number;
}

const TAU = Math.PI * 2;
function angDiff(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class Game {
  private container: HTMLElement;
  private cb: GameCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private gradePass: ShaderPass;
  private useBloom = true;
  private glareGuard = true;
  private sky: Sky;
  private sun: THREE.DirectionalLight;
  private sunDir: THREE.Vector3;
  private sunBaseIntensity = 2.15;
  private hemi!: THREE.HemisphereLight;
  private city!: CityBuild;
  private war!: WarMode;
  private warOn = false;
  private glareFactor = 0;
  private waterNormal: THREE.CanvasTexture;
  private colliders = new Colliders();
  private updaters: ((t: number, dt: number) => void)[] = [];
  private raf = 0;
  private last = 0;
  private time = 0;
  private disposed = false;
  private keys = new Set<string>();
  private mouseDown = false;
  private lastLook = -10;
  private menuOpen = true;
  private locked = false;

  // camera
  private camYaw = -Math.PI / 2;
  private camPitch = 0.3;
  private camPos = new THREE.Vector3();
  private camInit = false;

  // player
  private player = { x: 58, y: 0, z: 40, heading: -Math.PI / 2, vy: 0, amp: 0, phase: 0, speed: 0 };
  // ---- combat ----
  private mil!: Military;
  private effects!: Effects;
  private weaponId: WeaponId | null = 'pistol';
  private lastWeapon: WeaponId = 'pistol';
  private viewModel: { group: THREE.Group; muzzle: THREE.Object3D } | null = null;
  private ammo: Record<WeaponId, { mag: number; reserve: number }> = {
    pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve },
    rifle: { mag: WEAPONS.rifle.mag, reserve: WEAPONS.rifle.reserve },
    sniper: { mag: WEAPONS.sniper.mag, reserve: WEAPONS.sniper.reserve },
  };
  private fireCd = 0;
  private reloadT = 0;
  private firesHeld = false;
  private recoil = 0;
  private bob = 0;
  private hp = 100;
  private hurt = 0;
  private regenT = 0;
  private kills = 0;
  private warnedFaction = new Set<Faction>();
  private human: Human;
  private veh: Veh | null = null;

  // world entities
  private vehicles: Veh[] = [];
  private peds: Ped[] = [];
  private goat: { group: THREE.Group; legs: THREE.Mesh[]; x: number; z: number; heading: number; follow: boolean; speed: number };
  private missionNpcs = new Map<string, Human>();
  private marker: THREE.Group;
  private markerBeam: THREE.Mesh;
  private markerRing: THREE.Mesh;

  // missions
  private active: { m: Mission; i: number; timeLeft: number | null } | null = null;
  private money = 0;
  private completed = new Set<string>();

  // map
  private baseMap: HTMLCanvasElement;

  // audio
  private audio: AudioContext | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  private hudTimer = 0;
  private rng = mulberry32(2024);
  private miniCanvas: HTMLCanvasElement | null = null;
  private bigCanvas: HTMLCanvasElement | null = null;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onMouseMove: (e: MouseEvent) => void;
  private onResize: () => void;

  constructor(container: HTMLElement, cb: GameCallbacks) {
    this.container = container;
    this.cb = cb;

    // ---- renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Balanced exposure: bright desert sun without blowing out to white.
    // (Was 0.75 with a 3.1-intensity sun + strong env light = washed-out glare.)
    renderer.toneMappingExposure = 0.92;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.2, 4000);

    // ---- sky, light, environment ----
    // Higher sun (48° instead of 27°): the old low sun sat almost in the
    // player's face when looking across the Nile, causing full-screen glare.
    // A higher Khartoum midday sun keeps shadows short and the view clear.
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 48), THREE.MathUtils.degToRad(125));
    const makeSky = () => {
      const s = new Sky();
      s.scale.setScalar(3000);
      const u = s.material.uniforms;
      // Clearer desert air: less Mie haze around the sun disc = far less whiteout.
      u.turbidity.value = 4.2;
      u.rayleigh.value = 1.0;
      u.mieCoefficient.value = 0.0032;
      u.mieDirectionalG.value = 0.78;
      u.sunPosition.value.copy(this.sunDir);
      // Clear Khartoum sky: no procedural cloud sheet (it read as a moving
      // white veil and hid the skyline).
      u.cloudCoverage.value = 0;
      u.cloudDensity.value = 0;
      u.cloudSpeed.value = 0.00002;
      u.time.value = 0;
      return s;
    };
    this.sky = makeSky();
    this.scene.add(this.sky);
    const envScene = new THREE.Scene();
    envScene.add(makeSky());
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(envScene, 0, 1, 10000);
    this.scene.environment = envRT.texture;
    // The sky env map is also the source of the "shiny objects" look: every
    // metal/clearcoat surface mirrors it. Keep it low and let the diffuse
    // hemisphere light do the fill, so surfaces read as matte daylight.
    this.scene.environmentIntensity = 0.16;
    pmrem.dispose();

    // Aerial perspective only in the far distance. Colour is warm sand haze
    // (a blue-grey haze made the desert floor read like water), and the start
    // plane is far enough that the streets around the player stay crisp.
    this.scene.fog = new THREE.Fog(0xd8d0bd, 700, 3000);

    this.sun = new THREE.DirectionalLight(0xfff1d6, this.sunBaseIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -75;
    sc.right = 75;
    sc.top = 75;
    sc.bottom = -75;
    sc.near = 10;
    sc.far = 520;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    // Softer shadows: less harsh black/white contrast under the desert sun.
    this.sun.shadow.intensity = 0.62;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0xcdb88c, 0.55);
    this.scene.add(this.hemi);

    // ---- ground ----
    const groundCanvas = drawGroundMap(4096);
    this.baseMap = drawMiniBase(groundCanvas, 1400);
    const gtex = new THREE.CanvasTexture(groundCanvas);
    gtex.colorSpace = THREE.SRGBColorSpace;
    gtex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const seg = 560;
    const gg = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
    gg.rotateX(-Math.PI / 2);
    const gp = gg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
    gg.computeVertexNormals();
    const groundMat = new THREE.MeshStandardMaterial({
      map: gtex,
      roughness: 0.96,
      metalness: 0,
      envMapIntensity: 0.08,
      bumpMap: this.makeSandBump(),
      bumpScale: 0.22,
    });
    // very fine grain, only visible within ~100 m, so distant ground stays clean
    const detailTex = this.makeSandDetail();
    groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uDetail = { value: detailTex };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPosG;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPosG = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPosG;\nuniform sampler2D uDetail;')
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          {
            vec3 det = texture2D(uDetail, vWPosG.xz * 0.08).rgb;
            float dist = length(vWPosG - cameraPosition);
            float fade = exp(-dist / 110.0);
            diffuseColor.rgb *= mix(vec3(1.0), det, fade * 0.55);
          }`
        );
    };
    const ground = new THREE.Mesh(gg, groundMat);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // outer desert
    const shape = new THREE.Shape();
    shape.moveTo(-5000, -5000);
    shape.lineTo(5000, -5000);
    shape.lineTo(5000, 5000);
    shape.lineTo(-5000, 5000);
    shape.lineTo(-5000, -5000);
    const hole = new THREE.Path();
    hole.moveTo(-HALF + 0.5, -HALF + 0.5);
    hole.lineTo(-HALF + 0.5, HALF - 0.5);
    hole.lineTo(HALF - 0.5, HALF - 0.5);
    hole.lineTo(HALF - 0.5, -HALF + 0.5);
    hole.lineTo(-HALF + 0.5, -HALF + 0.5);
    shape.holes.push(hole);
    const og = new THREE.ShapeGeometry(shape);
    og.rotateX(-Math.PI / 2);
    const outer = new THREE.Mesh(og, new THREE.MeshStandardMaterial({ color: 0xc6ad7c, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.05 }));
    outer.position.y = 3;
    outer.receiveShadow = true;
    this.scene.add(outer);

    // ---- water ----
    this.waterNormal = this.makeWaterNormal();
    const wGeo = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
    wGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(
      wGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0x3a7a82,
        roughness: 0.14,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
        normalMap: this.waterNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        envMapIntensity: 0.7,
        clearcoat: 0.25,
      })
    );
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.scene.add(water);

    // ---- city, landmarks ----
    const ctx: BuildCtx = { scene: this.scene, colliders: this.colliders, updaters: this.updaters };
    this.city = buildCity(ctx, mulberry32(7));
    buildLandmarks(ctx, mulberry32(11));
    buildBoats(ctx, mulberry32(5));

    // ---- player ----
    this.human = createPlayerModel();
    this.scene.add(this.human.group);

    // ---- vehicles, peds, goat ----
    this.spawnVehicles();
    this.spawnPeds();
    const g = createGoat();
    this.scene.add(g.group);
    this.goat = { group: g.group, legs: g.legs, x: ISLAND.x - 20, z: 0, heading: 0, follow: false, speed: 0 };

    // ---- armed factions: checkpoints, patrols, technicals ----
    this.mil = new Military(this.scene, mulberry32(23));
    this.mil.spawn(driveable);
    this.effects = new Effects(this.scene);
    this.war = new WarMode(this.scene, this.city, mulberry32(41), () => this.boomSound());
    this.scene.add(this.camera);
    this.equip('pistol');

    // ---- marker ----
    this.marker = new THREE.Group();
    const bm = new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 120, 20, 1, true), bm);
    this.markerBeam.position.y = 60;
    this.markerRing = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd966, fog: false }));
    this.markerRing.rotation.x = Math.PI / 2;
    this.marker.add(this.markerBeam, this.markerRing);
    this.marker.visible = false;
    this.scene.add(this.marker);

    // ---- post ----
    const rt = new THREE.WebGLRenderTarget(container.clientWidth, container.clientHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom is limited to genuine light sources. With sunlit walls around
    // 1.5-2.0 in HDR, any threshold near 1 made every wall glow and read as
    // reflected glare, so the cutoff sits well above them.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.12, 0.35, 2.6);
    this.composer.addPass(this.bloom);

    // Glare guard + gentle colour grade (runs in linear HDR, before OutputPass).
    this.gradePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uKnee: { value: 2.4 },
        uGlare: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float uKnee;
        uniform float uGlare;
        varying vec2 vUv;

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;

          // --- highlight roll-off (glare guard) ---
          // Very bright pixels (sun disc, specular hits) are compressed instead
          // of clipping to pure white, so the view stays readable when facing
          // the sun. Amount increases slightly while the sun is in frame.
          float knee = mix(uKnee, uKnee * 0.7, uGlare);
          float peak = max(max(col.r, col.g), col.b);
          if (peak > knee) {
            float excess = peak - knee;
            float compressed = knee + excess / (1.0 + excess * (0.9 + uGlare * 1.1));
            col *= compressed / peak;
          }

          // --- photographic grade: a touch more contrast + saturation ---
          col = max(col, vec3(0.0));
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, 1.08);
          col = (col - 0.18) * 1.04 + 0.18;

          // subtle warm desert tint in the highlights, cool in the shadows
          col *= mix(vec3(0.99, 0.995, 1.01), vec3(1.02, 1.0, 0.975), smoothstep(0.05, 0.7, luma));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.composer.addPass(this.gradePass);
    this.composer.addPass(new OutputPass());


    // ---- save ----
    try {
      const s = JSON.parse(localStorage.getItem('khartoum-save') || 'null');
      if (s) {
        this.money = s.money || 0;
        (s.completed || []).forEach((c: string) => this.completed.add(c));
      }
    } catch {
      /* ignore */
    }

    // ---- input ----
    this.onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.ensureAudio();
      if (this.menuOpen) return;
      if (e.code === 'KeyE') this.interact();
      if (e.code === 'KeyF') this.horn();
      if (e.code === 'Digit1') this.equip('pistol');
      if (e.code === 'Digit2') this.equip('rifle');
      if (e.code === 'Digit3') this.equip('sniper');
      if (e.code === 'KeyQ') this.equip(this.weaponId ? null : this.lastWeapon);
      if (e.code === 'KeyR') this.reload();
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onMouseMove = (e) => {
      if (this.menuOpen) return;
      if (this.locked || this.mouseDown) {
        this.camYaw -= e.movementX * 0.0026;
        this.camPitch = THREE.MathUtils.clamp(this.camPitch + e.movementY * 0.002, -0.15, 1.3);
        this.lastLook = this.time;
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    renderer.domElement.addEventListener('mousedown', this.handleDown);
    renderer.domElement.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (this.menuOpen || this.veh) return;
        e.preventDefault();
        const i = this.weaponId ? WEAPON_ORDER.indexOf(this.weaponId) : 0;
        const next = (i + (e.deltaY > 0 ? 1 : WEAPON_ORDER.length - 1)) % WEAPON_ORDER.length;
        this.equip(WEAPON_ORDER[next]);
      },
      { passive: false }
    );
    window.addEventListener('mouseup', this.handleUp);
    document.addEventListener('pointerlockchange', this.handleLock);
    this.onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', this.onResize);

    this.last = performance.now();
    this.loop();
  }

  // ---------- public API ----------
  setMenuOpen(open: boolean) {
    this.menuOpen = open;
    if (open) {
      this.keys.clear();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  requestLock() {
    this.ensureAudio();
    try {
      const p = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    } catch {
      /* ignore */
    }
  }
  /** War damage mode: ruins, craters, smoke and a wartime sky. */
  setWar(on: boolean) {
    if (on === this.warOn) return;
    this.warOn = on;
    this.war.setActive(on, groundY);
    const skyU = this.sky.material.uniforms;
    if (on) {
      this.sun.intensity = this.sunBaseIntensity * 0.62;
      this.sun.color.setHex(0xffd9a8);
      this.hemi.intensity = 0.4;
      this.hemi.color.setHex(0xc9b79c);
      this.hemi.groundColor.setHex(0x8a7a62);
      (this.scene.fog as THREE.Fog).color.setHex(0xb3a48f);
      (this.scene.fog as THREE.Fog).near = 160;
      (this.scene.fog as THREE.Fog).far = Math.min((this.scene.fog as THREE.Fog).far, 1500);
      skyU.turbidity.value = 9.5;
      skyU.rayleigh.value = 0.62;
      skyU.mieCoefficient.value = 0.009;
      this.mil.makeHostile('army');
      this.mil.makeHostile('rsf');
      this.warnedFaction.add('army');
      this.warnedFaction.add('rsf');
      this.cb.onMessage({
        kind: 'fail',
        title: '🔥 وضع الحرب — War damage',
        body: `${this.war.count} مبنى مدمّر في الخرطوم وأم درمان وبحري، أعمدة دخان في السما، والنقاط كلها معادية.`,
      });
    } else {
      this.sun.intensity = this.sunBaseIntensity;
      this.sun.color.setHex(0xfff1d6);
      this.hemi.intensity = 0.55;
      this.hemi.color.setHex(0xcfe3ff);
      this.hemi.groundColor.setHex(0xcdb88c);
      (this.scene.fog as THREE.Fog).color.setHex(0xd8d0bd);
      (this.scene.fog as THREE.Fog).near = 700;
      (this.scene.fog as THREE.Fog).far = 3000;
      skyU.turbidity.value = 4.2;
      skyU.rayleigh.value = 1.0;
      skyU.mieCoefficient.value = 0.0032;
      this.mil.clearHostility();
      this.warnedFaction.clear();
      this.cb.onMessage({ kind: 'info', title: 'عادت المدينة لهدوءها', body: 'وضع الحرب اتقفل — المباني رجعت زي ما كانت.' });
    }
    this.beep(on ? [180, 140] : [320, 420]);
  }

  /** Distant explosion rumble used by the war layer. */
  private boomSound() {
    const a = this.audio;
    if (!a) return;
    const dur = 1.1;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
    }
    const src = a.createBufferSource();
    src.buffer = buffer;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const g = a.createGain();
    g.gain.value = 0.34;
    src.connect(lp);
    lp.connect(g);
    g.connect(a.destination);
    src.start();
    const o = a.createOscillator();
    const og = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(58, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(24, a.currentTime + 0.9);
    og.gain.setValueAtTime(0.25, a.currentTime);
    og.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.0);
    o.connect(og);
    og.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 1.05);
    this.shake = Math.max(this.shake, 0.12);
  }

  /** Sky reflections on glass/metal/paint (main source of surface glare). */
  setReflections(on: boolean) {
    this.scene.environmentIntensity = on ? 0.16 : 0;
  }
  /** Far distance of the aerial haze in metres (higher = clearer view). */
  setFogFar(meters: number) {
    const fog = this.scene.fog as THREE.Fog | null;
    if (!fog || !('near' in fog)) return;
    fog.near = Math.max(120, meters * 0.23);
    fog.far = meters;
  }
  setBloom(on: boolean) {
    this.useBloom = on;
    // Post-processing stays on so the glare guard + grade keep working;
    // only the bloom blur layer is switched off.
    this.bloom.enabled = on;
  }
  attachMini(c: HTMLCanvasElement | null) {
    this.miniCanvas = c;
  }
  attachBig(c: HTMLCanvasElement | null) {
    this.bigCanvas = c;
  }
  getMissions() {
    return MISSIONS;
  }

  startMission(id: string, travel = false) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m) return;
    this.cancelMission(true);
    this.active = { m, i: 0, timeLeft: m.time ?? null };
    this.resetGoat();
    if (travel) this.fastTravel(m);
    this.syncNpc();
    this.cb.onMessage({ kind: 'info', title: `Mission: ${m.title}`, body: m.steps[0].text });
    this.beep([520, 660]);
  }

  cancelMission(silent = false) {
    if (this.active && !silent) this.cb.onMessage({ kind: 'info', title: 'Mission cancelled' });
    this.active = null;
    this.resetGoat();
    this.syncNpc();
  }

  private resetGoat() {
    this.goat.follow = false;
    if (islandE(this.goat.x, this.goat.z) > 0.6) {
      this.goat.x = ISLAND.x - 20;
      this.goat.z = 0;
    }
  }

  private fastTravel(m: Mission) {
    const s = m.steps[0];
    let tx = s.x ?? 0;
    let tz = s.z ?? 0;
    if (s.kind === 'enter') {
      const v = this.vehicles.find((x) => x.id === s.vehicleId);
      if (v) {
        tx = v.x + 4;
        tz = v.z + 2;
      }
    }
    if (this.veh) this.exitVehicle(true);
    // stand a little way off the target on dry ground
    for (const [ox, oz] of [[0, 8], [8, 0], [-8, 0], [0, -8], [12, 12]]) {
      if (isDry(tx + ox, tz + oz) && !isWater(tx + ox, tz + oz)) {
        this.player.x = tx + ox;
        this.player.z = tz + oz;
        break;
      }
    }
    this.player.y = groundY(this.player.x, this.player.z);
    this.camYaw = Math.atan2(tx - this.player.x, tz - this.player.z);
    this.camInit = false;
  }

  // ---------- spawn ----------
  private spawnVehicles() {
    const colors = [0xf2b705, 0xe8e8e8, 0x2c4a7a, 0x8a1c1c, 0x3a3f44, 0x0f6b50, 0xb0b4b8, 0xd9d2c0];
    const addVeh = (id: string, type: VehicleType, color: number, x: number, z: number, heading: number, ai: boolean, special: boolean) => {
      const mesh = createVehicleMesh(type, color);
      this.scene.add(mesh.group);
      const v: Veh = { id, type, spec: SPECS[type], mesh, x, y: groundY(x, z), z, heading, speed: 0, ai, special, fx: x, fz: z, tx: x, tz: z, s: 0, spin: 0 };
      this.vehicles.push(v);
      return v;
    };
    for (const sv of SPECIAL_VEHICLES) addVeh(sv.id, sv.type, sv.color, sv.x, sv.z, sv.heading, false, true);

    // traffic
    const types: VehicleType[] = ['sedan', 'taxi', 'taxi', 'sedan', 'pickup', 'raksha', 'raksha', 'bus'];
    let n = 0;
    let guard = 0;
    while (n < 26 && guard++ < 400) {
      const nx = (Math.floor(this.rng() * 23) - 11) * 50;
      const nz = (Math.floor(this.rng() * 23) - 11) * 50;
      if (!this.nodeOk(nx, nz)) continue;
      const nextNode = this.pickNext(nx, nz, -999, -999);
      if (!nextNode) continue;
      const type = types[Math.floor(this.rng() * types.length)];
      const color = type === 'taxi' || type === 'raksha' ? 0xf2b705 : colors[Math.floor(this.rng() * colors.length)];
      const v = addVeh('ai' + n, type, color, nx, nz, 0, true, false);
      v.fx = nx;
      v.fz = nz;
      v.tx = nextNode.x;
      v.tz = nextNode.z;
      v.s = this.rng() * 40;
      v.heading = Math.atan2(v.tx - v.fx, v.tz - v.fz);
      n++;
    }
  }

  private nodeOk(x: number, z: number) {
    return Math.abs(x) <= 550 && Math.abs(z) <= 550 && driveable(x, z) && !(roadCoords.indexOf(x) < 0 || roadCoords.indexOf(z) < 0);
  }

  private edgeOk(x1: number, z1: number, x2: number, z2: number) {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      if (!driveable(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false;
    }
    return true;
  }

  private pickNext(x: number, z: number, px: number, pz: number) {
    const c: { x: number; z: number }[] = [];
    for (const [dx, dz] of [[50, 0], [-50, 0], [0, 50], [0, -50]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (!this.nodeOk(nx, nz)) continue;
      if (!this.edgeOk(x, z, nx, nz)) continue;
      c.push({ x: nx, z: nz });
    }
    if (!c.length) return null;
    const f = c.filter((n) => !(n.x === px && n.z === pz));
    const arr = f.length ? f : c;
    return arr[Math.floor(this.rng() * arr.length)];
  }

  private spawnPeds() {
    const centers: [number, number, number][] = [
      [100, 110, 150], [200, 150, 120], [-150, 0, 70], [-130, 100, 90], [125, -110, 90], [160, -160, 100], [60, 45, 25], [-250, -80, 120],
    ];
    let n = 0;
    let guard = 0;
    while (n < 120 && guard++ < 1500) {
      const [cx, cz, spread] = centers[Math.floor(this.rng() * centers.length)];
      const px = cx + (this.rng() - 0.5) * spread * 2;
      const pz = cz + (this.rng() - 0.5) * spread * 2;
      const axis: 'x' | 'z' = this.rng() < 0.5 ? 'x' : 'z';
      let c = Math.round((axis === 'x' ? px : pz) / 50) * 50;
      if (axis === 'x' && c === 0) c = 50;
      let v = axis === 'x' ? pz : px;
      const side = this.rng() < 0.5 ? -1 : 1;
      const fixed = c + side * 5.6;
      const pt = (vv: number) => (axis === 'x' ? { x: fixed, z: vv } : { x: vv, z: fixed });
      if (Math.abs(v) > 540) v = Math.sign(v) * 540;
      const p0 = pt(v);
      if (!isDry(p0.x, p0.z) || islandE(p0.x, p0.z) < 1.4) continue;
      let lo = v;
      let hi = v;
      for (let k = 0; k < 14; k++) {
        const a = pt(lo - 5);
        if (!isDry(a.x, a.z) || Math.abs(lo - 5) > 548) break;
        lo -= 5;
      }
      for (let k = 0; k < 14; k++) {
        const a = pt(hi + 5);
        if (!isDry(a.x, a.z) || Math.abs(hi + 5) > 548) break;
        hi += 5;
      }
      if (hi - lo < 20) continue;
      const human = randomHuman(this.rng);
      this.scene.add(human.group);
      this.peds.push({ human, axis, fixed, v, lo, hi, dir: this.rng() < 0.5 ? -1 : 1, speed: 1.1 + this.rng() * 1.2, phase: this.rng() * 6, x: p0.x, z: p0.z });
      n++;
    }
  }

  /** Fine sand grain used as a bump map so the ground has real relief up close. */
  private makeSandBump() {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(size, size);
    const rnd = mulberry32(1234);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // fine grain + a faint wind ripple so nearby ground reads as sand
        const ripple = Math.sin((x / size) * Math.PI * 2 * 9 + Math.sin((y / size) * Math.PI * 2 * 2) * 2) * 0.16;
        const v = 0.5 + (rnd() - 0.5) * 0.62 + ripple;
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = THREE.MathUtils.clamp(v, 0, 1) * 255;
        img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(520, 520);
    tex.anisotropy = 8;
    return tex;
  }

  /** Fine colour grain for the ground: breaks up the blurry base map up close. */
  private makeSandDetail() {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(size, size);
    const rnd = mulberry32(555);
    for (let i = 0; i < size * size; i++) {
      const n = rnd();
      const warm = rnd() > 0.5;
      const v = 0.82 + n * 0.36;
      img.data[i * 4] = THREE.MathUtils.clamp(v * (warm ? 1.04 : 0.97), 0, 1) * 255;
      img.data[i * 4 + 1] = THREE.MathUtils.clamp(v * 0.99, 0, 1) * 255;
      img.data[i * 4 + 2] = THREE.MathUtils.clamp(v * (warm ? 0.93 : 1.03), 0, 1) * 255;
      img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(420, 420);
    tex.anisotropy = 8;
    return tex;
  }

  private makeWaterNormal() {
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d')!;
    const img = c.createImageData(size, size);
    const waves = [
      [3, 1, 0.8], [2, 4, 0.6], [5, 3, 0.4], [1, 6, 0.35], [7, 2, 0.25], [4, 7, 0.2],
    ];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let dx = 0;
        let dy = 0;
        for (let i = 0; i < waves.length; i++) {
          const [kx, ky, a] = waves[i];
          const ph = (TAU * (kx * x + ky * y)) / size + i * 1.7;
          const cs = Math.cos(ph) * a;
          dx += cs * kx;
          dy += cs * ky;
        }
        const nx = -dx * 0.05;
        const ny = -dy * 0.05;
        const nz = 1;
        const l = Math.hypot(nx, ny, nz);
        const i = (y * size + x) * 4;
        img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(110, 110);
    tex.anisotropy = 8;
    return tex;
  }

  // ---------- input handlers ----------
  private handleDown = (e: MouseEvent) => {
    this.mouseDown = true;
    if (this.menuOpen) return;
    if (!this.locked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) {
      this.firesHeld = true;
      this.tryFire();
    }
  };
  private handleUp = () => {
    this.mouseDown = false;
    this.firesHeld = false;
  };
  private handleLock = () => {
    this.locked = document.pointerLockElement === this.renderer.domElement;
  };

  // ---------- audio ----------
  private ensureAudio() {
    if (this.audio) {
      if (this.audio.state === 'suspended') void this.audio.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audio = new AC();
      const osc = this.audio.createOscillator();
      const osc2 = this.audio.createOscillator();
      const gain = this.audio.createGain();
      const filter = this.audio.createBiquadFilter();
      osc.type = 'sawtooth';
      osc2.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.audio.destination);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    } catch {
      this.audio = null;
    }
  }

  private beep(freqs: number[]) {
    if (!this.audio) return;
    const a = this.audio;
    freqs.forEach((f, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t0 = a.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g);
      g.connect(a.destination);
      o.start(t0);
      o.stop(t0 + 0.35);
    });
  }

  private horn() {
    if (!this.audio || !this.veh) return;
    const a = this.audio;
    for (const f of [392, 494]) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.05, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + 0.55);
    }
  }

  // ---------- interaction ----------
  private nearestVehicle(maxExtra = 3.5) {
    let best: Veh | null = null;
    let bd = 1e9;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
      if (d < v.spec.radius + maxExtra && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  private interact() {
    if (this.veh) {
      this.exitVehicle(false);
      return;
    }
    const v = this.nearestVehicle();
    if (v) this.enterVehicle(v);
  }

  private enterVehicle(v: Veh) {
    v.ai = false;
    v.speed = 0;
    this.veh = v;
    this.scene.remove(this.human.group);
    v.mesh.seat.add(this.human.group);
    const s = v.spec.seat;
    this.human.group.position.set(s.x, s.y, s.z);
    this.human.group.rotation.set(0, 0, 0);
    this.human.group.scale.setScalar(s.s);
    this.human.legL.rotation.x = -1.35;
    this.human.legR.rotation.x = -1.35;
    this.human.armL.rotation.set(-1.1, 0, 0);
    this.human.armR.rotation.set(-1.1, 0, 0);
    this.camYaw = v.heading;
    this.equip(null);
    this.beep([300]);
  }

  private exitVehicle(silent: boolean) {
    const v = this.veh;
    if (!v) return;
    v.mesh.seat.remove(this.human.group);
    this.scene.add(this.human.group);
    this.human.group.scale.setScalar(0.93);
    this.human.group.position.set(0, 0, 0);
    // find free spot beside the car
    const rx = -Math.cos(v.heading);
    const rz = Math.sin(v.heading);
    let placed = false;
    for (const side of [-1, 1]) {
      for (const dist of [v.spec.radius + 1, v.spec.radius + 2.5]) {
        const x = v.x + rx * side * dist;
        const z = v.z + rz * side * dist;
        const r = this.colliders.resolve(x, z, 0.5);
        if (!r.hit && !isWater(x, z)) {
          this.player.x = x;
          this.player.z = z;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      this.player.x = v.x;
      this.player.z = v.z;
    }
    this.player.y = groundY(this.player.x, this.player.z);
    this.player.heading = v.heading;
    this.player.vy = 0;
    v.speed = 0;
    this.veh = null;
    this.equip(this.lastWeapon);
    if (!silent) this.beep([240]);
  }

  // ---------- main loop ----------
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.composer.render();
  };

  private update(dt: number) {
    const paused = this.menuOpen;
    if (!paused) {
      if (this.veh) this.updateDriving(dt);
      else this.updateWalking(dt);
    } else if (this.veh) {
      this.veh.speed *= 1 - Math.min(1, dt * 2);
    }
    this.updateVehicles(dt);
    this.updatePeds(dt);
    this.updateGoat(dt);
    if (!paused) this.updateMission(dt);
    for (const u of this.updaters) u(this.time, dt);
    const skyU = this.sky.material.uniforms;
    skyU.time.value = this.time;
    skyU.sunPosition.value.copy(this.sunDir);
    this.waterNormal.offset.x += dt * 0.004;
    this.waterNormal.offset.y += dt * 0.0025;
    this.updateCamera(dt);
    this.updateCombat(dt);
    this.updateMarker();
    this.updateAudio();
    if (this.miniCanvas) this.drawMini(this.miniCanvas);
    if (this.bigCanvas) this.drawBig(this.bigCanvas);
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.emitHud();
    }
  }

  private camForwardInput() {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    return { f, r };
  }

  private updateWalking(dt: number) {
    const p = this.player;
    const k = this.keys;
    // camera by keys
    if (k.has('ArrowLeft')) this.camYaw += 1.8 * dt;
    if (k.has('ArrowRight')) this.camYaw -= 1.8 * dt;
    if (k.has('ArrowUp')) this.camPitch = Math.max(-0.15, this.camPitch - dt);
    if (k.has('ArrowDown')) this.camPitch = Math.min(1.3, this.camPitch + dt);

    const { f, r } = this.camForwardInput();
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    let vx = fx * f + -fz * r;
    let vz = fz * f + fx * r;
    const len = Math.hypot(vx, vz);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let speed = 0;
    if (len > 0) {
      vx /= len;
      vz /= len;
      speed = sprint ? 10 : 5.2;
      p.heading += angDiff(p.heading, Math.atan2(vx, vz)) * (1 - Math.exp(-14 * dt));
    }
    let nx = p.x + vx * speed * dt;
    let nz = p.z + vz * speed * dt;
    if (isWater(nx, nz)) {
      if (!isWater(nx, p.z)) nz = p.z;
      else if (!isWater(p.x, nz)) nx = p.x;
      else {
        nx = p.x;
        nz = p.z;
      }
    }
    const res = this.colliders.resolve(nx, nz, 0.5);
    p.x = THREE.MathUtils.clamp(res.x, -PLAY_LIMIT, PLAY_LIMIT);
    p.z = THREE.MathUtils.clamp(res.z, -PLAY_LIMIT, PLAY_LIMIT);
    p.speed = speed;

    // vertical
    const gy = groundY(p.x, p.z);
    if (k.has('Space') && p.y <= gy + 0.05 && p.vy <= 0) p.vy = 7.5;
    if (p.vy > 0 || p.y > gy + 0.02) {
      p.vy -= 24 * dt;
      p.y += p.vy * dt;
      if (p.y <= gy) {
        p.y = gy;
        p.vy = 0;
      }
    } else {
      p.y += (gy - p.y) * (1 - Math.exp(-18 * dt));
    }

    const targetAmp = speed > 0 ? (sprint ? 1.0 : 0.65) : 0;
    p.amp += (targetAmp - p.amp) * (1 - Math.exp(-12 * dt));
    p.phase += speed * dt * 1.7;
    this.human.setWalk(p.phase, p.amp);
    this.human.group.position.set(p.x, p.y + Math.abs(Math.sin(p.phase)) * 0.04 * p.amp, p.z);
    this.human.group.rotation.y = p.heading;
  }

  private updateDriving(dt: number) {
    const v = this.veh!;
    const k = this.keys;
    const throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const steerIn = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    const spec = v.spec;
    const hand = k.has('Space');
    if (throttle > 0) {
      if (v.speed < -0.5) v.speed += spec.acc * 2.2 * dt;
      else v.speed += spec.acc * dt * (1 - Math.max(0, v.speed) / (spec.max * 1.05));
    } else if (throttle < 0) {
      if (v.speed > 0.5) v.speed -= spec.acc * 2.4 * dt;
      else v.speed -= spec.acc * 0.55 * dt * (1 - Math.max(0, -v.speed) / (spec.max * 0.3));
    } else {
      v.speed -= v.speed * 0.5 * dt + Math.sign(v.speed) * 1.2 * dt;
      if (Math.abs(v.speed) < 0.3) v.speed = 0;
    }
    if (hand) v.speed -= v.speed * 3 * dt;
    const sf = THREE.MathUtils.clamp(v.speed / 7, -1, 1) / (1 + Math.abs(v.speed) / 42);
    v.heading += steerIn * spec.steer * sf * dt * (hand ? 1.5 : 1);
    const ox = v.x;
    const oz = v.z;
    let nx = v.x + Math.sin(v.heading) * v.speed * dt;
    let nz = v.z + Math.cos(v.heading) * v.speed * dt;
    if (isWater(nx, nz) || Math.abs(nx) > PLAY_LIMIT || Math.abs(nz) > PLAY_LIMIT) {
      nx = ox;
      nz = oz;
      v.speed *= -0.25;
    }
    const res = this.colliders.resolve(nx, nz, spec.radius * 0.85);
    if (res.hit) {
      v.speed *= 1 - Math.min(0.9, dt * 5);
      if (Math.abs(v.speed) > 6) this.shake = 0.25;
    }
    // vehicle-vehicle
    let x = res.x;
    let z = res.z;
    for (const o of this.vehicles) {
      if (o === v) continue;
      const dx = x - o.x;
      const dz = z - o.z;
      const d = Math.hypot(dx, dz);
      const min = (spec.radius + o.spec.radius) * 0.8;
      if (d < min && d > 0.001) {
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
        v.speed *= 1 - Math.min(0.8, dt * 6);
      }
    }
    v.x = x;
    v.z = z;
    this.player.x = v.x;
    this.player.z = v.z;
    this.player.speed = Math.abs(v.speed);
    this.player.y = v.y;
  }
  private shake = 0;

  private updateVehicles(dt: number) {
    const px = this.player.x;
    const pz = this.player.z;
    for (const v of this.vehicles) {
      const dist = Math.hypot(v.x - px, v.z - pz);
      // AI driving
      if (v.ai) {
        const dx = v.tx - v.fx;
        const dz = v.tz - v.fz;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        let want = v.spec.max * 0.42;
        // brake for things in front
        const fx = v.x + ux * 7;
        const fz = v.z + uz * 7;
        const blockers: { x: number; z: number }[] = [{ x: px, z: pz }];
        for (const o of this.vehicles) if (o !== v) blockers.push(o);
        for (const b of blockers) {
          const bx = b.x - v.x;
          const bz = b.z - v.z;
          const along = bx * ux + bz * uz;
          const lat = Math.abs(-bx * uz + bz * ux);
          if (along > 0 && along < 10 && lat < 2.8) want = 0;
        }
        void fx;
        void fz;
        v.speed += (want - v.speed) * Math.min(1, dt * (want === 0 ? 4 : 1.2));
        v.s += v.speed * dt;
        if (v.s >= len) {
          const nxt = this.pickNext(v.tx, v.tz, v.fx, v.fz);
          v.fx = v.tx;
          v.fz = v.tz;
          if (nxt) {
            v.tx = nxt.x;
            v.tz = nxt.z;
          } else {
            const t = v.fx;
            const t2 = v.fz;
            v.tx = v.fx - ux * 50;
            v.tz = v.fz - uz * 50;
            void t;
            void t2;
          }
          v.s = 0;
        }
        const lane = 2.1;
        const tx = v.fx + ux * v.s + -uz * lane;
        const tz = v.fz + uz * v.s + ux * lane;
        const k = Math.min(1, dt * 6);
        v.x += (tx - v.x) * k;
        v.z += (tz - v.z) * k;
        v.heading += angDiff(v.heading, Math.atan2(ux, uz)) * Math.min(1, dt * 3.5);
      } else if (v !== this.veh) {
        v.speed *= 1 - Math.min(1, dt * 3);
      }
      const gy = groundY(v.x, v.z);
      v.y += (gy - v.y) * Math.min(1, dt * 12);
      v.mesh.group.visible = dist < 450;
      if (!v.mesh.group.visible) continue;
      v.mesh.group.position.set(v.x, v.y, v.z);
      v.mesh.group.rotation.y = v.heading;
      v.spin += (v.speed * dt) / 0.4;
      for (const w of v.mesh.wheels) {
        w.rotation.x = v.spin;
      }
      // small body roll from speed
      v.mesh.group.rotation.z = 0;
    }
  }

  private updatePeds(dt: number) {
    const px = this.player.x;
    const pz = this.player.z;
    for (const p of this.peds) {
      const d2 = (p.x - px) ** 2 + (p.z - pz) ** 2;
      if (d2 > 140 * 140) {
        p.human.group.visible = false;
        continue;
      }
      p.human.group.visible = true;
      p.v += p.dir * p.speed * dt;
      if (p.v > p.hi) {
        p.v = p.hi;
        p.dir = -1;
      } else if (p.v < p.lo) {
        p.v = p.lo;
        p.dir = 1;
      }
      p.x = p.axis === 'x' ? p.fixed : p.v;
      p.z = p.axis === 'x' ? p.v : p.fixed;
      p.phase += p.speed * dt * 3.2;
      p.human.setWalk(p.phase, 0.5);
      const h = p.axis === 'x' ? (p.dir > 0 ? 0 : Math.PI) : p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.human.group.rotation.y += angDiff(p.human.group.rotation.y, h) * Math.min(1, dt * 6);
      p.human.group.position.set(p.x, groundY(p.x, p.z), p.z);
    }
    // mission NPCs wave
    for (const h of this.missionNpcs.values()) if (h.group.visible) h.setWave(this.time);
  }

  private updateGoat(dt: number) {
    const g = this.goat;
    const px = this.player.x;
    const pz = this.player.z;
    const dx = g.x - px;
    const dz = g.z - pz;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (g.follow) {
      if (d > 2.6) {
        const sp = Math.min(this.player.speed + 1.5, 9);
        g.x -= (dx / d) * sp * dt;
        g.z -= (dz / d) * sp * dt;
        g.heading = Math.atan2(-dx, -dz);
        moving = true;
      }
      g.speed = 5;
    } else if (this.active?.m.id === 'goat' && d < 15 && !this.veh) {
      // flee
      const base = Math.atan2(dx, dz);
      const sp = 5.4;
      for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5, 2.1, -2.1, 2.8]) {
        const a = base + off;
        const nx = g.x + Math.sin(a) * sp * dt;
        const nz = g.z + Math.cos(a) * sp * dt;
        if (islandE(nx, nz) < 0.72) {
          g.x = nx;
          g.z = nz;
          g.heading = a;
          moving = true;
          break;
        }
      }
    } else {
      // gentle wander
      g.heading += Math.sin(this.time * 0.4 + g.x) * dt * 0.8;
      const nx = g.x + Math.sin(g.heading) * 0.8 * dt;
      const nz = g.z + Math.cos(g.heading) * 0.8 * dt;
      if (islandE(nx, nz) < 0.6) {
        g.x = nx;
        g.z = nz;
        moving = true;
      } else g.heading += Math.PI * 0.5 * dt * 3;
    }
    g.group.position.set(g.x, groundY(g.x, g.z), g.z);
    g.group.rotation.y = g.heading;
    const sw = moving ? Math.sin(this.time * 14) * 0.6 : 0;
    g.legs.forEach((l, i) => (l.rotation.x = i % 2 === 0 ? sw : -sw));
    g.group.position.y += moving ? Math.abs(Math.sin(this.time * 14)) * 0.08 : 0;
  }

  // ---------- missions ----------
  private stepTarget(step: Step): { x: number; z: number } | null {
    if (step.kind === 'goto') return { x: step.x!, z: step.z! };
    if (step.kind === 'enter') {
      const v = this.vehicles.find((x) => x.id === step.vehicleId);
      return v ? { x: v.x, z: v.z } : null;
    }
    return { x: this.goat.x, z: this.goat.z };
  }

  private syncNpc() {
    for (const h of this.missionNpcs.values()) h.group.visible = false;
    if (!this.active) return;
    const step = this.active.m.steps[this.active.i];
    if (step?.npc) {
      const key = this.active.m.id + ':' + this.active.i;
      let h = this.missionNpcs.get(key);
      if (!h) {
        h = createHuman({ robe: step.npc.robe, skin: 0x5a3a26, female: step.npc.female, shawl: step.npc.female ? 0xffc107 : null, turban: 0xf6f3ea });
        h.group.position.set(step.npc.x, groundY(step.npc.x, step.npc.z), step.npc.z);
        this.scene.add(h.group);
        this.missionNpcs.set(key, h);
      }
      h.group.visible = true;
      h.group.rotation.y = Math.atan2(this.player.x - step.npc.x, this.player.z - step.npc.z);
    }
  }

  private updateMission(dt: number) {
    const a = this.active;
    if (!a) return;
    const m = a.m;
    const step = m.steps[a.i];
    if (a.timeLeft !== null && a.i >= (m.timeStart ?? 0)) {
      a.timeLeft -= dt;
      if (a.timeLeft <= 0) {
        this.cb.onMessage({ kind: 'fail', title: 'Mission failed', body: `You ran out of time: ${m.title}` });
        this.beep([300, 220]);
        this.active = null;
        this.resetGoat();
        this.syncNpc();
        return;
      }
    }
    const t = this.stepTarget(step);
    if (!t) return;
    const d = Math.hypot(t.x - this.player.x, t.z - this.player.z);
    let done = false;
    if (step.kind === 'goto') {
      const inCar = !!this.veh;
      const okVeh = !step.vehicle || (step.vehicle === 'in' ? inCar : !inCar);
      if (d < (step.radius ?? 5) && okVeh) done = true;
    } else if (step.kind === 'enter') {
      if (this.veh && this.veh.id === step.vehicleId) done = true;
    } else if (step.kind === 'catch') {
      if (d < 2.6 && !this.veh) {
        done = true;
        this.goat.follow = true;
      }
    }
    if (done) this.completeStep();
  }

  private completeStep() {
    const a = this.active!;
    const step = a.m.steps[a.i];
    a.i++;
    if (a.i >= a.m.steps.length) {
      this.money += a.m.reward;
      this.completed.add(a.m.id);
      this.save();
      this.cb.onMessage({ kind: 'success', title: `Mission complete: ${a.m.title}`, body: `${step.fact ? step.fact + ' ' : ''}Reward: ${a.m.reward.toLocaleString()} SDG` });
      this.beep([523, 659, 784, 1046]);
      this.active = null;
      this.goat.follow = false;
      this.goat.x = ISLAND.x - 20;
      this.goat.z = 0;
    } else {
      if (step.fact) this.cb.onMessage({ kind: 'fact', title: 'Did you know?', body: step.fact });
      else this.cb.onMessage({ kind: 'info', title: `Step ${a.i}/${a.m.steps.length} done`, body: a.m.steps[a.i].text });
      this.beep([660, 880]);
    }
    this.syncNpc();
  }

  private save() {
    try {
      localStorage.setItem('khartoum-save', JSON.stringify({ money: this.money, completed: [...this.completed] }));
    } catch {
      /* ignore */
    }
  }

  // ---------- camera / marker / audio ----------
  private updateCamera(dt: number) {
    const inCar = !!this.veh;
    const p = this.player;
    if (inCar) {
      const v = this.veh!;
      const k = this.keys;
      if (k.has('KeyQ')) this.camYaw += 1.8 * dt;
      if (this.time - this.lastLook > 2.2 && !this.menuOpen) {
        const target = v.speed >= -1 ? v.heading : v.heading + Math.PI;
        this.camYaw += angDiff(this.camYaw, target) * (1 - Math.exp(-2.2 * dt));
        this.camPitch += (0.22 - this.camPitch) * (1 - Math.exp(-1.5 * dt));
      }
    }
    const tx = p.x;
    const ty = (inCar ? (this.veh!.y + 1.5) : p.y + 1.6);
    const tz = p.z;
    const dist = inCar ? 9.5 + Math.min(4, Math.abs(this.veh!.speed) * 0.1) : 5.2;
    const cp = Math.cos(this.camPitch);
    const sp = Math.sin(this.camPitch);
    const dx = -Math.sin(this.camYaw) * cp * dist;
    const dz = -Math.cos(this.camYaw) * cp * dist;
    let dy = sp * dist;
    const wantX = tx + dx;
    const wantZ = tz + dz;
    const minY = groundY(wantX, wantZ) + 0.8;
    if (ty + dy < minY) dy = minY - ty;
    const want = new THREE.Vector3(wantX, ty + dy, wantZ);
    if (!this.camInit) {
      this.camPos.copy(want);
      this.camInit = true;
    } else {
      this.camPos.lerp(want, 1 - Math.exp(-(inCar ? 9 : 16) * dt));
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.camera.lookAt(tx, ty + 0.2, tz);
    const speedK = inCar ? Math.min(1, Math.abs(this.veh!.speed) / 40) : p.speed > 8 ? 0.25 : 0;
    const fov = 60 + speedK * 14;
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();

    // shadows follow
    const f = new THREE.Vector3(tx, 0, tz);
    this.sun.target.position.copy(f);
    this.sun.position.copy(f).addScaledVector(this.sunDir, 260);
    this.sun.target.updateMatrixWorld();

    // How much of the sun is in frame? Feeds the glare guard so highlights
    // get compressed (and bloom damped) exactly when the player looks sunward.
    const view = new THREE.Vector3();
    this.camera.getWorldDirection(view);
    const toSun = view.dot(this.sunDir);
    this.glareFactor = THREE.MathUtils.smoothstep(toSun, 0.55, 0.985);
    const target = this.glareGuard ? this.glareFactor : 0;
    this.gradePass.uniforms.uGlare.value += (target - this.gradePass.uniforms.uGlare.value) * (1 - Math.exp(-6 * dt));
    this.bloom.strength = this.useBloom ? 0.12 * (1 - this.glareFactor * 0.75) : 0;
    // Slight exposure relief while sun is in view keeps the HUD readable.
    this.renderer.toneMappingExposure = (this.warOn ? 0.8 : 0.92) - this.glareFactor * 0.08;
  }

  // ---------- combat ----------
  private equip(id: WeaponId | null) {
    if (this.viewModel) {
      this.camera.remove(this.viewModel.group);
      this.viewModel = null;
    }
    this.weaponId = id;
    this.reloadT = 0;
    if (!id) return;
    this.lastWeapon = id;
    if (this.veh) return;
    this.viewModel = createViewModel(id);
    const g = this.viewModel.group;
    g.renderOrder = 10;
    this.camera.add(g);
    this.effects.attachFlash(this.viewModel.muzzle, new THREE.Vector3(0, 0, 0.04));
  }

  private reload() {
    if (!this.weaponId || this.reloadT > 0) return;
    const spec = WEAPONS[this.weaponId];
    const slot = this.ammo[this.weaponId];
    if (slot.mag >= spec.mag || slot.reserve <= 0) return;
    this.reloadT = spec.reload;
    this.beep([320, 240]);
  }

  private finishReload() {
    if (!this.weaponId) return;
    const spec = WEAPONS[this.weaponId];
    const slot = this.ammo[this.weaponId];
    const need = spec.mag - slot.mag;
    const take = Math.min(need, slot.reserve);
    slot.mag += take;
    slot.reserve -= take;
  }

  private tryFire() {
    if (this.menuOpen || this.veh || !this.weaponId) return;
    const spec = WEAPONS[this.weaponId];
    if (this.fireCd > 0 || this.reloadT > 0) return;
    const slot = this.ammo[this.weaponId];
    if (slot.mag <= 0) {
      if (slot.reserve > 0) this.reload();
      else {
        this.fireCd = 0.45;
        this.beep([170, 120]);
      }
      return;
    }
    slot.mag--;
    this.fireCd = 60 / spec.rpm;
    this.recoil = Math.min(1.2, this.recoil + (spec.id === 'sniper' ? 1 : spec.id === 'rifle' ? 0.5 : 0.35));
    this.ensureAudio();
    this.shotSound(spec.id);

    const origin = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    dir.x += (Math.random() - 0.5) * spec.spread * 2;
    dir.y += (Math.random() - 0.5) * spec.spread * 2;
    dir.z += (Math.random() - 0.5) * spec.spread * 2;
    dir.normalize();

    const end = new THREE.Vector3().copy(dir).multiplyScalar(spec.range).add(origin);
    const hit = this.mil.hitTest(origin, dir, spec.range);
    if (hit) {
      end.set(hit.soldier.x, hit.soldier.group.position.y + (hit.head ? 1.62 : 1.05), hit.soldier.z);
      const killed = this.mil.damage(hit.soldier, spec.dmg * (hit.head ? 2 : 1));
      this.effects.impact(end.x, end.y, end.z);
      this.onHostile(hit.soldier.faction);
      if (killed) this.onKill(hit.soldier.faction);
    } else {
      // hit the ground: leave a dust puff where the round lands
      const gy = groundY(end.x, end.z);
      if (end.y < gy) {
        end.y = gy;
        this.effects.impact(end.x, gy + 0.1, end.z);
      }
    }

    const from = new THREE.Vector3();
    if (this.viewModel) this.viewModel.muzzle.getWorldPosition(from);
    else from.copy(origin);
    this.effects.tracer(from, end);
    this.effects.muzzleFlash();

    // muzzle climb
    const kick = spec.id === 'sniper' ? 0.03 : spec.id === 'rifle' ? 0.012 : 0.008;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + kick * (0.7 + Math.random() * 0.6), -0.15, 1.3);
    this.camYaw += (Math.random() - 0.5) * kick * 0.6;
  }

  private onHostile(f: Faction) {
    const first = !this.mil.hostile.has(f);
    this.mil.makeHostile(f);
    if (first && !this.warnedFaction.has(f)) {
      this.warnedFaction.add(f);
      this.cb.onMessage({
        kind: 'fail',
        title: `⚠ ${FACTIONS[f].ar} — ${FACTIONS[f].en}`,
        body: 'فتحت النار عليهم. الدوريات في المنطقة بقت معادية — خُد غطاء أو انسحب.',
      });
      this.beep([300, 220, 160]);
    }
  }

  private onKill(f: Faction) {
    this.kills++;
    this.money += 120;
    this.ammo.rifle.reserve = Math.min(WEAPONS.rifle.reserve, this.ammo.rifle.reserve + 20);
    this.ammo.pistol.reserve = Math.min(WEAPONS.pistol.reserve, this.ammo.pistol.reserve + 6);
    this.ammo.sniper.reserve = Math.min(WEAPONS.sniper.reserve, this.ammo.sniper.reserve + 2);
    this.cb.onMessage({
      kind: 'info',
      title: `+120 SDG · ${FACTIONS[f].ar}`,
      body: 'غنمت ذخيرة: +20 بندقية · +6 مسدس · +2 قناصة.',
    });
  }

  private damagePlayer(dmg: number, f: Faction) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurt = Math.min(1, this.hurt + 0.45);
    this.regenT = 0;
    if (this.hp <= 0) this.respawn(f);
  }

  private respawn(f: Faction) {
    if (this.veh) this.exitVehicle(true);
    this.player.x = 58;
    this.player.z = 40;
    this.player.y = groundY(58, 40);
    this.player.vy = 0;
    this.camInit = false;
    this.hp = 100;
    this.hurt = 1;
    this.mil.clearHostility();
    this.warnedFaction.clear();
    this.cb.onMessage({
      kind: 'fail',
      title: `أُصبت من ${FACTIONS[f].ar}`,
      body: 'تم نقلك إلى نقطة آمنة في وسط الخرطوم. صحة كاملة، والمواجهة اتصفّرت.',
    });
    this.beep([220, 170, 130]);
  }

  private shotSound(id: WeaponId) {
    const a = this.audio;
    if (!a) return;
    const dur = id === 'sniper' ? 0.34 : id === 'rifle' ? 0.16 : 0.12;
    const vol = id === 'sniper' ? 0.3 : id === 'rifle' ? 0.22 : 0.16;
    const buffer = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / data.length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, id === 'sniper' ? 2.4 : 4);
    }
    const src = a.createBufferSource();
    src.buffer = buffer;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = id === 'sniper' ? 1400 : 2200;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(lp);
    lp.connect(g);
    g.connect(a.destination);
    src.start();
    // low thump
    const o = a.createOscillator();
    const og = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(id === 'sniper' ? 120 : 170, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(48, a.currentTime + dur);
    og.gain.setValueAtTime(vol * 0.9, a.currentTime);
    og.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
    o.connect(og);
    og.connect(a.destination);
    o.start();
    o.stop(a.currentTime + dur + 0.02);
  }

  /** Distant enemy gunfire: quiet crack that fades with distance. */
  private enemyFireSound(dist: number) {
    const a = this.audio;
    if (!a || dist > 120) return;
    const gain = Math.max(0.02, 0.16 * (1 - dist / 120));
    const o = a.createOscillator();
    const g = a.createGain();
    const lp = a.createBiquadFilter();
    o.type = 'square';
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    o.frequency.value = 90 + Math.random() * 40;
    g.gain.setValueAtTime(gain, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.14);
    o.connect(lp);
    lp.connect(g);
    g.connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.16);
  }

  private updateCombat(dt: number) {
    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.finishReload();
      }
    }
    this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.6);

    // health regen out of combat
    this.regenT += dt;
    if (this.regenT > 6 && this.hp > 0 && this.hp < 100) this.hp = Math.min(100, this.hp + dt * 7);

    if (this.firesHeld && !this.menuOpen && this.locked) {
      const spec = this.weaponId ? WEAPONS[this.weaponId] : null;
      if (spec && spec.auto) this.tryFire();
    }

    this.mil.update(dt, this.time, {
      px: this.player.x,
      py: this.player.y,
      pz: this.player.z,
      playerAlive: this.hp > 0,
      groundY,
      driveable,
      isBlocked: (x0, z0, x1, z1) => {
        const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 4));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          if (this.colliders.blocked(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return true;
        }
        return false;
      },
      onEnemyFire: (x, y, z, dist) => {
        this.enemyFireSound(dist);
        const target = new THREE.Vector3(this.player.x, this.player.y + 1.2, this.player.z);
        this.effects.tracer(new THREE.Vector3(x, y, z), target);
      },
      onPlayerHit: (dmg, f) => this.damagePlayer(dmg, f),
      onKill: () => undefined,
    });
    this.effects.update(dt);
    this.war.update(dt, this.time);

    // view model sway + recoil kick
    if (this.viewModel) {
      const moving = this.player.speed > 1;
      this.bob += dt * (moving ? this.player.speed * 2.2 : 1.1);
      const base = WEAPONS[this.weaponId ?? 'pistol'];
      const sway = moving ? 0.012 : 0.004;
      const kick = this.recoil * (base.id === 'sniper' ? 0.09 : base.id === 'rifle' ? 0.05 : 0.035);
      this.viewModel.group.position.set(
        0.2 + Math.sin(this.bob) * sway,
        -0.2 + Math.cos(this.bob * 2) * sway * 0.7 - kick * 0.25,
        (base.id === 'sniper' ? -0.6 : base.id === 'rifle' ? -0.55 : -0.42) - kick
      );
      this.viewModel.group.rotation.x = -kick * 2.2;
      this.viewModel.group.rotation.z = Math.sin(this.bob) * 0.02;
      const rl = this.reloadT > 0 ? 1 - this.reloadT / base.reload : 0;
      this.viewModel.group.rotation.z += rl > 0 ? Math.sin(rl * Math.PI) * 0.7 : 0;
      this.viewModel.group.position.y -= rl > 0 ? Math.sin(rl * Math.PI) * 0.12 : 0;
    }
  }

  private updateMarker() {
    const a = this.active;
    if (!a) {
      this.marker.visible = false;
      return;
    }
    const step = a.m.steps[a.i];
    const t = this.stepTarget(step);
    if (!t) return;
    this.marker.visible = true;
    const gy = groundY(t.x, t.z);
    this.marker.position.set(t.x, gy, t.z);
    const dist = Math.hypot(t.x - this.camera.position.x, t.z - this.camera.position.z);
    const rad = step.kind === 'goto' ? Math.min(step.radius ?? 4, 8) * 0.55 + 0.6 : 1.6;
    const beamR = THREE.MathUtils.clamp(dist * 0.006, rad * 0.5, 7);
    this.markerBeam.scale.set(beamR, 1, beamR);
    this.markerRing.scale.set(rad * 1.6, rad * 1.6, rad * 1.6);
    this.markerRing.position.y = 0.3 + Math.sin(this.time * 3) * 0.12;
    if (step.kind === 'catch' || step.kind === 'enter') this.markerBeam.scale.set(beamR * 0.5, 1, beamR * 0.5);
  }

  private updateAudio() {
    if (!this.engine || !this.audio) return;
    const e = this.engine;
    const t = this.audio.currentTime;
    if (this.veh && !this.menuOpen) {
      const sp = Math.abs(this.veh.speed);
      const f = 38 + sp * 3.2 + (this.keys.has('KeyW') ? 12 : 0);
      e.osc.frequency.setTargetAtTime(f, t, 0.08);
      e.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      e.filter.frequency.setTargetAtTime(280 + sp * 22, t, 0.1);
      e.gain.gain.setTargetAtTime(0.03 + Math.min(0.03, sp * 0.0012), t, 0.1);
    } else {
      e.gain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  // ---------- HUD ----------
  private emitHud() {
    const a = this.active;
    let mission: HudState['mission'] = null;
    let hint: string | null = null;
    if (a) {
      const step = a.m.steps[a.i];
      const t = this.stepTarget(step);
      const dx = (t?.x ?? 0) - this.player.x;
      const dz = (t?.z ?? 0) - this.player.z;
      const dist = Math.hypot(dx, dz);
      const bearing = Math.atan2(dx, dz);
      if (step.kind === 'goto' && dist < (step.radius ?? 5) * 3) {
        if (step.vehicle === 'in' && !this.veh) hint = 'You need to be in a vehicle (press E near one).';
        if (step.vehicle === 'out' && this.veh) hint = 'Get out of your vehicle first (press E).';
      }
      mission = {
        id: a.m.id,
        title: a.m.title,
        titleAr: a.m.titleAr,
        stepIndex: a.i,
        steps: a.m.steps.length,
        text: step.text,
        textAr: step.textAr,
        distance: dist,
        angle: angDiff(this.camYaw, bearing),
        timeLeft: a.timeLeft !== null && a.i >= (a.m.timeStart ?? 0) ? Math.max(0, a.timeLeft) : a.timeLeft !== null ? a.timeLeft : null,
        hint,
      };
    }
    let prompt: string | null = null;
    if (this.veh) prompt = 'E  Exit vehicle   ·   F  Horn   ·   Space  Handbrake';
    else {
      const v = this.nearestVehicle();
      if (v) prompt = `E  Drive ${v.spec.name} · ${v.spec.nameAr}`;
    }
    this.cb.onHud({
      money: this.money,
      district: districtAt(this.player.x, this.player.z),
      speedKmh: this.veh ? Math.abs(this.veh.speed) * 3.6 : 0,
      inVehicle: !!this.veh,
      vehicleName: this.veh ? this.veh.spec.name : null,
      prompt,
      mission,
      locked: this.locked,
      completed: [...this.completed],
      hp: Math.round(this.hp),
      hurt: this.hurt,
      weapon: this.weaponId
        ? {
            name: WEAPONS[this.weaponId].en,
            nameAr: WEAPONS[this.weaponId].ar,
            mag: this.ammo[this.weaponId].mag,
            reserve: this.ammo[this.weaponId].reserve,
            reloading: this.reloadT > 0 ? 1 - this.reloadT / WEAPONS[this.weaponId].reload : 0,
          }
        : null,
      hostile: [...this.mil.hostile].map((f) => FACTIONS[f].ar),
      kills: this.kills,
    });
  }

  // ---------- maps ----------
  private drawMini(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width;
    const viewR = 150;
    const k = s / (2 * viewR);
    const p = this.player;
    const phi = this.camYaw + Math.PI;
    ctx.clearRect(0, 0, s, s);
    ctx.save();
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 2, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#c9b88e';
    ctx.fillRect(0, 0, s, s);
    ctx.translate(s / 2, s / 2);
    ctx.rotate(phi);
    ctx.scale(k, k);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.baseMap, -HALF - p.x, -HALF - p.z, HALF * 2, HALF * 2);
    // landmarks
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1 / k;
    for (const poi of POIS) {
      ctx.beginPath();
      ctx.arc(poi.x - p.x, poi.z - p.z, 3.4 / k * 1.0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // soldiers: red when hostile, olive when neutral
    for (const sd of this.mil.soldiers) {
      if (sd.state === 'down') continue;
      const d = Math.hypot(sd.x - p.x, sd.z - p.z);
      if (d > viewR) continue;
      const hostile = this.mil.hostile.has(sd.faction);
      ctx.fillStyle = hostile ? '#ff3b30' : sd.faction === 'army' ? '#7c8a56' : '#c9b98a';
      ctx.strokeStyle = '#1b1b1b';
      ctx.lineWidth = 1.5 / k;
      ctx.beginPath();
      ctx.arc(sd.x - p.x, sd.z - p.z, 2.6 / k, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // mission target
    const a = this.active;
    if (a) {
      const t = this.stepTarget(a.m.steps[a.i]);
      if (t) {
        let vx = t.x - p.x;
        let vz = t.z - p.z;
        const len = Math.hypot(vx, vz);
        const lim = viewR * 0.88;
        if (len > lim) {
          vx = (vx / len) * lim;
          vz = (vz / len) * lim;
        }
        ctx.fillStyle = '#ffc83d';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2 / k;
        ctx.beginPath();
        ctx.arc(vx, vz, 7 / k, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    // player arrow (always up)
    ctx.save();
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0b3d2e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // north marker
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nr = s / 2 - 12;
    ctx.fillStyle = '#d21034';
    ctx.fillText('N', s / 2 + Math.sin(phi) * nr, s / 2 - Math.cos(phi) * nr);
  }

  private drawBig(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width;
    const k = s / (HALF * 2);
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(this.baseMap, 0, 0, s, s);
    const X = (x: number) => (x + HALF) * k;
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px sans-serif';
    for (const poi of POIS) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(poi.x), X(poi.z), 5, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.strokeText(poi.name, X(poi.x), X(poi.z) - 9);
      ctx.fillStyle = '#222';
      ctx.fillText(poi.name, X(poi.x), X(poi.z) - 9);
    }
    const a = this.active;
    if (a) {
      const t = this.stepTarget(a.m.steps[a.i]);
      if (t) {
        ctx.fillStyle = '#ffc83d';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(X(t.x), X(t.z), 9, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }
    const p = this.player;
    ctx.save();
    ctx.translate(X(p.x), X(p.z));
    ctx.rotate(Math.PI - (this.veh ? this.veh.heading : p.heading));
    ctx.fillStyle = '#1fd37a';
    ctx.strokeStyle = '#06301d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.handleUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.handleLock);
    this.renderer.domElement.removeEventListener('mousedown', this.handleDown);
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.audio) void this.audio.close();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) this.container.removeChild(this.renderer.domElement);
  }
}
