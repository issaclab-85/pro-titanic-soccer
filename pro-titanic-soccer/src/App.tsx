import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { AloneSetupModal } from './components/AloneSetupModal';
import { DrawDecisionModal } from './components/DrawDecisionModal';
import { HomeMenu } from './components/HomeMenu';
import { IntroSequence } from './components/IntroSequence';
import { LanMatchModal } from './components/LanMatchModal';
import { MatchHud } from './components/MatchHud';
import { PostMatchRecapModal } from './components/PostMatchRecapModal';
import { ProfileModal } from './components/ProfileModal';
import { ReplayTheaterHud } from './components/ReplayTheaterHud';
import { SettingsModal } from './components/SettingsModal';
import { createDefaultProfile } from './data/clubs';
import { TitanicSoccerEngine } from './game/engine';
import { soccerAudio } from './game/sound';
import { LanWebSocketClient } from './services/lanClient';
import type {
  AloneMatchConfig,
  DrawDecisionState,
  DrawVoteOption,
  GameScreen,
  GraphicsQuality,
  LanMatchSettings,
  LanRoomState,
  LanRoomSummary,
  MatchHudState,
  MatchRecapData,
  PlayerProfile,
  PlayerRole,
  ReplayPlaybackState,
  TeamSide,
} from './types/game';

const STORAGE_KEY = 'pro_titanic_soccer_profile_v1';
const QUALITY_STORAGE_KEY = 'pro_titanic_soccer_quality_v1';

function loadSavedQuality(): GraphicsQuality {
  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  } catch {
    // ignore storage failures
  }
  return 'medium';
}

function loadSavedProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerProfile;
      if (parsed && parsed.playerName && parsed.clubId) {
        return parsed;
      }
    }
  } catch {
    // ignore storage failures
  }
  return createDefaultProfile();
}

const INITIAL_HUD: MatchHudState = {
  homeScore: 0,
  awayScore: 0,
  timeRemainingSeconds: 240,
  totalSeconds: 240,
  homeClubName: 'HOM',
  awayClubName: 'AWY',
  homeColor: '#004D98',
  awayColor: '#F5F7FA',
  activePlayerName: 'PLAYER',
  activeRole: 'outfield',
  localTeam: 'home',
  stamina: 100,
  hasBall: false,
  teamHasBall: true,
  secondDefenderActive: false,
  canSwitchPlayer: false,
  kickoffTeam: 'home',
  goalBanner: null,
  lastActionHint: '',
  cameraOrbited: false,
  quickGlancing: false,
  highlightsCount: 0,
  shootout: null,
  setPiece: null,
  liveGoalReplay: null,
  preMatch: null,
  lanNotice: null,
  radar: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TitanicSoccerEngine | null>(null);
  const lanClientRef = useRef<LanWebSocketClient | null>(null);

  const [showIntro, setShowIntro] = useState(true);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadSavedProfile());
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() => loadSavedQuality());
  const [screen, setScreen] = useState<GameScreen>('home');
  const [hud, setHud] = useState<MatchHudState>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [ambienceEnabled, setAmbienceEnabled] = useState(true);

  // Modals
  const [showPlayModePicker, setShowPlayModePicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingLanAfterProfile, setPendingLanAfterProfile] = useState(false);
  const [showAloneModal, setShowAloneModal] = useState(false);
  const [showLanModal, setShowLanModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // LAN State
  const [lanConnected, setLanConnected] = useState(false);
  const [lanClientId, setLanClientId] = useState(profile.id);
  const [lanRooms, setLanRooms] = useState<LanRoomSummary[]>([]);
  const [currentRoom, setCurrentRoom] = useState<LanRoomState | null>(null);
  const [lanError, setLanError] = useState<string | null>(null);
  const [matchRecap, setMatchRecap] = useState<MatchRecapData | null>(null);
  const [replayState, setReplayState] = useState<ReplayPlaybackState | null>(null);
  const [drawDecision, setDrawDecision] = useState<DrawDecisionState | null>(null);

  const screenRef = useRef(screen);
  screenRef.current = screen;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const lanClientIdRef = useRef(lanClientId);
  lanClientIdRef.current = lanClientId;
  const currentRoomRef = useRef(currentRoom);
  currentRoomRef.current = currentRoom;

  // Initialize Three.js Engine & WebSocket Client once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const lan = new LanWebSocketClient(profileRef.current.id);
    lanClientRef.current = lan;

    const engine = new TitanicSoccerEngine(container, {
      onHudUpdate: (nextHud) => setHud(nextHud),
      onFullTime: (recap) => {
        setDrawDecision(null);
        setMatchRecap(recap);
        setReplayState(null);
        setScreen('fulltime');
        lan.sendMatchEnd();
      },
      onDrawAtFullTime: ({ homeScore, awayScore, extraTimeCount }) => {
        if (currentRoomRef.current) {
          lan.sendDrawPrompt(homeScore, awayScore, extraTimeCount);
        } else {
          setDrawDecision({
            active: true,
            homeScore,
            awayScore,
            votes: {},
            totalPlayers: 1,
            extraTimeCount,
          });
        }
      },
      onPauseRequested: () => {
        setScreen((prev) => {
          if (prev === 'playing') {
            engine.setPaused(true);
            return 'paused';
          }
          if (prev === 'paused') {
            engine.setPaused(false);
            return 'playing';
          }
          return prev;
        });
      },
      onReplayUpdate: (nextReplay) => {
        setReplayState(nextReplay);
      },
      onLanSnapshotEmit: (snapshot) => {
        lan.sendMatchSnapshot(snapshot);
      },
      onLanClientInputEmit: (input) => {
        lan.sendClientInput(input);
      },
    });

    engineRef.current = engine;
    engine.setGraphicsQuality(loadSavedQuality());
    engine.loadShowcase(profileRef.current);

    lan.setCallbacks({
      onWelcome: (id) => setLanClientId(id),
      onConnectionChange: (conn) => setLanConnected(conn),
      onRoomsList: (list) => setLanRooms(list),
      onRoomState: (room) => {
        setCurrentRoom(room);
        setLanError(null);
      },
      onRoomError: (msg) => setLanError(msg),
      onMatchStart: (room, _kickoff, rejoin) => {
        setShowLanModal(false);
        setShowPlayModePicker(false);
        setMatchRecap(null);
        setReplayState(null);
        setDrawDecision(null);
        setScreen('playing');
        engine.startLanMatch(room, lanClientIdRef.current, Boolean(rejoin));
      },
      onHostMigrated: (hostClientId, room) => {
        setCurrentRoom(room);
        if (hostClientId === lanClientIdRef.current) {
          engine.promoteToLanHost(room, lanClientIdRef.current);
        }
      },
      onPreMatchSkip: () => {
        engine.skipPreMatchCutscene();
      },
      onMatchSnapshot: (snapshot) => {
        engine.applyRemoteSnapshot(snapshot);
      },
      onClientInput: (clientId, input) => {
        engine.applyRemoteClientInput(clientId, input);
      },
      onDrawState: (state) => {
        engine.setPaused(true);
        setDrawDecision(state);
      },
      onDrawResolution: (decision) => {
        setDrawDecision(null);
        if (decision === 'more_time') {
          engine.startExtraTime(120);
        } else {
          const room = currentRoomRef.current;
          const me = room?.players.find((p) => p.clientId === lanClientIdRef.current);
          engine.startPenaltyShootout(me?.role ?? 'outfield');
        }
      },
      onMatchEnd: () => {
        setDrawDecision(null);
        engine.finishLanClientMatch();
      },
    });
    lan.connect();

    return () => {
      lan.disconnect();
      engine.dispose();
      engineRef.current = null;
      lanClientRef.current = null;
    };
  }, []);

  const handleSaveProfile = useCallback(
    (updated: PlayerProfile) => {
      setProfile(updated);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // ignore storage failures
      }
      setShowProfileModal(false);

      if (screenRef.current === 'home') {
        engineRef.current?.loadShowcase(updated);
      }

      if (pendingLanAfterProfile) {
        setPendingLanAfterProfile(false);
        setLanError(null);
        setShowLanModal(true);
        lanClientRef.current?.scanRooms();
      }
    },
    [pendingLanAfterProfile],
  );

  const handleOpenLanMatch = useCallback(() => {
    if (!profile.profileConfirmed) {
      setPendingLanAfterProfile(true);
      setShowProfileModal(true);
      return;
    }
    setLanError(null);
    setShowLanModal(true);
    lanClientRef.current?.scanRooms();
  }, [profile.profileConfirmed]);

  const handleStartAloneMatch = useCallback(
    (config: AloneMatchConfig) => {
      setShowAloneModal(false);
      setShowPlayModePicker(false);
      setMatchRecap(null);
      setReplayState(null);
      setScreen('playing');
      engineRef.current?.startAloneMatch(config, profile);
    },
    [profile],
  );

  const handleDrawVote = useCallback(
    (choice: DrawVoteOption) => {
      if (currentRoom) {
        lanClientRef.current?.sendDrawVote(choice);
        return;
      }
      setDrawDecision(null);
      if (choice === 'more_time') {
        engineRef.current?.startExtraTime(120);
      } else {
        engineRef.current?.startPenaltyShootout(hud.activeRole);
      }
    },
    [currentRoom, hud.activeRole],
  );

  const handleReturnHome = useCallback(() => {
    engineRef.current?.stopHighlightReplay();
    engineRef.current?.setPaused(false);
    lanClientRef.current?.leaveRoom();
    setCurrentRoom(null);
    setMatchRecap(null);
    setReplayState(null);
    setDrawDecision(null);
    setScreen('home');
    setShowPlayModePicker(false);
    engineRef.current?.loadShowcase(profileRef.current);
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soccerAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleMusic = useCallback(() => {
    setMusicEnabled((prev) => {
      const next = !prev;
      soccerAudio.setMusicEnabled(next);
      return next;
    });
  }, []);

  const handleToggleAmbience = useCallback(() => {
    setAmbienceEnabled((prev) => {
      const next = !prev;
      soccerAudio.setAmbienceEnabled(next);
      return next;
    });
  }, []);

  const handleChangeQuality = useCallback((quality: GraphicsQuality) => {
    setGraphicsQuality(quality);
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, quality);
    } catch {
      // ignore storage failures
    }
    engineRef.current?.setGraphicsQuality(quality);
  }, []);

  const isLanHostOrOffline =
    !currentRoom || currentRoom.players.some((p) => p.clientId === lanClientId && p.isHost);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 select-none">
      {/* Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="fixed inset-0 h-full w-full" />

      {/* 3-Step Cinematic Startup Intro & Loading Sequence */}
      {showIntro && <IntroSequence onComplete={() => setShowIntro(false)} />}

      {/* Home Screen */}
      {!showIntro && screen === 'home' && (
        <HomeMenu
          profile={profile}
          showPlayModePicker={showPlayModePicker}
          onTogglePlayModePicker={setShowPlayModePicker}
          onOpenAloneSetup={() => setShowAloneModal(true)}
          onOpenLanMatch={handleOpenLanMatch}
          onOpenProfile={() => {
            setPendingLanAfterProfile(false);
            setShowProfileModal(true);
          }}
          onOpenSettings={() => setShowSettingsModal(true)}
          onToggleBackView={() => engineRef.current?.toggleShowcaseBackView()}
          onQuit={() => setScreen('quit')}
        />
      )}

      {/* Active Gameplay HUD */}
      {screen === 'playing' && !drawDecision?.active && (
        <MatchHud
          hud={hud}
          muted={muted}
          canSkipCutscenes={isLanHostOrOffline}
          onToggleMute={handleToggleMute}
          onPause={() => {
            engineRef.current?.setPaused(true);
            setScreen('paused');
          }}
          onSkipReplay={() => {
            if (isLanHostOrOffline) {
              engineRef.current?.skipLiveGoalReplay();
            }
          }}
          onSkipPreMatch={() => {
            if (isLanHostOrOffline) {
              engineRef.current?.skipPreMatchCutscene();
            }
          }}
          onVirtualAxis={(x, z) => engineRef.current?.setVirtualAxis(x, z)}
          onVirtualSprint={(active) => engineRef.current?.setVirtualSprint(active)}
          onVirtualAction={(action) => engineRef.current?.triggerVirtualAction(action)}
          onSwitchPlayer={() => engineRef.current?.switchActivePlayer()}
          onQuickGlance={(active) => engineRef.current?.setQuickGlance(active)}
          onResetCamera={() => engineRef.current?.resetCameraOrbit()}
        />
      )}

      {/* Draw Match Extension / Tiebreaker Modal */}
      {screen === 'playing' && drawDecision?.active && (
        <DrawDecisionModal
          drawState={drawDecision}
          homeClubName={hud.homeClubName}
          awayClubName={hud.awayClubName}
          isLan={Boolean(currentRoom)}
          localClientId={lanClientId}
          room={currentRoom}
          onVote={handleDrawVote}
        />
      )}

      {/* Pause Modal */}
      {screen === 'paused' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/78 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center shadow-2xl">
            <h2 className="text-2xl font-black text-white">MATCH PAUSED</h2>
            <p className="mt-1 text-xs text-slate-400">
              {hud.homeClubName} {hud.homeScore} – {hud.awayScore} {hud.awayClubName}
            </p>
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  engineRef.current?.setPaused(false);
                  setScreen('playing');
                }}
                className="w-full rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300"
              >
                Resume Match
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 text-sm font-bold text-slate-200 hover:border-sky-400/70 hover:bg-slate-800"
              >
                Graphics &amp; Audio Settings
              </button>
              <button
                type="button"
                onClick={handleReturnHome}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800"
              >
                Exit to Home Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Time Post-Match Recap & Highlights Modal */}
      {screen === 'fulltime' && matchRecap && !replayState && (
        <PostMatchRecapModal
          recap={matchRecap}
          onWatchReplay={(highlightId) => engineRef.current?.startHighlightReplay(highlightId)}
          onReturnHome={handleReturnHome}
        />
      )}

      {/* 3D Highlight Replay Theater HUD */}
      {screen === 'fulltime' && matchRecap && replayState && (
        <ReplayTheaterHud
          replay={replayState}
          highlights={matchRecap.highlights}
          onTogglePlay={() => engineRef.current?.setReplayPlaying(!replayState.playing)}
          onChangeSpeed={(speed) => engineRef.current?.setReplaySpeed(speed)}
          onChangeAngle={(angle) => engineRef.current?.setReplayCameraAngle(angle)}
          onSeek={(t) => engineRef.current?.seekReplay(t)}
          onSelectClip={(highlightId) => engineRef.current?.startHighlightReplay(highlightId)}
          onExitReplay={() => engineRef.current?.stopHighlightReplay()}
        />
      )}

      {/* Quit / Standby Screen */}
      {screen === 'quit' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/88 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-7 text-center shadow-2xl">
            <h2 className="text-xl font-black text-white">PRO TITANIC SOCCER</h2>
            <p className="mt-1.5 text-xs text-slate-400">
              Session ended cleanly. Ready to take the pitch again whenever you are.
            </p>
            <button
              type="button"
              onClick={handleReturnHome}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3 text-sm font-extrabold text-slate-950 hover:bg-amber-300"
            >
              <RotateCcw className="h-4 w-4" />
              Return to Stadium Menu
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {showProfileModal && (
        <ProfileModal
          profile={profile}
          requireForLan={pendingLanAfterProfile}
          onSave={handleSaveProfile}
          onClose={() => {
            setShowProfileModal(false);
            setPendingLanAfterProfile(false);
          }}
        />
      )}

      {showAloneModal && (
        <AloneSetupModal
          defaultClubId={profile.clubId}
          onStart={handleStartAloneMatch}
          onClose={() => setShowAloneModal(false)}
        />
      )}

      {showLanModal && (
        <LanMatchModal
          profile={profile}
          clientId={lanClientId}
          connected={lanConnected}
          rooms={lanRooms}
          currentRoom={currentRoom}
          errorMessage={lanError}
          onScanRooms={() => lanClientRef.current?.scanRooms()}
          onCreateRoom={(settings: LanMatchSettings) =>
            lanClientRef.current?.createRoom(profile, settings)
          }
          onJoinRoom={(roomId: string, preferredTeam?: TeamSide) =>
            lanClientRef.current?.joinRoom(roomId, profile, preferredTeam)
          }
          onLeaveRoom={() => lanClientRef.current?.leaveRoom()}
          onUpdateSettings={(settings: LanMatchSettings) =>
            lanClientRef.current?.updateSettings(settings)
          }
          onSelectSlot={(team: TeamSide, role: PlayerRole) =>
            lanClientRef.current?.selectSlot(team, role)
          }
          onHostAssignPlayer={(
            targetClientId: string,
            assignment: { team?: TeamSide; role?: PlayerRole },
          ) => lanClientRef.current?.hostAssignPlayer(targetClientId, assignment)}
          onSetAiControl={(targetClientId: string, aiControlCount: number) =>
            lanClientRef.current?.setAiControl(targetClientId, aiControlCount)
          }
          onToggleReady={() => lanClientRef.current?.toggleReady()}
          onClose={() => setShowLanModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          graphicsQuality={graphicsQuality}
          muted={muted}
          musicEnabled={musicEnabled}
          ambienceEnabled={ambienceEnabled}
          onChangeQuality={handleChangeQuality}
          onToggleMute={handleToggleMute}
          onToggleMusic={handleToggleMusic}
          onToggleAmbience={handleToggleAmbience}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
