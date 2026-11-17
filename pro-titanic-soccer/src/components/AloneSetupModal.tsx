import { useState } from 'react';
import { Play, X } from 'lucide-react';
import { CLUBS } from '../data/clubs';
import {
  FIELD_DIMENSIONS,
  type AiDifficulty,
  type AloneMatchConfig,
  type FieldSize,
  type MatchFormat,
  type MatchMinutes,
  type MatchSize,
  type PlayerRole,
} from '../types/game';

interface AloneSetupModalProps {
  defaultClubId: string;
  onStart: (config: AloneMatchConfig) => void;
  onClose: () => void;
}

const MATCH_TIMES: MatchMinutes[] = [4, 6, 8, 10];
const MATCH_SIZES: MatchSize[] = ['2v2', '3v3', '4v4', '5v5', '6v6'];
const FIELD_SIZES: FieldSize[] = ['compact', 'standard', 'titanic'];
const AI_DIFFICULTIES: Array<{ id: AiDifficulty; label: string; desc: string }> = [
  { id: 'rookie', label: 'Rookie', desc: 'Relaxed press & spacing' },
  { id: 'pro', label: 'Pro', desc: 'Smart passing & marking' },
  { id: 'titanic', label: 'Titanic', desc: 'Clinical tactical AI' },
];

export function AloneSetupModal({ defaultClubId, onStart, onClose }: AloneSetupModalProps) {
  const [userClubId, setUserClubId] = useState(defaultClubId);
  const [aiClubId, setAiClubId] = useState(
    defaultClubId === 'realmadrid' ? 'barcelona' : 'realmadrid',
  );
  const [matchMinutes, setMatchMinutes] = useState<MatchMinutes>(4);
  const [matchSize, setMatchSize] = useState<MatchSize>('5v5');
  const [fieldSize, setFieldSize] = useState<FieldSize>('standard');
  const [userRole, setUserRole] = useState<PlayerRole>('outfield');
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('standard');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('pro');

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/82 p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl">
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">Alone vs AI — Match Setup</h2>
            <p className="text-xs text-slate-400">
              Configure your club, opponent, match clock, squad quantity, and pitch dimensions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-sky-400 uppercase">
              Your Team
            </label>
            <select
              value={userClubId}
              onChange={(e) => setUserClubId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              {CLUBS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-rose-400 uppercase">
              AI Opponent Team
            </label>
            <select
              value={aiClubId}
              onChange={(e) => setAiClubId(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white"
            >
              {CLUBS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Match Format
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setMatchFormat('standard')}
              className={`rounded-xl border p-3 text-left transition ${
                matchFormat === 'standard'
                  ? 'border-amber-400 bg-amber-400/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="text-sm font-bold">Standard Match</div>
              <div className="text-[11px] text-slate-400">Full timed match with extra time &amp; tiebreaker</div>
            </button>
            <button
              type="button"
              onClick={() => setMatchFormat('penalty_shootout')}
              className={`rounded-xl border p-3 text-left transition ${
                matchFormat === 'penalty_shootout'
                  ? 'border-emerald-400 bg-emerald-400/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
              }`}
            >
              <div className="text-sm font-bold">Penalty Shootout Only</div>
              <div className="text-[11px] text-slate-400">Straight to best-of-5 spot kicks &amp; sudden death</div>
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
              Match Time (Minutes)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {MATCH_TIMES.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={matchFormat === 'penalty_shootout'}
                  onClick={() => setMatchMinutes(m)}
                  className={`rounded-xl border py-2 text-sm font-bold transition disabled:opacity-40 ${
                    matchMinutes === m
                      ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
              Player Quantity
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {MATCH_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMatchSize(s)}
                  className={`rounded-xl border py-2 text-sm font-bold transition ${
                    matchSize === s
                      ? 'border-sky-400 bg-sky-400/15 text-sky-300'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Field Size
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {FIELD_SIZES.map((fs) => {
              const info = FIELD_DIMENSIONS[fs];
              return (
                <button
                  key={fs}
                  type="button"
                  onClick={() => setFieldSize(fs)}
                  className={`rounded-xl border p-3 text-left transition ${
                    fieldSize === fs
                      ? 'border-emerald-400 bg-emerald-400/15 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="text-sm font-bold">{info.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-80">{info.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            AI Tactical Difficulty
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {AI_DIFFICULTIES.map((diff) => (
              <button
                key={diff.id}
                type="button"
                onClick={() => setAiDifficulty(diff.id)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  aiDifficulty === diff.id
                    ? 'border-rose-400 bg-rose-400/15 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-bold">{diff.label}</div>
                <div className="mt-0.5 text-[11px] opacity-80">{diff.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Your Match Role
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setUserRole('outfield')}
              className={`rounded-xl border p-3 text-left transition ${
                userRole === 'outfield'
                  ? 'border-amber-400 bg-amber-400/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <div className="text-sm font-bold">Outfield Player</div>
              <div className="text-[11px] text-slate-400">Dribble, pass, tackle &amp; shoot (Q/Tab switch)</div>
            </button>
            <button
              type="button"
              onClick={() => setUserRole('goalkeeper')}
              className={`rounded-xl border p-3 text-left transition ${
                userRole === 'goalkeeper'
                  ? 'border-amber-400 bg-amber-400/15 text-white'
                  : 'border-slate-800 bg-slate-950 text-slate-400'
              }`}
            >
              <div className="text-sm font-bold">Dedicated Goalkeeper</div>
              <div className="text-[11px] text-slate-400">Locked in GK goalmouth (Jump &amp; Dive saves)</div>
            </button>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onStart({
                userClubId,
                aiClubId,
                matchMinutes,
                matchSize,
                fieldSize,
                userRole,
                matchFormat,
                aiDifficulty,
              })
            }
            className="flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-emerald-300"
          >
            <Play className="h-4 w-4 fill-slate-950" />
            {matchFormat === 'penalty_shootout' ? 'Start Shootout' : 'Start Match'}
          </button>
        </div>
      </div>
    </div>
  );
}
