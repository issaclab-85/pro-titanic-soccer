import { Cpu, LogOut, Play, RotateCw, Settings, Shield, UserCheck, Wifi } from 'lucide-react';
import { getClubById } from '../data/clubs';
import type { PlayerProfile } from '../types/game';

interface HomeMenuProps {
  profile: PlayerProfile;
  showPlayModePicker: boolean;
  onTogglePlayModePicker: (open: boolean) => void;
  onOpenAloneSetup: () => void;
  onOpenLanMatch: () => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onToggleBackView: () => void;
  onQuit: () => void;
}

export function HomeMenu({
  profile,
  showPlayModePicker,
  onTogglePlayModePicker,
  onOpenAloneSetup,
  onOpenLanMatch,
  onOpenProfile,
  onOpenSettings,
  onToggleBackView,
  onQuit,
}: HomeMenuProps) {
  const club = getClubById(profile.clubId);

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
      {/* Top Bar: Minimal left badge + right kit toggle & Settings */}
      <div className="flex items-start justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-slate-700/70 bg-slate-950/88 px-3.5 py-2 text-xs text-slate-200 shadow-lg">
          <span
            className="inline-block h-3.5 w-3.5 rounded-sm border border-white/30"
            style={{ backgroundColor: club.primaryColor }}
          />
          <span className="font-semibold tracking-wide text-slate-100">{club.name}</span>
          <span className="text-slate-500">·</span>
          <span className="font-mono text-amber-400">
            #{profile.jerseyNumber} {profile.jerseyText}
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleBackView}
            className="flex items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-950/88 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-amber-400/70 hover:text-amber-300"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Inspect Jersey Back</span>
            <span className="sm:hidden">Kit</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-950/88 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-sky-400/70 hover:text-sky-300"
            aria-label="Open Settings"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>

      {/* Main Split: Left side open for 3D Avatar Showcase, Right side for Title Lockup & Menu */}
      <div className="my-auto flex w-full items-center justify-end">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-slate-700/75 bg-slate-950/92 p-6 shadow-2xl sm:p-7">
          {/* Bespoke SVG Title Lockup */}
          <div className="mb-6 flex items-center gap-4">
            <svg
              viewBox="0 0 64 64"
              className="h-14 w-14 shrink-0"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="ptsShield" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FACC15" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
              </defs>
              <path
                d="M32 4 L56 13 V31 C56 46 45 55 32 60 C19 55 8 46 8 31 V13 Z"
                fill="#0F172A"
                stroke="url(#ptsShield)"
                strokeWidth="3.5"
              />
              <circle cx="32" cy="31" r="13" fill="none" stroke="#38BDF8" strokeWidth="2.2" />
              <polygon
                points="32,21 39,27 36,36 28,36 25,27"
                fill="#FACC15"
              />
            </svg>
            <div>
              <p className="text-[11px] font-bold tracking-[0.26em] text-amber-400 uppercase">
                3D Third-Person Pitch
              </p>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                PRO TITANIC SOCCER
              </h1>
            </div>
          </div>

          {!showPlayModePicker ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => onTogglePlayModePicker(true)}
                className="flex w-full items-center justify-between rounded-xl bg-amber-400 px-5 py-3.5 text-left font-extrabold text-slate-950 shadow-lg transition hover:bg-amber-300"
              >
                <span className="flex items-center gap-3 text-base">
                  <Play className="h-5 w-5 fill-slate-950" />
                  PLAY
                </span>
                <span className="text-xs font-bold tracking-wider text-slate-900 uppercase">
                  3v3 – 6v6
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenProfile}
                className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-sky-400/70 hover:bg-slate-800"
              >
                <span className="flex items-center gap-3">
                  <Shield className="h-4 w-4 text-sky-400" />
                  Profile, Club &amp; Jersey
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  {profile.profileConfirmed && <UserCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  {profile.playerName}
                </span>
              </button>

              <button
                type="button"
                onClick={onQuit}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-400 transition hover:border-rose-500/60 hover:text-rose-300"
              >
                <span className="flex items-center gap-3">
                  <LogOut className="h-4 w-4" />
                  Quit
                </span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-wider text-slate-300 uppercase">
                  Select Game Mode
                </h2>
                <button
                  type="button"
                  onClick={() => onTogglePlayModePicker(false)}
                  className="text-xs font-semibold text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
              </div>

              <button
                type="button"
                onClick={onOpenAloneSetup}
                className="flex w-full items-start gap-3.5 rounded-xl border border-sky-500/50 bg-slate-900 p-4 text-left transition hover:border-sky-400 hover:bg-slate-800"
              >
                <div className="rounded-lg bg-sky-500/20 p-2.5 text-sky-400">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Alone vs AI</div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Instant single-player match. Choose teams, time (4–10m), 3v3–6v6 &amp; field size.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenLanMatch}
                className="flex w-full items-start gap-3.5 rounded-xl border border-amber-500/50 bg-slate-900 p-4 text-left transition hover:border-amber-400 hover:bg-slate-800"
              >
                <div className="rounded-lg bg-amber-500/20 p-2.5 text-amber-400">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-white">LAN Team Match</div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Host or join up to 6 players on hotspot/LAN. Pick team, Outfield/GK role &amp; coin toss.
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Clean Bottom Player Tag */}
      <div className="text-xs font-semibold text-slate-300/85">
        {profile.playerName}
      </div>
    </div>
  );
}
