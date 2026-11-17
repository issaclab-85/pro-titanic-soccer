import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { BOOT_COLORS, CLUBS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../data/clubs';
import type { AvatarConfig, PlayerProfile } from '../types/game';

interface ProfileModalProps {
  profile: PlayerProfile;
  requireForLan?: boolean;
  onSave: (updated: PlayerProfile) => void;
  onClose: () => void;
}

export function ProfileModal({ profile, requireForLan, onSave, onClose }: ProfileModalProps) {
  const [playerName, setPlayerName] = useState(profile.playerName);
  const [clubId, setClubId] = useState(profile.clubId);
  const [jerseyText, setJerseyText] = useState(profile.jerseyText);
  const [jerseyNumber, setJerseyNumber] = useState(profile.jerseyNumber);
  const [avatar, setAvatar] = useState<AvatarConfig>({ ...profile.avatar });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = playerName.trim().slice(0, 14) || 'STRIKER';
    const cleanJersey = jerseyText.trim().toUpperCase().slice(0, 12) || cleanName.toUpperCase();
    onSave({
      ...profile,
      playerName: cleanName,
      clubId,
      jerseyText: cleanJersey,
      jerseyNumber: Math.max(1, Math.min(99, Number(jerseyNumber) || 10)),
      avatar,
      profileConfirmed: true,
    });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/82 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-black text-white">Player Profile &amp; Kit Studio</h2>
            <p className="text-xs text-slate-400">
              {requireForLan
                ? 'Confirm your player profile and jersey before entering LAN Team Match.'
                : 'Customize your 3D avatar, club jersey, and permanent back-of-jersey nameplate.'}
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

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
              Player Name (Floating Overhead)
            </label>
            <input
              type="text"
              required
              maxLength={14}
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-semibold text-white outline-none focus:border-amber-400"
              placeholder="e.g. LEO_10"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                Back Jersey Text
              </label>
              <input
                type="text"
                required
                maxLength={12}
                value={jerseyText}
                onChange={(e) => setJerseyText(e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm font-bold text-amber-300 uppercase outline-none focus:border-amber-400"
                placeholder="TITANIC"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
                No.
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-center font-mono text-sm font-bold text-white outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Club Selection */}
        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Club Selection (Determines Jersey Kit)
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {CLUBS.map((c) => {
              const active = c.id === clubId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClubId(c.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition ${
                    active
                      ? 'border-amber-400 bg-slate-800 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex h-6 w-10 overflow-hidden rounded border border-white/20">
                    <span className="w-1/2" style={{ backgroundColor: c.primaryColor }} />
                    <span className="w-1/2" style={{ backgroundColor: c.secondaryColor }} />
                  </div>
                  <span className="text-[11px] font-bold leading-tight">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Avatar Appearance */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
              Skin Tone
            </label>
            <div className="flex gap-2">
              {SKIN_TONES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setAvatar({ ...avatar, skinTone: s.hex })}
                  className={`h-9 flex-1 rounded-lg border-2 transition ${
                    avatar.skinTone === s.hex ? 'border-amber-400 scale-105' : 'border-slate-700'
                  }`}
                  style={{ backgroundColor: s.hex }}
                  title={s.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
              Hair Color
            </label>
            <div className="flex items-center gap-2">
              {HAIR_COLORS.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setAvatar({ ...avatar, hairColor: h.hex })}
                  className={`h-9 flex-1 rounded-lg border-2 transition ${
                    avatar.hairColor === h.hex ? 'border-amber-400 scale-105' : 'border-slate-700'
                  }`}
                  style={{ backgroundColor: h.hex }}
                  title={h.label}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Hairstyle
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {HAIR_STYLES.map((hs) => {
              const active = avatar.hairStyle === hs.id;
              return (
                <button
                  key={hs.id}
                  type="button"
                  onClick={() => setAvatar({ ...avatar, hairStyle: hs.id })}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                    active
                      ? 'border-amber-400 bg-slate-800 text-white'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <span>{hs.label}</span>
                  {hs.hasPhysics && (
                    <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                      DYN
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-400 uppercase">
            Boot Color
          </label>
          <div className="flex gap-2">
            {BOOT_COLORS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setAvatar({ ...avatar, bootColor: b.hex })}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  avatar.bootColor === b.hex
                    ? 'border-amber-400 bg-slate-800 text-white'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: b.hex }} />
                {b.label}
              </button>
            ))}
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
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-amber-300"
          >
            <Check className="h-4 w-4" />
            Save Profile &amp; Equip Kit
          </button>
        </div>
      </form>
    </div>
  );
}
