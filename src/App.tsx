import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, type GameMessage, type HudState } from './game/Game';
import { MISSIONS } from './game/missions';

interface Toast extends GameMessage {
  id: number;
}

const EMPTY_HUD: HudState = {
  money: 0,
  district: { en: 'Khartoum', ar: 'الخرطوم' },
  speedKmh: 0,
  inVehicle: false,
  vehicleName: null,
  prompt: null,
  mission: null,
  locked: false,
  completed: [],
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export default function App() {
  const mount = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const bigRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<null | 'missions' | 'map' | 'help'>(null);
  const [bloom, setBloom] = useState(true);
  const [fogFar, setFogFar] = useState(3000);
  const idRef = useRef(0);

  const pushToast = useCallback((m: GameMessage) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { ...m, id }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), m.kind === 'fact' || m.kind === 'success' ? 9000 : 5000);
  }, []);

  // create game
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (cancelled || !mount.current) return;
      try {
        const g = new Game(mount.current, { onHud: setHud, onMessage: pushToast });
        gameRef.current = g;
        setReady(true);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      gameRef.current?.dispose();
      gameRef.current = null;
    };
  }, [pushToast]);

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    g.attachMini(miniRef.current);
    return () => g.attachMini(null);
  }, [ready, started]);

  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    g.attachBig(panel === 'map' ? bigRef.current : null);
    return () => g.attachBig(null);
  }, [panel, ready]);

  // pause game while any panel / start screen is open
  useEffect(() => {
    gameRef.current?.setMenuOpen(!started || panel !== null);
  }, [started, panel, ready]);

  useEffect(() => {
    gameRef.current?.setBloom(bloom);
  }, [bloom, ready]);

  useEffect(() => {
    gameRef.current?.setFogFar(fogFar);
  }, [fogFar, ready]);

  // keys for panels
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started) return;
      if (e.code === 'KeyM') setPanel((p) => (p === 'missions' ? null : 'missions'));
      else if (e.code === 'Tab') {
        e.preventDefault();
        setPanel((p) => (p === 'map' ? null : 'map'));
      } else if (e.code === 'KeyH') setPanel((p) => (p === 'help' ? null : 'help'));
      else if (e.code === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started]);

  const begin = () => {
    setStarted(true);
    setPanel(null);
    gameRef.current?.setMenuOpen(false);
    setTimeout(() => gameRef.current?.requestLock(), 30);
  };

  const closePanel = () => {
    setPanel(null);
    setTimeout(() => gameRef.current?.requestLock(), 30);
  };

  const startMission = (id: string, travel: boolean) => {
    gameRef.current?.startMission(id, travel);
    closePanel();
  };

  const m = hud.mission;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#d9ccb0] text-white select-none" style={{ fontFamily: '"Segoe UI", Tahoma, system-ui, sans-serif' }}>
      <div ref={mount} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(30,15,0,0.38) 100%)' }} />

      {/* loading */}
      {!ready && !error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-[#1b2a3a] to-[#3a2a1a]">
          <div className="mb-3 text-5xl">🌍</div>
          <div className="text-2xl font-semibold tracking-wide">Building the capital…</div>
          <div className="mt-2 text-sm text-amber-200/80" dir="rtl">جارٍ بناء الخرطوم</div>
          <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-amber-400" />
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-8 text-center">
          <div>
            <div className="mb-2 text-xl font-semibold">WebGL could not start</div>
            <div className="text-sm text-white/70">{error}</div>
          </div>
        </div>
      )}

      {/* start screen */}
      {ready && !started && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-gradient-to-br from-black/70 via-[#102a3a]/70 to-[#4a2c0a]/70 backdrop-blur-sm">
          <div className="max-w-2xl px-6 text-center">
            <div className="mb-2 text-sm uppercase tracking-[0.5em] text-amber-300">Open World</div>
            <h1 className="text-5xl font-bold leading-tight sm:text-6xl">
              Khartoum <span className="text-amber-300">Nights &amp; Niles</span>
            </h1>
            <div className="mt-2 text-3xl text-amber-200" dir="rtl">الخرطوم · أم درمان · بحري</div>
            <p className="mx-auto mt-5 max-w-xl text-base text-white/80">
              Explore the three cities where the Blue and White Niles meet. Drive taxis and rakshas across the bridges, deliver tea, race through Omdurman,
              and learn the stories of the capital — as a nameless, faceless wanderer.
            </p>
            <button
              onClick={begin}
              className="mt-8 rounded-full bg-amber-400 px-10 py-3 text-lg font-bold text-[#2a1a05] shadow-lg shadow-amber-500/30 transition hover:scale-105 hover:bg-amber-300"
            >
              Enter the city
            </button>
            <div className="mx-auto mt-8 grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-left text-xs text-white/70">
              <div><b className="text-white">W A S D</b> move / drive</div>
              <div><b className="text-white">Mouse</b> look (click to capture)</div>
              <div><b className="text-white">Shift</b> sprint · <b className="text-white">Space</b> jump / brake</div>
              <div><b className="text-white">E</b> enter / exit vehicle</div>
              <div><b className="text-white">M</b> missions · <b className="text-white">Tab</b> map</div>
              <div><b className="text-white">F</b> horn · <b className="text-white">H</b> help</div>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      {ready && started && (
        <>
          {/* top-left: location + money */}
          <div className="absolute left-4 top-4 z-10 space-y-2">
            <div className="rounded-xl bg-black/45 px-4 py-2 backdrop-blur-md">
              <div className="text-[10px] uppercase tracking-widest text-amber-300">Location</div>
              <div className="text-lg font-semibold leading-tight">{hud.district.en}</div>
              <div className="text-sm text-white/70" dir="rtl">{hud.district.ar}</div>
            </div>
            <div className="inline-block rounded-xl bg-black/45 px-4 py-2 text-lg font-bold text-emerald-300 backdrop-blur-md">
              {hud.money.toLocaleString()} <span className="text-xs font-medium text-emerald-100/70">SDG</span>
            </div>
          </div>

          {/* top-right: mission */}
          <div className="absolute right-4 top-4 z-10 w-80 max-w-[calc(100vw-2rem)]">
            {m ? (
              <div className="rounded-2xl border border-amber-300/30 bg-black/55 p-4 shadow-xl backdrop-blur-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-amber-300">Mission · {m.stepIndex + 1}/{m.steps}</div>
                    <div className="text-base font-bold leading-snug">{m.title}</div>
                    <div className="text-sm text-amber-100/70" dir="rtl">{m.titleAr}</div>
                  </div>
                  {m.timeLeft !== null && (
                    <div className={`rounded-lg px-2 py-1 text-lg font-mono font-bold ${m.timeLeft < 20 ? 'bg-red-600/80' : 'bg-white/15'}`}>{fmtTime(m.timeLeft)}</div>
                  )}
                </div>
                <div className="mt-3 text-sm leading-snug text-white/90">{m.text}</div>
                {m.textAr && <div className="mt-1 text-sm text-white/60" dir="rtl">{m.textAr}</div>}
                {m.hint && <div className="mt-2 rounded-md bg-red-500/30 px-2 py-1 text-xs text-red-100">{m.hint}</div>}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/90 text-[#2a1a05]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ transform: `rotate(${(-m.angle * 180) / Math.PI}deg)` }}>
                      <path d="M12 2 L19 20 L12 15 L5 20 Z" fill="currentColor" />
                    </svg>
                  </div>
                  <div className="text-sm">
                    <span className="text-xl font-bold">{Math.round(m.distance)}</span> m
                  </div>
                  <div className="ml-auto flex gap-1">
                    {Array.from({ length: m.steps }).map((_, i) => (
                      <span key={i} className={`h-1.5 w-3 rounded-full ${i < m.stepIndex ? 'bg-emerald-400' : i === m.stepIndex ? 'bg-amber-300' : 'bg-white/20'}`} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setPanel('missions')}
                className="pointer-events-auto ml-auto block rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-left text-sm backdrop-blur-md transition hover:bg-black/60"
              >
                <div className="text-[10px] uppercase tracking-widest text-amber-300">No active mission</div>
                Press <b>M</b> to choose a mission
              </button>
            )}
          </div>

          {/* minimap */}
          <div className="absolute bottom-4 left-4 z-10">
            <div className="relative h-[210px] w-[210px] rounded-full border-4 border-white/80 bg-black/30 shadow-2xl shadow-black/50">
              <canvas ref={miniRef} width={420} height={420} className="h-full w-full rounded-full" />
            </div>
          </div>

          {/* prompt */}
          {hud.prompt && !panel && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-5 py-2 text-sm font-medium backdrop-blur-md">
              {hud.prompt}
            </div>
          )}

          {/* speedometer */}
          {hud.inVehicle && (
            <div className="absolute bottom-4 right-4 z-10 rounded-2xl bg-black/50 px-6 py-3 text-right backdrop-blur-md">
              <div className="text-5xl font-bold tabular-nums leading-none">{Math.round(hud.speedKmh)}</div>
              <div className="text-xs uppercase tracking-widest text-amber-300">km/h · {hud.vehicleName}</div>
            </div>
          )}

          {/* capture hint */}
          {!hud.locked && !panel && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/45 px-4 py-1.5 text-xs text-white/80 backdrop-blur">
              Click the game to capture the mouse · drag to look · <b>M</b> missions · <b>Tab</b> map · <b>H</b> help
            </div>
          )}

          {/* toasts */}
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 flex w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-col gap-2">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`animate-[fadein_0.3s_ease-out] rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md ${
                  t.kind === 'success'
                    ? 'border-emerald-300/50 bg-emerald-900/70'
                    : t.kind === 'fail'
                    ? 'border-red-300/50 bg-red-900/70'
                    : t.kind === 'fact'
                    ? 'border-sky-300/40 bg-sky-950/75'
                    : 'border-amber-300/40 bg-black/65'
                }`}
              >
                <div className="text-sm font-bold">
                  {t.kind === 'success' ? '🏆 ' : t.kind === 'fail' ? '⏱ ' : t.kind === 'fact' ? '💡 ' : '📍 '}
                  {t.title}
                </div>
                {t.body && <div className="mt-0.5 text-xs leading-snug text-white/85">{t.body}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* missions panel */}
      {started && panel === 'missions' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#14202b]/95 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-2xl font-bold">Missions <span className="text-amber-300" dir="rtl">· المهام</span></h2>
                <div className="text-xs text-white/60">{hud.completed.length}/{MISSIONS.length} completed · {hud.money.toLocaleString()} SDG earned</div>
              </div>
              <button onClick={closePanel} className="rounded-full bg-white/10 px-4 py-1.5 text-sm hover:bg-white/20">Close (Esc)</button>
            </div>
            <div className="grid gap-3 overflow-y-auto p-5 sm:grid-cols-2">
              {MISSIONS.map((mi) => {
                const done = hud.completed.includes(mi.id);
                const activeNow = hud.mission?.id === mi.id;
                return (
                  <div key={mi.id} className={`flex flex-col rounded-2xl border p-4 ${activeNow ? 'border-amber-300/70 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl">{mi.icon}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate font-bold">{mi.title}</div>
                          {done && <span className="rounded bg-emerald-500/30 px-1.5 text-[10px] font-semibold text-emerald-200">DONE</span>}
                        </div>
                        <div className="text-sm text-amber-100/70" dir="rtl">{mi.titleAr}</div>
                        <div className="text-[11px] uppercase tracking-wider text-sky-300">{mi.district}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-amber-300">{'★'.repeat(mi.stars)}<span className="text-white/20">{'★'.repeat(3 - mi.stars)}</span></div>
                        <div className="font-semibold text-emerald-300">{mi.reward.toLocaleString()}</div>
                      </div>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-snug text-white/75">{mi.desc}</p>
                    <div className="mt-2 text-[11px] text-white/45">
                      {mi.steps.length} steps{mi.time ? ` · ${fmtTime(mi.time)} time limit` : ''}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => startMission(mi.id, false)} className="flex-1 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-[#2a1a05] hover:bg-amber-300">
                        {activeNow ? 'Restart' : 'Start'}
                      </button>
                      <button onClick={() => startMission(mi.id, true)} className="flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20">
                        Travel there
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {hud.mission && (
              <div className="border-t border-white/10 px-6 py-3 text-right">
                <button
                  onClick={() => {
                    gameRef.current?.cancelMission();
                    closePanel();
                  }}
                  className="rounded-lg bg-red-500/30 px-4 py-1.5 text-sm text-red-100 hover:bg-red-500/50"
                >
                  Cancel current mission
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* map panel */}
      {started && panel === 'map' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={closePanel}>
          <div className="rounded-3xl border border-white/10 bg-[#14202b]/95 p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-bold">Capital Map <span className="text-amber-300" dir="rtl">· الخريطة</span></div>
              <button onClick={closePanel} className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20">Close (Tab)</button>
            </div>
            <canvas ref={bigRef} width={760} height={760} className="rounded-xl" style={{ width: 'min(76vh, 90vw)', height: 'min(76vh, 90vw)' }} />
            <div className="mt-2 text-xs text-white/60">Green arrow: you · Gold dot: mission objective · White dots: landmarks</div>
          </div>
        </div>
      )}

      {/* help panel */}
      {started && panel === 'help' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={closePanel}>
          <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#14202b]/95 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-xl font-bold">Controls</h2>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {[
                ['W A S D', 'Walk / drive'],
                ['Mouse / ← →', 'Look around'],
                ['Shift', 'Sprint'],
                ['Space', 'Jump · handbrake in vehicles'],
                ['E', 'Get in / out of a vehicle'],
                ['F', 'Horn'],
                ['M', 'Missions menu'],
                ['Tab', 'Full map'],
                ['H', 'This help'],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <kbd className="rounded bg-white/10 px-2 py-0.5 text-center font-mono text-xs">{k}</kbd>
                  <span className="text-white/80">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/70">
              The Blue Nile flows from the east and the White Nile from the south; they meet at <b>Al-Mogran</b> and become the Nile. <b>Khartoum</b> lies south of
              the Blue Nile, <b>Khartoum Bahri</b> to the north-east and <b>Omdurman</b> to the west. Four bridges link the cities: Mac Nimir, Omdurman, Shambat and Tuti.
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={bloom} onChange={(e) => setBloom(e.target.checked)} />
              Cinematic bloom &amp; HDR post-processing
            </label>
            <label className="mt-3 block text-sm">
              <span className="flex items-center justify-between">
                <span>مسافة الرؤية · View distance</span>
                <span className="font-mono text-xs text-white/60">{Math.round(fogFar)} m</span>
              </span>
              <input
                type="range"
                min={800}
                max={4500}
                step={100}
                value={fogFar}
                onChange={(e) => setFogFar(Number(e.target.value))}
                className="mt-1 w-full accent-amber-400"
              />
            </label>
            <div className="mt-4 text-right">
              <button onClick={closePanel} className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-bold text-[#2a1a05]">Back to the city</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
