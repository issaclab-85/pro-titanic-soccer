import { Monitor, Music, Volume2, VolumeX, Waves, X } from 'lucide-react';
import type { GraphicsQuality } from '../types/game';

interface SettingsModalProps {
  graphicsQuality: GraphicsQuality;
  muted: boolean;
  musicEnabled: boolean;
  ambienceEnabled: boolean;
  onChangeQuality: (quality: GraphicsQuality) => void;
  onToggleMute: () => void;
  onToggleMusic: () => void;
  onToggleAmbience: () => void;
  onClose: () => void;
}

const QUALITY_OPTIONS: {
  id: GraphicsQuality;
  label: string;
  spec: string;
  desc: string;
}[] = [
  {
    id: 'low',
    label: 'Low',
    spec: '1x Res · Shadows Off · 120 Crowd',
    desc: 'Best battery & smoothest 60 FPS on compact mobile devices.',
  },
  {
    id: 'medium',
    label: 'Medium',
    spec: '1.5x Res · Soft Shadows · 300 Crowd',
    desc: 'Balanced stadium lighting, floodlight beams & crisp turf detail.',
  },
  {
    id: 'high',
    label: 'High',
    spec: 'Native 2x · HD Shadows · 560 Crowd',
    desc: 'Full stadium spectacle, dense animated stands & sharpest visuals.',
  },
];

export function SettingsModal({
  graphicsQuality,
  muted,
  musicEnabled,
  ambienceEnabled,
  onChangeQuality,
  onToggleMute,
  onToggleMusic,
  onToggleAmbience,
  onClose,
}: SettingsModalProps) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/82 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/85 bg-slate-900 p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div>
            <p className="text-[10px] font-extrabold tracking-[0.25em] text-amber-400 uppercase">
              Performance &amp; Audio
            </p>
            <h2 className="text-xl font-black text-white">Game Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-400 hover:border-slate-500 hover:text-white"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Graphics Quality Section */}
        <div className="mt-4">
          <div className="mb-2.5 flex items-center gap-2 text-xs font-bold tracking-wider text-slate-300 uppercase">
            <Monitor className="h-3.5 w-3.5 text-sky-400" />
            Graphics Quality
          </div>
          <div className="space-y-2">
            {QUALITY_OPTIONS.map((opt) => {
              const active = graphicsQuality === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeQuality(opt.id)}
                  className={`flex w-full items-start justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${
                    active
                      ? 'border-amber-400 bg-amber-400/12'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-600'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-extrabold ${active ? 'text-amber-300' : 'text-white'}`}>
                        {opt.label}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{opt.spec}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">{opt.desc}</p>
                  </div>
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                      active ? 'border-amber-400 bg-amber-400' : 'border-slate-600 bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Audio Toggles Section */}
        <div className="mt-5">
          <div className="mb-2.5 text-xs font-bold tracking-wider text-slate-300 uppercase">
            Audio Mix
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
                !muted
                  ? 'border-emerald-400/70 bg-emerald-500/12 text-emerald-200'
                  : 'border-rose-500/50 bg-rose-500/10 text-rose-300'
              }`}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span>{muted ? 'Muted' : 'Master On'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleMusic}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
                musicEnabled && !muted
                  ? 'border-sky-400/70 bg-sky-500/12 text-sky-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <Music className="h-4 w-4" />
              <span>{musicEnabled ? 'Menu Music' : 'Music Off'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleAmbience}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-xs font-bold transition ${
                ambienceEnabled && !muted
                  ? 'border-amber-400/70 bg-amber-500/12 text-amber-200'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <Waves className="h-4 w-4" />
              <span>{ambienceEnabled ? 'Crowd On' : 'Crowd Off'}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-amber-300"
        >
          Apply &amp; Close
        </button>
      </div>
    </div>
  );
}
