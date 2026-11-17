import { useEffect, useState } from 'react';

interface IntroSequenceProps {
  onComplete: () => void;
}

type IntroStep = 'studio' | 'creator' | 'loading';

export function IntroSequence({ onComplete }: IntroSequenceProps) {
  const [step, setStep] = useState<IntroStep>('studio');
  const [stampVisible, setStampVisible] = useState(false);
  const [creatorFadingOut, setCreatorFadingOut] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (step === 'studio') {
      const t = window.setTimeout(() => {
        setStep('creator');
      }, 3900);
      return () => clearTimeout(t);
    }

    if (step === 'creator') {
      setStampVisible(false);
      setCreatorFadingOut(false);
      const tStamp = window.setTimeout(() => setStampVisible(true), 620);
      const tFadeOut = window.setTimeout(() => setCreatorFadingOut(true), 3250);
      const tNext = window.setTimeout(() => setStep('loading'), 3850);
      return () => {
        clearTimeout(tStamp);
        clearTimeout(tFadeOut);
        clearTimeout(tNext);
      };
    }

    // Step 3: 4-second smooth white-bordered loading bar
    const durationMs = 4000;
    const start = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      setLoadProgress(pct);
      if (elapsed < durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        window.setTimeout(onComplete, 120);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, onComplete]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white select-none">
      {/* Step 1: SR Studio Slow Fade-In / Hold 2s / Fade-Out */}
      {step === 'studio' && (
        <div className="flex h-full w-full items-center justify-center bg-black px-6">
          <div className="animate-sr-studio text-center">
            <div className="text-3xl font-light tracking-[0.38em] text-white uppercase sm:text-5xl">
              SR Studio
            </div>
            <div className="mx-auto mt-4 h-px w-20 bg-white/30" />
          </div>
        </div>
      )}

      {/* Step 2: Created and designed by + SAIMUN RAHMAN Rubber Stamp Impact */}
      {step === 'creator' && (
        <div
          className={`flex h-full w-full flex-col items-center justify-center bg-black px-6 transition-opacity duration-500 ${
            creatorFadingOut ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <p className="animate-sr-subtitle text-sm font-medium tracking-[0.28em] text-slate-300 uppercase sm:text-base">
            Created and designed by
          </p>

          <div className="relative mt-5 flex items-center justify-center">
            {stampVisible && (
              <>
                <span className="animate-sr-stamp-ring pointer-events-none absolute inset-0 rounded-xl border-2 border-amber-400/70" />
                <div className="animate-sr-stamp relative border-[3px] border-amber-400 bg-amber-400/10 px-6 py-2.5 shadow-[0_0_32px_rgba(251,191,36,0.28)] sm:px-9 sm:py-3">
                  <span className="block text-2xl font-black tracking-[0.18em] text-amber-300 uppercase sm:text-4xl">
                    SAIMUN RAHMAN
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Floodlit Stadium Football Loading Screen + 4s White-Bordered Progress Bar */}
      {step === 'loading' && (
        <div className="relative flex h-full w-full flex-col justify-between bg-[#060f1f] px-6 py-10 sm:px-12 sm:py-12">
          {/* Procedural Floodlit Stadium Vector Scene (Zero External Assets) */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            viewBox="0 0 1600 900"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden="true"
          >
            <defs>
              <radialGradient id="skyGlow" cx="50%" cy="38%" r="65%">
                <stop offset="0%" stopColor="#1e3a6d" stopOpacity="0.88" />
                <stop offset="55%" stopColor="#0a162b" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#040812" stopOpacity="1" />
              </radialGradient>
              <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#174d27" />
                <stop offset="50%" stopColor="#1f6332" />
                <stop offset="100%" stopColor="#12381c" />
              </linearGradient>
              <radialGradient id="spotLeft" cx="20%" cy="15%" r="55%">
                <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#bae6fd" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="spotRight" cx="80%" cy="15%" r="55%">
                <stop offset="0%" stopColor="#fde68a" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="1600" height="900" fill="url(#skyGlow)" />
            <rect width="1600" height="900" fill="url(#spotLeft)" />
            <rect width="1600" height="900" fill="url(#spotRight)" />

            {/* Stadium Bowl Stands Silhouette */}
            <path
              d="M0 540 Q800 390 1600 540 L1600 660 L0 660 Z"
              fill="#0b1528"
              opacity="0.92"
            />
            <path
              d="M0 565 Q800 425 1600 565"
              fill="none"
              stroke="#38bdf8"
              strokeOpacity="0.22"
              strokeWidth="3"
            />
            <path
              d="M0 595 Q800 460 1600 595"
              fill="none"
              stroke="#fbbf24"
              strokeOpacity="0.18"
              strokeWidth="2"
            />

            {/* Floodlight Towers */}
            <g opacity="0.88">
              <rect x="210" y="95" width="96" height="44" rx="6" fill="#0f172a" stroke="#93c5fd" strokeWidth="2" />
              <circle cx="234" cy="117" r="7" fill="#f8fafc" />
              <circle cx="258" cy="117" r="7" fill="#f8fafc" />
              <circle cx="282" cy="117" r="7" fill="#f8fafc" />
              <rect x="1294" y="95" width="96" height="44" rx="6" fill="#0f172a" stroke="#fde68a" strokeWidth="2" />
              <circle cx="1318" cy="117" r="7" fill="#fef3c7" />
              <circle cx="1342" cy="117" r="7" fill="#fef3c7" />
              <circle cx="1366" cy="117" r="7" fill="#fef3c7" />
            </g>

            {/* Perspective Turf & Pitch Lines */}
            <polygon points="-140,900 1740,900 1320,565 280,565" fill="url(#pitchGrad)" />
            <polygon
              points="110,875 1490,875 1235,585 365,585"
              fill="none"
              stroke="rgba(255,255,255,0.34)"
              strokeWidth="3"
            />
            <line x1="255" y1="715" x2="1345" y2="715" stroke="rgba(255,255,255,0.28)" strokeWidth="2.5" />
            <ellipse
              cx="800"
              cy="715"
              rx="170"
              ry="44"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2.5"
            />

            {/* Goal Frame Silhouette at Far End */}
            <rect
              x="715"
              y="526"
              width="170"
              height="58"
              fill="rgba(255,255,255,0.05)"
              stroke="rgba(248,250,252,0.55)"
              strokeWidth="4"
            />
          </svg>

          {/* Top Studio Tag */}
          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.28em] text-slate-300/85 uppercase">
              SR Studio Presents
            </span>
            <span className="text-[11px] font-semibold tracking-widest text-amber-300/80 uppercase">
              Stadium Edition
            </span>
          </div>

          {/* Center Title */}
          <div className="relative z-10 my-auto text-center">
            <div className="inline-block border-y border-amber-400/35 px-6 py-4">
              <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-[0_6px_28px_rgba(0,0,0,0.85)] sm:text-6xl">
                PRO TITANIC SOCCER
              </h1>
              <p className="mt-2 text-xs font-bold tracking-[0.3em] text-amber-300 uppercase sm:text-sm">
                Third-Person 3D Football Arena
              </p>
            </div>
          </div>

          {/* Bottom Smooth White-Bordered Loading Bar */}
          <div className="relative z-10 mx-auto w-full max-w-2xl pb-2">
            <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-widest text-slate-200 uppercase">
              <span>Loading Pitch &amp; Match Engine</span>
              <span className="font-mono tabular-nums">{Math.round(loadProgress)}%</span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full border-2 border-white bg-slate-950/75 p-0.5 shadow-[0_0_20px_rgba(255,255,255,0.18)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-white to-emerald-300 transition-[width] duration-75 ease-linear"
                style={{ width: `${loadProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
