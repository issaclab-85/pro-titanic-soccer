import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ClipboardPaste,
  Coins,
  Copy,
  RefreshCw,
  Shield,
  Smartphone,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { CLUBS, getClubById } from '../data/clubs';
import { getLanClientInstance, type P2PSignalingState } from '../services/lanClient';
import {
  FIELD_DIMENSIONS,
  MATCH_SIZE_COUNTS,
  type FieldSize,
  type LanMatchSettings,
  type LanRoomState,
  type LanRoomSummary,
  type MatchFormat,
  type MatchMinutes,
  type MatchSize,
  type PlayerProfile,
  type PlayerRole,
  type TeamSide,
} from '../types/game';

interface LanMatchModalProps {
  profile: PlayerProfile;
  clientId: string;
  connected: boolean;
  rooms: LanRoomSummary[];
  currentRoom: LanRoomState | null;
  errorMessage: string | null;
  onScanRooms: () => void;
  onCreateRoom: (settings: LanMatchSettings) => void;
  onJoinRoom: (roomId: string, preferredTeam?: TeamSide) => void;
  onLeaveRoom: () => void;
  onUpdateSettings: (settings: LanMatchSettings) => void;
  onSelectSlot: (team: TeamSide, role: PlayerRole) => void;
  onSetAiControl: (targetClientId: string, aiControlCount: number) => void;
  onHostAssignPlayer: (
    targetClientId: string,
    assignment: { team?: TeamSide; role?: PlayerRole },
  ) => void;
  onToggleReady: () => void;
  onClose: () => void;
}

const MATCH_TIMES: MatchMinutes[] = [4, 6, 8, 10];
const MATCH_SIZES: MatchSize[] = ['2v2', '3v3', '4v4', '5v5', '6v6'];
const FIELD_SIZES: FieldSize[] = ['compact', 'standard', 'titanic'];

async function copyTextReliable(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to execCommand below for insecure HTTP WebViews
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function LanMatchModal({
  profile,
  clientId,
  connected,
  rooms,
  currentRoom,
  errorMessage,
  onScanRooms,
  onCreateRoom,
  onJoinRoom,
  onLeaveRoom,
  onUpdateSettings,
  onSelectSlot,
  onSetAiControl,
  onHostAssignPlayer,
  onToggleReady,
  onClose,
}: LanMatchModalProps) {
  const [tab, setTab] = useState<'join' | 'host'>('join');
  const [preferredJoinTeam, setPreferredJoinTeam] = useState<'auto' | TeamSide>('auto');
  const [hostSettings, setHostSettings] = useState<LanMatchSettings>({
    matchMinutes: 6,
    matchSize: '5v5',
    fieldSize: 'standard',
    homeClubId: profile.clubId,
    awayClubId: profile.clubId === 'realmadrid' ? 'barcelona' : 'realmadrid',
    matchFormat: 'standard',
  });

  // WebRTC Offline Hotspot Code Exchange UI state
  const [signaling, setSignaling] = useState<P2PSignalingState>(() => {
    const client = getLanClientInstance(clientId);
    return (
      client?.getSignalingState() ?? {
        hostOfferCode: null,
        hostOfferGenerating: false,
        hostOfferError: null,
        connectedPeerCount: 0,
        joinerStatus: 'idle',
        joinerAnswerCode: null,
        joinerHostName: null,
        joinerRoomId: null,
        joinerError: null,
      }
    );
  });

  const [hostOfferCopied, setHostOfferCopied] = useState(false);
  const [answerCopied, setAnswerCopied] = useState(false);
  const [answerInput, setAnswerInput] = useState('');
  const [answerAcceptMsg, setAnswerAcceptMsg] = useState<string | null>(null);
  const [offerInput, setOfferInput] = useState('');

  useEffect(() => {
    const client = getLanClientInstance(clientId);
    if (!client) return;
    return client.subscribeSignaling((next) => {
      setSignaling(next);
    });
  }, [clientId, currentRoom?.roomId]);

  const meInRoom = currentRoom?.players.find((p) => p.clientId === clientId);
  const isHost = Boolean(meInRoom?.isHost);

  const handleHostSettingChange = (patch: Partial<LanMatchSettings>) => {
    const next = { ...hostSettings, ...patch };
    setHostSettings(next);
    if (currentRoom && isHost) {
      onUpdateSettings({ ...currentRoom.settings, ...patch });
    }
  };

  const handleCopyHostOffer = async () => {
    if (!signaling.hostOfferCode) return;
    const ok = await copyTextReliable(signaling.hostOfferCode);
    if (ok) {
      setHostOfferCopied(true);
      window.setTimeout(() => setHostOfferCopied(false), 1800);
    }
  };

  const handleCopyJoinerAnswer = async () => {
    if (!signaling.joinerAnswerCode) return;
    const ok = await copyTextReliable(signaling.joinerAnswerCode);
    if (ok) {
      setAnswerCopied(true);
      window.setTimeout(() => setAnswerCopied(false), 1800);
    }
  };

  const handlePasteOfferFromClipboard = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) setOfferInput(text.trim());
      }
    } catch {
      // Clipboard read may be blocked by WebView permissions; user can paste manually
    }
  };

  const handlePasteAnswerFromClipboard = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        if (text) setAnswerInput(text.trim());
      }
    } catch {
      // User can paste manually into the input box
    }
  };

  const handleGenerateJoinerAnswer = async () => {
    const client = getLanClientInstance(clientId);
    if (!client) return;
    setAnswerCopied(false);
    await client.joinWithOfferCode(
      offerInput,
      profile,
      preferredJoinTeam === 'auto' ? undefined : preferredJoinTeam,
    );
  };

  const handleAcceptJoinerAnswer = async () => {
    const client = getLanClientInstance(clientId);
    if (!client) return;
    setAnswerAcceptMsg(null);
    const res = await client.acceptJoinerAnswer(answerInput);
    if (res.ok) {
      setAnswerInput('');
      setAnswerAcceptMsg('Answer accepted! Connecting player over Wi-Fi Hotspot...');
      window.setTimeout(() => setAnswerAcceptMsg(null), 3000);
    }
  };

  const handleRefreshHostCode = async () => {
    const client = getLanClientInstance(clientId);
    if (!client) return;
    setHostOfferCopied(false);
    await client.createHostInviteOffer();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/84 p-4">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 shadow-2xl">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-400/15 p-2.5 text-amber-400">
              <Wifi className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">
                LAN Team Match (Offline Hotspot P2P)
              </h2>
              <p className="text-xs text-slate-400">
                2v2 to 6v6 Direct Wi-Fi Hotspot · Player:{' '}
                <span className="text-slate-200">{profile.playerName}</span> · Engine:{' '}
                <span className={connected ? 'text-emerald-400' : 'text-amber-400'}>
                  {connected
                    ? signaling.connectedPeerCount > 0
                      ? `WebRTC Direct (${signaling.connectedPeerCount} Connected)`
                      : 'WebRTC Hotspot Ready (Zero Internet)'
                    : 'Initializing'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (currentRoom) onLeaveRoom();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mb-4 rounded-xl border border-rose-500/50 bg-rose-950/60 px-4 py-2.5 text-xs font-semibold text-rose-200">
            {errorMessage}
          </div>
        )}

        {/* Active Shared Lobby View */}
        {currentRoom ? (
          <div>
            {/* Countdown & Automated Coin Toss Banner */}
            {currentRoom.status === 'countdown' && (
              <div className="mb-5 flex items-center justify-between rounded-xl border border-amber-400 bg-amber-400/15 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Coins className="h-6 w-6 text-amber-400" />
                  <div>
                    <div className="text-sm font-black text-amber-300">
                      AUTOMATED COIN TOSS WINNER:{' '}
                      {currentRoom.kickoffTeam === 'home'
                        ? getClubById(currentRoom.settings.homeClubId).name
                        : getClubById(currentRoom.settings.awayClubId).name}
                    </div>
                    <div className="text-xs text-slate-200">
                      All players ready! Kick-off begins in...
                    </div>
                  </div>
                </div>
                <div className="font-mono text-3xl font-black text-amber-300 tabular-nums">
                  {currentRoom.countdownSeconds}s
                </div>
              </div>
            )}

            {/* Host Offline Hotspot Invite & Answer Exchange Panel */}
            {isHost &&
              currentRoom.status === 'lobby' &&
              currentRoom.playerCount < currentRoom.maxPlayers && (
                <div className="mb-5 rounded-xl border border-sky-500/40 bg-slate-950/95 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-sky-400" />
                      <span className="text-xs font-black tracking-wider text-sky-300 uppercase">
                        Hotspot Direct Invite (Offline WebRTC)
                      </span>
                    </div>
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      {signaling.connectedPeerCount} Remote{' '}
                      {signaling.connectedPeerCount === 1 ? 'Phone' : 'Phones'} Linked
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* Step 1: Host Room Code */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-amber-300 uppercase">
                          1. Share Room Code
                        </span>
                        <button
                          type="button"
                          disabled={signaling.hostOfferGenerating}
                          onClick={handleRefreshHostCode}
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:border-sky-400 hover:text-white disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" />
                          New Code
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={
                            signaling.hostOfferGenerating
                              ? 'Generating Hotspot Code...'
                              : signaling.hostOfferCode || 'Unavailable'
                          }
                          onFocus={(e) => e.currentTarget.select()}
                          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-slate-200 select-all"
                        />
                        <button
                          type="button"
                          disabled={!signaling.hostOfferCode || signaling.hostOfferGenerating}
                          onClick={handleCopyHostOffer}
                          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-extrabold transition disabled:opacity-45 ${
                            hostOfferCopied
                              ? 'bg-emerald-400 text-slate-950'
                              : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                          }`}
                        >
                          {hostOfferCopied ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy Code
                            </>
                          )}
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        Send this <span className="font-mono text-slate-200">PTS1</span> code to
                        your friend on the same Wi-Fi Hotspot.
                      </p>
                    </div>

                    {/* Step 2: Accept Joiner's Answer Code */}
                    <div className="rounded-lg border border-slate-800 bg-slate-900/90 p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-sky-300 uppercase">
                          2. Paste Friend&apos;s Answer Code
                        </span>
                        <button
                          type="button"
                          onClick={handlePasteAnswerFromClipboard}
                          className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:border-sky-400 hover:text-white"
                        >
                          <ClipboardPaste className="h-3 w-3" />
                          Paste
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={answerInput}
                          onChange={(e) => setAnswerInput(e.target.value)}
                          placeholder="Paste PTSA:... code here"
                          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-[11px] text-white placeholder:text-slate-500"
                        />
                        <button
                          type="button"
                          disabled={!answerInput.trim()}
                          onClick={handleAcceptJoinerAnswer}
                          className="shrink-0 rounded-lg bg-sky-400 px-3 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-300 disabled:opacity-45"
                        >
                          Connect
                        </button>
                      </div>
                      {signaling.hostOfferError ? (
                        <p className="mt-1.5 text-[10px] font-semibold text-rose-300">
                          {signaling.hostOfferError}
                        </p>
                      ) : answerAcceptMsg ? (
                        <p className="mt-1.5 text-[10px] font-semibold text-emerald-300">
                          {answerAcceptMsg}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-[10px] text-slate-400">
                          Paste the <span className="font-mono text-slate-200">PTSA</span> code
                          generated by the joining phone.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* Match Settings Bar (Editable by Host, Read-only for Clients) */}
            <div className="mb-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                  Lobby #{currentRoom.roomId} · Host: {currentRoom.hostName} (
                  {currentRoom.playerCount}/{currentRoom.maxPlayers} Players)
                </span>
                <span className="rounded bg-slate-800 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                  {isHost ? 'Authoritative Host' : 'Connected via WebRTC'}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Mode
                  </label>
                  <select
                    disabled={!isHost || currentRoom.status !== 'lobby'}
                    value={currentRoom.settings.matchFormat || 'standard'}
                    onChange={(e) =>
                      handleHostSettingChange({ matchFormat: e.target.value as MatchFormat })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    <option value="standard">Standard Match</option>
                    <option value="penalty_shootout">Penalty Shootout Only</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Home Club
                  </label>
                  <select
                    disabled={!isHost || currentRoom.status !== 'lobby'}
                    value={currentRoom.settings.homeClubId}
                    onChange={(e) => handleHostSettingChange({ homeClubId: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    {CLUBS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Away Club
                  </label>
                  <select
                    disabled={!isHost || currentRoom.status !== 'lobby'}
                    value={currentRoom.settings.awayClubId}
                    onChange={(e) => handleHostSettingChange({ awayClubId: e.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    {CLUBS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Time
                  </label>
                  <select
                    disabled={
                      !isHost ||
                      currentRoom.status !== 'lobby' ||
                      currentRoom.settings.matchFormat === 'penalty_shootout'
                    }
                    value={currentRoom.settings.matchMinutes}
                    onChange={(e) =>
                      handleHostSettingChange({
                        matchMinutes: Number(e.target.value) as MatchMinutes,
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    {MATCH_TIMES.map((m) => (
                      <option key={m} value={m}>
                        {m} Minutes
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Size
                  </label>
                  <select
                    disabled={!isHost || currentRoom.status !== 'lobby'}
                    value={currentRoom.settings.matchSize}
                    onChange={(e) =>
                      handleHostSettingChange({ matchSize: e.target.value as MatchSize })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    {MATCH_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-500 uppercase">
                    Field
                  </label>
                  <select
                    disabled={!isHost || currentRoom.status !== 'lobby'}
                    value={currentRoom.settings.fieldSize}
                    onChange={(e) =>
                      handleHostSettingChange({ fieldSize: e.target.value as FieldSize })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-65"
                  >
                    {FIELD_SIZES.map((f) => (
                      <option key={f} value={f}>
                        {FIELD_DIMENSIONS[f].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Two Team Columns for Role Assignment (Outfield vs Dedicated GK) */}
            <div className="grid gap-4 sm:grid-cols-2">
              {(['home', 'away'] as TeamSide[]).map((teamSide) => {
                const club = getClubById(
                  teamSide === 'home'
                    ? currentRoom.settings.homeClubId
                    : currentRoom.settings.awayClubId,
                );
                const roster = currentRoom.players.filter((p) => p.team === teamSide);
                const perTeamLimit = MATCH_SIZE_COUNTS[currentRoom.settings.matchSize] ?? 5;
                const humanOutfieldCount = roster.filter((p) => p.role === 'outfield').length;
                const teamAiOutfieldSlots = Math.max(0, perTeamLimit - 1 - humanOutfieldCount);
                const totalTeamAiBots = Math.max(0, perTeamLimit - roster.length);
                const teamFullForNewJoiner =
                  meInRoom?.team !== teamSide && roster.length >= perTeamLimit;
                const gkTaken = roster.some(
                  (p) => p.role === 'goalkeeper' && p.clientId !== clientId,
                );

                return (
                  <div
                    key={teamSide}
                    className="rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-sm border border-white/25"
                          style={{ backgroundColor: club.primaryColor }}
                        />
                        <span className="text-sm font-extrabold text-white">
                          {teamSide === 'home' ? 'HOME' : 'AWAY'} · {club.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">
                        {roster.length} {roster.length === 1 ? 'Human' : 'Humans'}
                        {totalTeamAiBots > 0 ? ` · ${totalTeamAiBots} AI` : ' · Full'}
                      </span>
                    </div>

                    <div className="mb-3 flex gap-2">
                      <button
                        type="button"
                        disabled={teamFullForNewJoiner}
                        onClick={() => onSelectSlot(teamSide, 'outfield')}
                        className={`flex-1 rounded-lg border px-2.5 py-2 text-xs font-bold transition disabled:opacity-45 ${
                          meInRoom?.team === teamSide && meInRoom?.role === 'outfield'
                            ? 'border-sky-400 bg-sky-400/20 text-sky-200'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {teamFullForNewJoiner ? 'Team Full' : 'Join as Outfield'}
                      </button>
                      <button
                        type="button"
                        disabled={teamFullForNewJoiner || gkTaken}
                        onClick={() => onSelectSlot(teamSide, 'goalkeeper')}
                        className={`flex-1 rounded-lg border px-2.5 py-2 text-xs font-bold transition disabled:opacity-45 ${
                          meInRoom?.team === teamSide && meInRoom?.role === 'goalkeeper'
                            ? 'border-amber-400 bg-amber-400/20 text-amber-200'
                            : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        {gkTaken
                          ? 'GK Claimed'
                          : teamFullForNewJoiner
                            ? 'Team Full'
                            : 'Play as GK'}
                      </button>
                    </div>

                    <div className="space-y-2">
                      {roster.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-xs text-slate-500">
                          Full AI Squad ({perTeamLimit} AI Bots) — Odd &amp; asymmetric teams
                          supported
                        </div>
                      ) : (
                        roster.map((p) => {
                          const assignedCount = Math.min(
                            teamAiOutfieldSlots,
                            Math.max(0, p.aiControlCount ?? 0),
                          );
                          return (
                            <div
                              key={p.clientId}
                              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Shield
                                    className={`h-3.5 w-3.5 ${
                                      p.role === 'goalkeeper' ? 'text-amber-400' : 'text-sky-400'
                                    }`}
                                  />
                                  <span className="font-bold text-white">{p.playerName}</span>
                                  {p.isHost && (
                                    <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                      HOST
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[11px] text-slate-400 uppercase">
                                    {p.role === 'goalkeeper' ? 'GK' : 'Outfield'}
                                  </span>
                                  <span
                                    className={`font-bold ${
                                      p.ready ? 'text-emerald-400' : 'text-slate-500'
                                    }`}
                                  >
                                    {p.ready ? 'READY' : 'WAIT'}
                                  </span>
                                </div>
                              </div>

                              {isHost && currentRoom.status === 'lobby' && (
                                <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-1.5 text-[10px]">
                                  <span className="font-bold tracking-wider text-amber-300/90 uppercase">
                                    Host Override
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const otherTeam: TeamSide =
                                          teamSide === 'home' ? 'away' : 'home';
                                        onHostAssignPlayer(p.clientId, { team: otherTeam });
                                      }}
                                      className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-bold text-slate-200 hover:border-sky-400 hover:text-white"
                                    >
                                      {currentRoom.players.filter(
                                        (x) =>
                                          x.team === (teamSide === 'home' ? 'away' : 'home'),
                                      ).length >= perTeamLimit
                                        ? `Swap ↔ ${teamSide === 'home' ? 'Away' : 'Home'}`
                                        : teamSide === 'home'
                                          ? 'Move → Away'
                                          : '← Move Home'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onHostAssignPlayer(p.clientId, {
                                          role:
                                            p.role === 'goalkeeper' ? 'outfield' : 'goalkeeper',
                                        })
                                      }
                                      className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-bold text-amber-300 hover:border-amber-400"
                                    >
                                      {p.role === 'goalkeeper' ? 'Set Outfield' : 'Set GK'}
                                    </button>
                                  </div>
                                </div>
                              )}

                              {p.role === 'outfield' && teamAiOutfieldSlots > 0 && (
                                <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px]">
                                  <span className="text-slate-400">AI Co-Control on Pass</span>
                                  {isHost && currentRoom.status === 'lobby' ? (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        disabled={assignedCount <= 0}
                                        onClick={() =>
                                          onSetAiControl(
                                            p.clientId,
                                            Math.max(0, assignedCount - 1),
                                          )
                                        }
                                        className="flex h-5 w-5 items-center justify-center rounded border border-slate-700 bg-slate-800 font-bold text-white hover:border-amber-400 disabled:opacity-40"
                                      >
                                        -
                                      </button>
                                      <span className="min-w-[44px] text-center font-mono font-bold text-cyan-300">
                                        {assignedCount}/{teamAiOutfieldSlots} AI
                                      </span>
                                      <button
                                        type="button"
                                        disabled={assignedCount >= teamAiOutfieldSlots}
                                        onClick={() =>
                                          onSetAiControl(
                                            p.clientId,
                                            Math.min(teamAiOutfieldSlots, assignedCount + 1),
                                          )
                                        }
                                        className="flex h-5 w-5 items-center justify-center rounded border border-slate-700 bg-slate-800 font-bold text-white hover:border-amber-400 disabled:opacity-40"
                                      >
                                        +
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="font-mono font-bold text-cyan-300">
                                      {assignedCount} AI {assignedCount === 1 ? 'Slot' : 'Slots'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
              <button
                type="button"
                onClick={onLeaveRoom}
                className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
              >
                Leave Lobby
              </button>
              <button
                type="button"
                onClick={onToggleReady}
                className={`flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-extrabold transition ${
                  meInRoom?.ready
                    ? 'border border-emerald-400 bg-emerald-400/20 text-emerald-300'
                    : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                {meInRoom?.ready ? 'Ready (Click to Cancel)' : 'Click Ready for Kick-Off'}
              </button>
            </div>
          </div>
        ) : (
          /* Host or Join Menu */
          <div>
            <div className="mb-5 flex gap-2 rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => {
                  setTab('join');
                  onScanRooms();
                }}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                  tab === 'join' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Join Host Match
              </button>
              <button
                type="button"
                onClick={() => setTab('host')}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
                  tab === 'host' ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                Host LAN Match
              </button>
            </div>

            {tab === 'join' ? (
              <div className="space-y-4">
                {/* Team Preference & Quick Connect Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                    Offline Hotspot Code Exchange (WebRTC P2P)
                  </span>
                  <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px] font-bold">
                    <span className="px-1.5 text-slate-500">Prefer Team:</span>
                    {(['auto', 'home', 'away'] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setPreferredJoinTeam(choice)}
                        className={`rounded-md px-2 py-1 capitalize transition ${
                          preferredJoinTeam === choice
                            ? choice === 'home'
                              ? 'bg-sky-500 text-slate-950'
                              : choice === 'away'
                                ? 'bg-rose-500 text-white'
                                : 'bg-amber-400 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {choice === 'auto' ? 'Auto' : choice === 'home' ? 'Home' : 'Away'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 1: Paste Host Room Code */}
                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-xs font-extrabold text-amber-300 uppercase">
                      Step 1 · Paste Host&apos;s Room Code (PTS1:...)
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteOfferFromClipboard}
                      className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:border-sky-400 hover:text-white"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      Paste
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={offerInput}
                      onChange={(e) => setOfferInput(e.target.value)}
                      placeholder="Paste Host's PTS1:... connection code here"
                      className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 font-mono text-xs text-white placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      disabled={
                        !offerInput.trim() || signaling.joinerStatus === 'generating_answer'
                      }
                      onClick={handleGenerateJoinerAnswer}
                      className="shrink-0 rounded-xl bg-sky-400 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:bg-sky-300 disabled:opacity-45"
                    >
                      {signaling.joinerStatus === 'generating_answer'
                        ? 'Generating...'
                        : 'Generate Answer Code'}
                    </button>
                  </div>

                  {signaling.joinerError && (
                    <div className="mt-2.5 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs font-semibold text-rose-200">
                      {signaling.joinerError}
                    </div>
                  )}
                </div>

                {/* Step 2: Copy & Send Answer Code Back to Host */}
                {signaling.joinerAnswerCode && (
                  <div className="rounded-xl border border-emerald-500/45 bg-emerald-950/25 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-extrabold text-emerald-300 uppercase">
                          Step 2 · Send Answer Code Back to Host
                        </div>
                        <div className="text-[11px] text-slate-300">
                          Host: <span className="font-bold text-white">{signaling.joinerHostName}</span>{' '}
                          · Lobby #{signaling.joinerRoomId}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => getLanClientInstance(clientId)?.cancelJoinAttempt()}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={signaling.joinerAnswerCode}
                        onFocus={(e) => e.currentTarget.select()}
                        className="min-w-0 flex-1 rounded-xl border border-emerald-500/40 bg-slate-950 px-3 py-2.5 font-mono text-xs text-emerald-100 select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyJoinerAnswer}
                        className={`flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                          answerCopied
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                        }`}
                      >
                        {answerCopied ? (
                          <>
                            <Check className="h-4 w-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" />
                            Copy Answer
                          </>
                        )}
                      </button>
                    </div>

                    <p className="mt-2 text-xs font-semibold text-emerald-200">
                      {signaling.joinerStatus === 'connecting'
                        ? 'Connecting directly to Host device...'
                        : 'Waiting for Host to paste this PTSA code... You will enter the lobby automatically.'}
                    </p>
                  </div>
                )}

                {/* Same-Device Quick Discovery (bonus if multiple tabs open on same device) */}
                {rooms.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                        Same-Device Quick Connect ({rooms.length})
                      </span>
                      <button
                        type="button"
                        onClick={onScanRooms}
                        className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-200 hover:border-sky-400"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </button>
                    </div>
                    {rooms.map((room) => {
                      const home = getClubById(room.settings.homeClubId);
                      const away = getClubById(room.settings.awayClubId);
                      return (
                        <div
                          key={room.roomId}
                          className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-3"
                        >
                          <div>
                            <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                              <span>{room.hostName}&apos;s Match</span>
                              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-amber-300">
                                {room.settings.matchFormat === 'penalty_shootout'
                                  ? 'PENALTY SHOOTOUT'
                                  : `${room.settings.matchSize} · ${room.settings.matchMinutes}m`}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {home.name} vs {away.name} · {room.playerCount}/{room.maxPlayers}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onJoinRoom(
                                room.roomId,
                                preferredJoinTeam === 'auto' ? undefined : preferredJoinTeam,
                              )
                            }
                            className="rounded-xl bg-sky-400 px-4 py-2 text-xs font-extrabold text-slate-950 hover:bg-sky-300"
                          >
                            Connect
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Offline Hotspot Guide */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs text-slate-400">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="space-y-1">
                    <div className="font-bold text-slate-200">
                      How to Play 100% Offline over Wi-Fi Hotspot:
                    </div>
                    <p>
                      1. Turn on Mobile Wi-Fi Hotspot on one phone and connect the other phone(s)
                      to it (no mobile data or internet needed).
                    </p>
                    <p>
                      2. Host opens <span className="text-amber-300">Host LAN Match</span> and
                      copies the <span className="font-mono text-slate-200">PTS1</span> Room Code.
                    </p>
                    <p>
                      3. Joiner pastes it above, taps{' '}
                      <span className="text-sky-300">Generate Answer Code</span>, and sends the{' '}
                      <span className="font-mono text-slate-200">PTSA</span> code back to Host.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-sky-400 uppercase">
                      Team 1 (Home)
                    </label>
                    <select
                      value={hostSettings.homeClubId}
                      onChange={(e) => handleHostSettingChange({ homeClubId: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      {CLUBS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-rose-400 uppercase">
                      Team 2 (Away)
                    </label>
                    <select
                      value={hostSettings.awayClubId}
                      onChange={(e) => handleHostSettingChange({ awayClubId: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      {CLUBS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-400 uppercase">
                      Match Format
                    </label>
                    <select
                      value={hostSettings.matchFormat}
                      onChange={(e) =>
                        handleHostSettingChange({ matchFormat: e.target.value as MatchFormat })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      <option value="standard">
                        Standard Match (With Extra Time / Tiebreaker)
                      </option>
                      <option value="penalty_shootout">Penalty Shootout Only</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-400 uppercase">
                      Match Time
                    </label>
                    <select
                      disabled={hostSettings.matchFormat === 'penalty_shootout'}
                      value={hostSettings.matchMinutes}
                      onChange={(e) =>
                        handleHostSettingChange({
                          matchMinutes: Number(e.target.value) as MatchMinutes,
                        })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-45"
                    >
                      {MATCH_TIMES.map((m) => (
                        <option key={m} value={m}>
                          {m} Minutes
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-400 uppercase">
                      Player Quantity
                    </label>
                    <select
                      value={hostSettings.matchSize}
                      onChange={(e) =>
                        handleHostSettingChange({ matchSize: e.target.value as MatchSize })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      {MATCH_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-400 uppercase">
                      Field Size
                    </label>
                    <select
                      value={hostSettings.fieldSize}
                      onChange={(e) =>
                        handleHostSettingChange({ fieldSize: e.target.value as FieldSize })
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      {FIELD_SIZES.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_DIMENSIONS[f].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => onCreateRoom(hostSettings)}
                    className="rounded-xl bg-amber-400 px-6 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300"
                  >
                    Open Host Lobby ({profile.playerName})
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
