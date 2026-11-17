import {
  MATCH_SIZE_COUNTS,
  type ClientMatchInput,
  type DrawDecisionState,
  type DrawVoteOption,
  type LanLobbyPlayer,
  type LanMatchSettings,
  type LanRoomState,
  type LanRoomSummary,
  type MatchSize,
  type PlayerProfile,
  type PlayerRole,
  type SyncedMatchSnapshot,
  type TeamSide,
} from '../types/game';

export interface LanClientCallbacks {
  onWelcome?: (clientId: string) => void;
  onRoomsList?: (rooms: LanRoomSummary[]) => void;
  onRoomState?: (room: LanRoomState | null) => void;
  onRoomError?: (message: string) => void;
  onMatchStart?: (room: LanRoomState, kickoffTeam: TeamSide, rejoin?: boolean) => void;
  onHostMigrated?: (hostClientId: string, room: LanRoomState) => void;
  onPreMatchSkip?: () => void;
  onMatchSnapshot?: (snapshot: SyncedMatchSnapshot) => void;
  onClientInput?: (clientId: string, input: ClientMatchInput) => void;
  onDrawState?: (state: DrawDecisionState) => void;
  onDrawResolution?: (decision: DrawVoteOption) => void;
  onMatchEnd?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface P2PSignalingState {
  hostOfferCode: string | null;
  hostOfferGenerating: boolean;
  hostOfferError: string | null;
  connectedPeerCount: number;
  joinerStatus:
    | 'idle'
    | 'generating_answer'
    | 'awaiting_host'
    | 'connecting'
    | 'connected'
    | 'error';
  joinerAnswerCode: string | null;
  joinerHostName: string | null;
  joinerRoomId: string | null;
  joinerError: string | null;
}

interface SignalPacket {
  v: 1;
  t: 'O' | 'A';
  o: string; // offerId
  r: string; // roomId
  c: string; // sender clientId
  n: string; // sender display name
  s: string; // SDP string
}

interface PendingHostPeer {
  offerId: string;
  pc: RTCPeerConnection;
  ctrlChannel: RTCDataChannel | null;
  syncChannel: RTCDataChannel | null;
  offerCode: string;
  createdAt: number;
}

interface ActiveHostPeer {
  peerId: string;
  transport: 'webrtc' | 'bc';
  pc?: RTCPeerConnection;
  ctrlChannel?: RTCDataChannel | null;
  syncChannel?: RTCDataChannel | null;
  joinedClientId?: string;
}

interface HostRoomInternal extends LanRoomState {
  countdownTimer?: number | null;
  drawPending: boolean;
  drawVotes: Record<string, DrawVoteOption>;
  drawHomeScore: number;
  drawAwayScore: number;
  drawExtraTimeCount: number;
}

const MAX_LAN_PLAYERS = 12;
const BROADCAST_CHANNEL_NAME = 'pro_titanic_soccer_hotspot_v1';

const activeClientsById = new Map<string, LanWebSocketClient>();
let latestClientInstance: LanWebSocketClient | null = null;

export function getLanClientInstance(clientId?: string): LanWebSocketClient | null {
  if (clientId && activeClientsById.has(clientId)) {
    return activeClientsById.get(clientId) ?? null;
  }
  return latestClientInstance;
}

function getPlayersPerTeam(matchSize: MatchSize | undefined): number {
  return MATCH_SIZE_COUNTS[matchSize || '5v5'] ?? 5;
}

function getRoomMaxPlayers(matchSize: MatchSize | undefined): number {
  return Math.min(MAX_LAN_PLAYERS, getPlayersPerTeam(matchSize) * 2);
}

function toPublicRoomState(room: HostRoomInternal): LanRoomState {
  return {
    roomId: room.roomId,
    hostName: room.hostName,
    settings: { ...room.settings },
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players: room.players.map((p) => ({ ...p })),
    kickoffTeam: room.kickoffTeam,
    countdownSeconds: room.countdownSeconds,
  };
}

function toRoomSummary(room: HostRoomInternal): LanRoomSummary {
  return {
    roomId: room.roomId,
    hostName: room.hostName,
    settings: { ...room.settings },
    playerCount: room.players.length,
    maxPlayers: room.maxPlayers,
    status: room.status,
  };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const normalized = padded + '='.repeat(padLen);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encodeSignalPacket(packet: SignalPacket): Promise<string> {
  const json = JSON.stringify(packet);
  const utf8 = new TextEncoder().encode(json);
  const prefix = packet.t === 'O' ? 'PTS1:' : 'PTSA:';

  if (typeof CompressionStream !== 'undefined') {
    try {
      const stream = new Blob([utf8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return `${prefix}${bytesToBase64Url(new Uint8Array(buf))}`;
    } catch {
      // Fall back to uncompressed base64url if deflate-raw fails on device WebView
    }
  }

  return `PTS0:${bytesToBase64Url(utf8)}`;
}

async function decodeSignalPacket(rawCode: string): Promise<SignalPacket> {
  const cleaned = rawCode.replace(/\s+/g, '').trim();
  if (!cleaned) {
    throw new Error('Connection code is empty.');
  }

  let mode: 'deflate' | 'raw';
  let body: string;

  if (cleaned.startsWith('PTS1:') || cleaned.startsWith('PTSA:')) {
    mode = 'deflate';
    body = cleaned.slice(5);
  } else if (cleaned.startsWith('PTS0:')) {
    mode = 'raw';
    body = cleaned.slice(5);
  } else {
    throw new Error('Invalid code format. Expected a Pro Titanic Soccer code (PTS1:... or PTSA:...).');
  }

  if (!body) {
    throw new Error('Incomplete connection code.');
  }

  const bytes = base64UrlToBytes(body);
  let jsonText: string;

  if (mode === 'deflate') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This device WebView cannot decompress PTS1 codes.');
    }
    const copy = new Uint8Array(bytes.length);
    copy.set(bytes);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    jsonText = new TextDecoder().decode(buf);
  } else {
    jsonText = new TextDecoder().decode(bytes);
  }

  const parsed = JSON.parse(jsonText) as SignalPacket;
  if (!parsed || parsed.v !== 1 || !parsed.s || !parsed.o || (parsed.t !== 'O' && parsed.t !== 'A')) {
    throw new Error('Corrupted or incompatible connection code.');
  }
  return parsed;
}

export class LanWebSocketClient {
  private callbacks: LanClientCallbacks = {};
  private clientId: string;
  private isConnected = false;

  // Authoritative role in current session
  private roleMode: 'none' | 'host' | 'client' = 'none';

  // Host-side authoritative room & peers
  private hostRoom: HostRoomInternal | null = null;
  private pendingHostPeers = new Map<string, PendingHostPeer>();
  private hostPeers = new Map<string, ActiveHostPeer>();
  private currentOfferId: string | null = null;

  // Joiner-side WebRTC or BroadcastChannel connection to Host
  private joinerPc: RTCPeerConnection | null = null;
  private joinerCtrlChannel: RTCDataChannel | null = null;
  private joinerSyncChannel: RTCDataChannel | null = null;
  private joinerProfile: {
    playerName: string;
    jerseyText: string;
    jerseyNumber: number;
    avatar: PlayerProfile['avatar'];
  } | null = null;
  private joinerPreferredTeam: TeamSide | undefined;
  private joinerBcRoomId: string | null = null;

  // Same-device BroadcastChannel discovery (zero-backend bonus on same device/browser)
  private bc: BroadcastChannel | null = null;
  private discoveredRooms = new Map<string, { summary: LanRoomSummary; expiresAt: number }>();
  private bcAnnounceTimer: number | null = null;

  // UI listeners for WebRTC offer/answer code workflow
  private signalingListeners = new Set<(state: P2PSignalingState) => void>();
  private signalingState: P2PSignalingState = {
    hostOfferCode: null,
    hostOfferGenerating: false,
    hostOfferError: null,
    connectedPeerCount: 0,
    joinerStatus: 'idle',
    joinerAnswerCode: null,
    joinerHostName: null,
    joinerRoomId: null,
    joinerError: null,
  };

  constructor(clientId: string) {
    this.clientId = clientId;
    activeClientsById.set(clientId, this);
    latestClientInstance = this;
  }

  public setCallbacks(callbacks: LanClientCallbacks) {
    this.callbacks = callbacks;
  }

  public getSignalingState(): P2PSignalingState {
    return { ...this.signalingState };
  }

  public subscribeSignaling(listener: (state: P2PSignalingState) => void): () => void {
    this.signalingListeners.add(listener);
    listener({ ...this.signalingState });
    return () => {
      this.signalingListeners.delete(listener);
    };
  }

  private updateSignaling(patch: Partial<P2PSignalingState>) {
    this.signalingState = {
      ...this.signalingState,
      ...patch,
      connectedPeerCount: this.hostPeers.size,
    };
    const snapshot = { ...this.signalingState };
    this.signalingListeners.forEach((fn) => fn(snapshot));
  }

  public connect() {
    if (this.isConnected) return;
    this.isConnected = true;

    activeClientsById.set(this.clientId, this);
    latestClientInstance = this;

    // Open same-device BroadcastChannel if available (safe no-op across separate phones)
    try {
      if (typeof BroadcastChannel !== 'undefined' && !this.bc) {
        this.bc = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.bc.onmessage = (ev) => this.handleBroadcastMessage(ev.data);
      }
    } catch {
      this.bc = null;
    }

    if (this.bcAnnounceTimer === null) {
      this.bcAnnounceTimer = window.setInterval(() => {
        const now = Date.now();
        let changed = false;
        this.discoveredRooms.forEach((entry, id) => {
          if (entry.expiresAt <= now) {
            this.discoveredRooms.delete(id);
            changed = true;
          }
        });
        if (changed) {
          this.emitDiscoveredRooms();
        }
        if (this.roleMode === 'host' && this.hostRoom && this.hostRoom.status === 'lobby') {
          this.postBroadcast({
            type: 'bc:announce',
            hostClientId: this.clientId,
            summary: toRoomSummary(this.hostRoom),
          });
        }
      }, 1500);
    }

    this.callbacks.onWelcome?.(this.clientId);
    this.callbacks.onConnectionChange?.(true);
    this.scanRooms();
  }

  public disconnect() {
    this.leaveRoom();
    this.isConnected = false;
    if (this.bcAnnounceTimer !== null) {
      clearInterval(this.bcAnnounceTimer);
      this.bcAnnounceTimer = null;
    }
    try {
      this.bc?.close();
    } catch {
      // ignore
    }
    this.bc = null;
    this.callbacks.onConnectionChange?.(false);
    if (activeClientsById.get(this.clientId) === this) {
      activeClientsById.delete(this.clientId);
    }
    if (latestClientInstance === this) {
      latestClientInstance = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Same-device BroadcastChannel helpers (optional convenience on same device)
  // ---------------------------------------------------------------------------
  private postBroadcast(payload: unknown) {
    if (!this.bc) return;
    try {
      this.bc.postMessage(payload);
    } catch {
      // ignore
    }
  }

  private emitDiscoveredRooms() {
    const list: LanRoomSummary[] = [];
    this.discoveredRooms.forEach((entry) => {
      if (entry.summary.status === 'lobby') {
        list.push(entry.summary);
      }
    });
    this.callbacks.onRoomsList?.(list);
  }

  private handleBroadcastMessage(raw: unknown) {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as Record<string, unknown>;
    const type = String(msg.type ?? '');

    if (type === 'bc:scan') {
      if (this.roleMode === 'host' && this.hostRoom && this.hostRoom.status === 'lobby') {
        this.postBroadcast({
          type: 'bc:announce',
          hostClientId: this.clientId,
          summary: toRoomSummary(this.hostRoom),
        });
      }
      return;
    }

    if (type === 'bc:announce') {
      if (msg.hostClientId === this.clientId) return;
      const summary = msg.summary as LanRoomSummary | undefined;
      if (!summary || !summary.roomId) return;
      if (summary.status === 'lobby') {
        this.discoveredRooms.set(summary.roomId, {
          summary,
          expiresAt: Date.now() + 3500,
        });
      } else {
        this.discoveredRooms.delete(summary.roomId);
      }
      this.emitDiscoveredRooms();
      return;
    }

    if (type === 'bc:close_room' && typeof msg.roomId === 'string') {
      this.discoveredRooms.delete(msg.roomId);
      this.emitDiscoveredRooms();
      if (this.roleMode === 'client' && this.joinerBcRoomId === msg.roomId) {
        this.cleanupJoinerConnections();
        this.roleMode = 'none';
        this.callbacks.onRoomError?.('Host closed the lobby.');
        this.callbacks.onRoomState?.(null);
      }
      return;
    }

    if (type === 'bc:to_host') {
      if (this.roleMode !== 'host' || !this.hostRoom) return;
      if (msg.roomId !== this.hostRoom.roomId) return;
      const fromClientId = String(msg.fromClientId ?? '');
      if (!fromClientId || fromClientId === this.clientId) return;
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!payload) return;

      if (payload.type === 'room:join' && !this.hostPeers.has(fromClientId)) {
        this.hostPeers.set(fromClientId, {
          peerId: fromClientId,
          transport: 'bc',
          joinedClientId: fromClientId,
        });
        this.updateSignaling({});
      }
      this.handleHostInboundMessage(fromClientId, payload);
      return;
    }

    if (type === 'bc:to_client') {
      if (this.roleMode !== 'client' || !this.joinerBcRoomId) return;
      if (msg.roomId !== this.joinerBcRoomId) return;
      const target = msg.targetClientId ? String(msg.targetClientId) : null;
      if (target && target !== this.clientId) return;
      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!payload) return;
      this.handleClientInboundMessage(payload);
    }
  }

  // ---------------------------------------------------------------------------
  // WebRTC Offline Hotspot Signaling (Offer / Answer Code Generation)
  // ---------------------------------------------------------------------------
  private waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      let hasCandidate = false;
      let softTimer: number | null = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (softTimer !== null) clearTimeout(softTimer);
        clearTimeout(hardTimer);
        pc.removeEventListener('icegatheringstatechange', onState);
        pc.removeEventListener('icecandidate', onCand);
        resolve();
      };

      const onState = () => {
        if (pc.iceGatheringState === 'complete') {
          finish();
        }
      };

      const onCand = (ev: RTCPeerConnectionIceEvent) => {
        if (!ev.candidate) {
          finish();
          return;
        }
        if (!hasCandidate) {
          hasCandidate = true;
          // Short grace period so all local hotspot host interfaces gather
          softTimer = window.setTimeout(finish, 350);
        }
      };

      const hardTimer = window.setTimeout(finish, 1800);
      pc.addEventListener('icegatheringstatechange', onState);
      pc.addEventListener('icecandidate', onCand);
    });
  }

  public async createHostInviteOffer(): Promise<string | null> {
    if (this.roleMode !== 'host' || !this.hostRoom) return null;
    if (typeof RTCPeerConnection === 'undefined') {
      this.updateSignaling({
        hostOfferGenerating: false,
        hostOfferError: 'WebRTC is unavailable in this browser/WebView.',
      });
      return null;
    }

    const offerId = `of_${Math.random().toString(36).slice(2, 8)}`;
    this.currentOfferId = offerId;
    this.updateSignaling({
      hostOfferGenerating: true,
      hostOfferError: null,
    });

    try {
      // Close any old untouched pending offers to avoid leaking peer connections
      if (this.pendingHostPeers.size >= 4) {
        const oldestKey = this.pendingHostPeers.keys().next().value;
        if (oldestKey) {
          const old = this.pendingHostPeers.get(oldestKey);
          old?.pc.close();
          this.pendingHostPeers.delete(oldestKey);
        }
      }

      const pc = new RTCPeerConnection({ iceServers: [] });
      const ctrlChannel = pc.createDataChannel('pts-ctrl', { ordered: true });
      const syncChannel = pc.createDataChannel('pts-sync', {
        ordered: false,
        maxRetransmits: 0,
      });

      const pending: PendingHostPeer = {
        offerId,
        pc,
        ctrlChannel,
        syncChannel,
        offerCode: '',
        createdAt: Date.now(),
      };
      this.pendingHostPeers.set(offerId, pending);
      this.attachHostPeerChannelHandlers(offerId, pc, ctrlChannel, syncChannel);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGathering(pc);

      // Guard against leaving room while async ICE gathering ran
      if (this.roleMode !== 'host' || !this.hostRoom || !this.pendingHostPeers.has(offerId)) {
        pc.close();
        return null;
      }

      const localSdp = pc.localDescription?.sdp;
      if (!localSdp) {
        throw new Error('Failed to generate local WebRTC offer SDP.');
      }

      const code = await encodeSignalPacket({
        v: 1,
        t: 'O',
        o: offerId,
        r: this.hostRoom.roomId,
        c: this.clientId,
        n: this.hostRoom.hostName,
        s: localSdp,
      });

      pending.offerCode = code;
      if (this.currentOfferId === offerId) {
        this.updateSignaling({
          hostOfferCode: code,
          hostOfferGenerating: false,
          hostOfferError: null,
        });
      }
      return code;
    } catch (err) {
      this.pendingHostPeers.delete(offerId);
      const message = err instanceof Error ? err.message : 'Failed to create Hotspot invite code.';
      this.updateSignaling({
        hostOfferGenerating: false,
        hostOfferError: message,
      });
      return null;
    }
  }

  private attachHostPeerChannelHandlers(
    peerId: string,
    pc: RTCPeerConnection,
    ctrlChannel: RTCDataChannel,
    syncChannel: RTCDataChannel,
  ) {
    const promotePeer = () => {
      if (this.roleMode !== 'host' || !this.hostRoom) return;
      if (!this.hostPeers.has(peerId)) {
        this.pendingHostPeers.delete(peerId);
        this.hostPeers.set(peerId, {
          peerId,
          transport: 'webrtc',
          pc,
          ctrlChannel,
          syncChannel,
        });
        this.updateSignaling({});
        if (this.hostRoom.players.length < this.hostRoom.maxPlayers && this.currentOfferId === peerId) {
          void this.createHostInviteOffer();
        }
      }
    };

    const handleDisconnect = () => {
      this.pendingHostPeers.delete(peerId);
      const peer = this.hostPeers.get(peerId);
      if (!peer) return;
      this.hostPeers.delete(peerId);
      if (peer.joinedClientId) {
        this.removePlayerFromHostRoom(peer.joinedClientId);
      }
      this.updateSignaling({});
    };

    ctrlChannel.onopen = () => {
      promotePeer();
    };

    ctrlChannel.onmessage = (ev) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const peer = this.hostPeers.get(peerId);
      const senderId = peer?.joinedClientId || String(parsed.clientId || peerId);
      if (peer && !peer.joinedClientId && typeof parsed.clientId === 'string') {
        peer.joinedClientId = parsed.clientId;
      }
      this.handleHostInboundMessage(senderId, parsed, peerId);
    };

    syncChannel.onmessage = (ev) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      const peer = this.hostPeers.get(peerId);
      const senderId = peer?.joinedClientId || String(parsed.clientId || peerId);
      this.handleHostInboundMessage(senderId, parsed, peerId);
    };

    ctrlChannel.onclose = handleDisconnect;
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        handleDisconnect();
      }
    };
  }

  public async acceptJoinerAnswer(rawAnswerCode: string): Promise<{ ok: boolean; error?: string }> {
    if (this.roleMode !== 'host' || !this.hostRoom) {
      return { ok: false, error: 'Create a Host Lobby first before accepting a player.' };
    }
    if (this.hostRoom.status !== 'lobby') {
      return { ok: false, error: 'Match has already started.' };
    }
    if (this.hostRoom.players.length >= this.hostRoom.maxPlayers) {
      return { ok: false, error: `Lobby is full (max ${this.hostRoom.maxPlayers} players).` };
    }

    try {
      const packet = await decodeSignalPacket(rawAnswerCode);
      if (packet.t !== 'A') {
        return {
          ok: false,
          error: 'That looks like a Host Room Code (PTS1). Paste the Joiner Answer Code (PTSA) instead.',
        };
      }

      const pending =
        this.pendingHostPeers.get(packet.o) ||
        (this.currentOfferId ? this.pendingHostPeers.get(this.currentOfferId) : undefined);

      if (!pending) {
        return {
          ok: false,
          error: 'Matching invite slot not found or expired. Generate a New Code and have the joiner retry.',
        };
      }

      if (pending.pc.signalingState !== 'have-local-offer') {
        return {
          ok: false,
          error: 'This invite code was already used. Tap New Code for the next player.',
        };
      }

      await pending.pc.setRemoteDescription({ type: 'answer', sdp: packet.s });
      this.updateSignaling({ hostOfferError: null });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid Answer Code.';
      this.updateSignaling({ hostOfferError: message });
      return { ok: false, error: message };
    }
  }

  public async joinWithOfferCode(
    rawOfferCode: string,
    profile: PlayerProfile,
    preferredTeam?: TeamSide,
  ): Promise<{ ok: boolean; answerCode?: string; error?: string }> {
    if (typeof RTCPeerConnection === 'undefined') {
      const msg = 'WebRTC is unavailable in this browser/WebView.';
      this.updateSignaling({ joinerStatus: 'error', joinerError: msg });
      return { ok: false, error: msg };
    }

    this.cleanupJoinerConnections();
    this.roleMode = 'none';
    this.joinerProfile = {
      playerName: profile.playerName,
      jerseyText: profile.jerseyText,
      jerseyNumber: profile.jerseyNumber,
      avatar: profile.avatar,
    };
    this.joinerPreferredTeam = preferredTeam;

    this.updateSignaling({
      joinerStatus: 'generating_answer',
      joinerAnswerCode: null,
      joinerError: null,
      joinerHostName: null,
      joinerRoomId: null,
    });

    try {
      const packet = await decodeSignalPacket(rawOfferCode);
      if (packet.t !== 'O') {
        throw new Error('That looks like an Answer Code (PTSA). Paste the Host Room Code (PTS1) here.');
      }

      const pc = new RTCPeerConnection({ iceServers: [] });
      this.joinerPc = pc;

      pc.ondatachannel = (ev) => {
        const ch = ev.channel;
        if (ch.label === 'pts-sync') {
          this.joinerSyncChannel = ch;
          ch.onmessage = (msgEv) => {
            try {
              const parsed = JSON.parse(String(msgEv.data)) as Record<string, unknown>;
              this.handleClientInboundMessage(parsed);
            } catch {
              // ignore malformed packet
            }
          };
          return;
        }

        this.joinerCtrlChannel = ch;
        ch.onopen = () => {
          this.roleMode = 'client';
          this.updateSignaling({ joinerStatus: 'connected', joinerError: null });
          this.sendToHostReliable({
            type: 'room:join',
            clientId: this.clientId,
            preferredTeam: this.joinerPreferredTeam,
            profile: this.joinerProfile,
          });
        };
        ch.onmessage = (msgEv) => {
          try {
            const parsed = JSON.parse(String(msgEv.data)) as Record<string, unknown>;
            this.handleClientInboundMessage(parsed);
          } catch {
            // ignore
          }
        };
        ch.onclose = () => {
          if (this.roleMode === 'client' && this.joinerPc === pc) {
            const wasInMatch = Boolean(this.joinerPc);
            this.cleanupJoinerConnections();
            this.roleMode = 'none';
            this.callbacks.onRoomError?.('Disconnected from Host.');
            this.callbacks.onRoomState?.(null);
            if (wasInMatch) {
              this.callbacks.onMatchEnd?.();
            }
          }
        };
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connecting') {
          this.updateSignaling({ joinerStatus: 'connecting' });
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (this.roleMode === 'client' && this.joinerPc === pc) {
            this.cleanupJoinerConnections();
            this.roleMode = 'none';
            this.callbacks.onRoomError?.('Hotspot connection to Host was lost.');
            this.callbacks.onRoomState?.(null);
          } else if (this.joinerPc === pc) {
            this.updateSignaling({
              joinerStatus: 'error',
              joinerError: 'Hotspot WebRTC handshake failed. Ensure both devices are on the same Wi-Fi Hotspot and retry.',
            });
          }
        }
      };

      await pc.setRemoteDescription({ type: 'offer', sdp: packet.s });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.waitForIceGathering(pc);

      if (this.joinerPc !== pc) {
        pc.close();
        return { ok: false, error: 'Join attempt cancelled.' };
      }

      const answerSdp = pc.localDescription?.sdp;
      if (!answerSdp) {
        throw new Error('Failed to create WebRTC answer SDP.');
      }

      const answerCode = await encodeSignalPacket({
        v: 1,
        t: 'A',
        o: packet.o,
        r: packet.r,
        c: this.clientId,
        n: profile.playerName,
        s: answerSdp,
      });

      this.updateSignaling({
        joinerStatus: 'awaiting_host',
        joinerAnswerCode: answerCode,
        joinerHostName: packet.n,
        joinerRoomId: packet.r,
        joinerError: null,
      });

      return { ok: true, answerCode };
    } catch (err) {
      this.cleanupJoinerConnections();
      const message = err instanceof Error ? err.message : 'Failed to parse Host Room Code.';
      this.updateSignaling({
        joinerStatus: 'error',
        joinerError: message,
      });
      return { ok: false, error: message };
    }
  }

  public cancelJoinAttempt() {
    this.cleanupJoinerConnections();
    if (this.roleMode === 'client') {
      this.roleMode = 'none';
    }
    this.updateSignaling({
      joinerStatus: 'idle',
      joinerAnswerCode: null,
      joinerHostName: null,
      joinerRoomId: null,
      joinerError: null,
    });
  }

  private cleanupJoinerConnections() {
    try {
      this.joinerCtrlChannel?.close();
    } catch {
      // ignore
    }
    try {
      this.joinerSyncChannel?.close();
    } catch {
      // ignore
    }
    try {
      this.joinerPc?.close();
    } catch {
      // ignore
    }
    this.joinerCtrlChannel = null;
    this.joinerSyncChannel = null;
    this.joinerPc = null;
    this.joinerBcRoomId = null;
  }

  private cleanupHostConnections() {
    if (this.hostRoom?.countdownTimer) {
      clearInterval(this.hostRoom.countdownTimer);
      this.hostRoom.countdownTimer = null;
    }
    this.pendingHostPeers.forEach((p) => {
      try {
        p.ctrlChannel?.close();
        p.syncChannel?.close();
        p.pc.close();
      } catch {
        // ignore
      }
    });
    this.pendingHostPeers.clear();

    this.hostPeers.forEach((p) => {
      if (p.transport === 'webrtc') {
        try {
          p.ctrlChannel?.close();
          p.syncChannel?.close();
          p.pc?.close();
        } catch {
          // ignore
        }
      }
    });
    this.hostPeers.clear();
    this.currentOfferId = null;
    this.updateSignaling({
      hostOfferCode: null,
      hostOfferGenerating: false,
      hostOfferError: null,
    });
  }

  // ---------------------------------------------------------------------------
  // Transport Send Helpers (Host <-> Client)
  // ---------------------------------------------------------------------------
  private sendToPeerReliable(peer: ActiveHostPeer, payload: unknown) {
    if (peer.transport === 'bc' && this.hostRoom) {
      this.postBroadcast({
        type: 'bc:to_client',
        roomId: this.hostRoom.roomId,
        targetClientId: peer.joinedClientId || peer.peerId,
        payload,
      });
      return;
    }

    const ch = peer.ctrlChannel;
    if (!ch || ch.readyState !== 'open') return;
    try {
      ch.send(JSON.stringify(payload));
    } catch {
      // ignore transient channel close
    }
  }

  private sendToPeerUnreliable(peer: ActiveHostPeer, payload: unknown) {
    if (peer.transport === 'bc' && this.hostRoom) {
      this.postBroadcast({
        type: 'bc:to_client',
        roomId: this.hostRoom.roomId,
        targetClientId: peer.joinedClientId || peer.peerId,
        payload,
      });
      return;
    }

    const ch =
      peer.syncChannel && peer.syncChannel.readyState === 'open'
        ? peer.syncChannel
        : peer.ctrlChannel;
    if (!ch || ch.readyState !== 'open') return;
    if (ch.bufferedAmount > 128 * 1024) return;
    try {
      ch.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private broadcastToHostPeers(payload: unknown, unreliable = false) {
    const serialized = JSON.stringify(payload);
    this.hostPeers.forEach((peer) => {
      if (peer.transport === 'bc' && this.hostRoom) {
        this.postBroadcast({
          type: 'bc:to_client',
          roomId: this.hostRoom.roomId,
          targetClientId: peer.joinedClientId || peer.peerId,
          payload,
        });
        return;
      }

      const ch = unreliable
        ? peer.syncChannel && peer.syncChannel.readyState === 'open'
          ? peer.syncChannel
          : peer.ctrlChannel
        : peer.ctrlChannel;

      if (!ch || ch.readyState !== 'open') return;
      if (unreliable && ch.bufferedAmount > 128 * 1024) return;
      try {
        ch.send(serialized);
      } catch {
        // ignore
      }
    });
  }

  private sendToHostReliable(payload: unknown) {
    if (this.joinerBcRoomId) {
      this.postBroadcast({
        type: 'bc:to_host',
        roomId: this.joinerBcRoomId,
        fromClientId: this.clientId,
        payload,
      });
      return;
    }

    const ch = this.joinerCtrlChannel;
    if (!ch || ch.readyState !== 'open') return;
    try {
      ch.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  private sendToHostUnreliable(payload: unknown) {
    if (this.joinerBcRoomId) {
      this.postBroadcast({
        type: 'bc:to_host',
        roomId: this.joinerBcRoomId,
        fromClientId: this.clientId,
        payload,
      });
      return;
    }

    const ch =
      this.joinerSyncChannel && this.joinerSyncChannel.readyState === 'open'
        ? this.joinerSyncChannel
        : this.joinerCtrlChannel;
    if (!ch || ch.readyState !== 'open') return;
    if (ch.bufferedAmount > 96 * 1024) return;
    try {
      ch.send(JSON.stringify(payload));
    } catch {
      // ignore
    }
  }

  // ---------------------------------------------------------------------------
  // Authoritative Host Room Logic (mirrors server.ts completely on-device)
  // ---------------------------------------------------------------------------
  private getTeamAvailableAiOutfieldSlots(room: HostRoomInternal, team: TeamSide): number {
    const perTeam = getPlayersPerTeam(room.settings.matchSize);
    const teamHumans = room.players.filter((p) => p.team === team);
    const humanOutfield = teamHumans.filter((p) => p.role === 'outfield').length;
    return Math.max(0, perTeam - 1 - humanOutfield);
  }

  private clampRoomAiControlCounts(room: HostRoomInternal) {
    for (const team of ['home', 'away'] as TeamSide[]) {
      const maxAi = this.getTeamAvailableAiOutfieldSlots(room, team);
      for (const p of room.players) {
        if (p.team !== team) continue;
        if (p.role === 'goalkeeper') {
          p.aiControlCount = 0;
        } else {
          const cur = Number.isFinite(p.aiControlCount) ? Math.floor(p.aiControlCount) : 1;
          p.aiControlCount = Math.max(0, Math.min(maxAi, cur));
        }
      }
    }
  }

  private rebalanceOverflowOnSizeChange(room: HostRoomInternal) {
    const perTeam = getPlayersPerTeam(room.settings.matchSize);
    for (const team of ['home', 'away'] as TeamSide[]) {
      const other: TeamSide = team === 'home' ? 'away' : 'home';
      const onTeam = room.players.filter((p) => p.team === team);
      if (onTeam.length <= perTeam) continue;

      const excess = onTeam.slice(perTeam);
      for (const p of excess) {
        const otherCount = room.players.filter((x) => x.team === other).length;
        if (otherCount < perTeam) {
          p.team = other;
          if (
            p.role === 'goalkeeper' &&
            room.players.some(
              (x) => x.team === other && x.role === 'goalkeeper' && x.clientId !== p.clientId,
            )
          ) {
            p.role = 'outfield';
          }
          p.ready = false;
        }
      }
    }
    this.clampRoomAiControlCounts(room);
  }

  private assignInitialSlot(
    room: HostRoomInternal,
    preferredTeam?: TeamSide,
  ): { team: TeamSide; role: PlayerRole } {
    const perTeam = getPlayersPerTeam(room.settings.matchSize);
    const homePlayers = room.players.filter((p) => p.team === 'home');
    const awayPlayers = room.players.filter((p) => p.team === 'away');

    let team: TeamSide;
    if (preferredTeam === 'home' && homePlayers.length < perTeam) {
      team = 'home';
    } else if (preferredTeam === 'away' && awayPlayers.length < perTeam) {
      team = 'away';
    } else if (homePlayers.length >= perTeam && awayPlayers.length < perTeam) {
      team = 'away';
    } else if (awayPlayers.length >= perTeam && homePlayers.length < perTeam) {
      team = 'home';
    } else {
      team = homePlayers.length <= awayPlayers.length ? 'home' : 'away';
    }

    const teamRoster = team === 'home' ? homePlayers : awayPlayers;
    const hasOutfield = teamRoster.some((p) => p.role === 'outfield');
    const hasGk = teamRoster.some((p) => p.role === 'goalkeeper');
    const role: PlayerRole = perTeam === 2 && hasOutfield && !hasGk ? 'goalkeeper' : 'outfield';
    return { team, role };
  }

  private clearHostCountdown(room: HostRoomInternal) {
    if (room.countdownTimer !== null && room.countdownTimer !== undefined) {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
    }
    room.countdownSeconds = 0;
    if (room.status === 'countdown') {
      room.status = 'lobby';
    }
  }

  private broadcastHostRoomState() {
    if (!this.hostRoom) return;
    const publicRoom = toPublicRoomState(this.hostRoom);
    this.callbacks.onRoomState?.(publicRoom);
    this.broadcastToHostPeers({ type: 'room:state', room: publicRoom });

    if (this.hostRoom.status === 'lobby') {
      this.postBroadcast({
        type: 'bc:announce',
        hostClientId: this.clientId,
        summary: toRoomSummary(this.hostRoom),
      });
    } else {
      this.postBroadcast({
        type: 'bc:close_room',
        roomId: this.hostRoom.roomId,
      });
    }
  }

  private maybeStartCountdown(room: HostRoomInternal) {
    if (room.status !== 'lobby' || room.players.length === 0) return;
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) return;

    this.clampRoomAiControlCounts(room);
    room.status = 'countdown';
    room.countdownSeconds = 3;
    room.kickoffTeam = Math.random() < 0.5 ? 'home' : 'away';

    this.broadcastHostRoomState();

    room.countdownTimer = window.setInterval(() => {
      if (!this.hostRoom || this.hostRoom !== room) {
        if (room.countdownTimer) clearInterval(room.countdownTimer);
        return;
      }
      room.countdownSeconds -= 1;
      if (room.countdownSeconds > 0) {
        this.broadcastHostRoomState();
        return;
      }

      if (room.countdownTimer !== null && room.countdownTimer !== undefined) {
        clearInterval(room.countdownTimer);
        room.countdownTimer = null;
      }
      room.status = 'playing';
      room.countdownSeconds = 0;

      const publicRoom = toPublicRoomState(room);
      const kickoffTeam = room.kickoffTeam || 'home';
      this.broadcastHostRoomState();
      this.broadcastToHostPeers({
        type: 'match:start',
        room: publicRoom,
        kickoffTeam,
      });
      this.callbacks.onMatchStart?.(publicRoom, kickoffTeam, false);
    }, 1000);
  }

  private broadcastDrawState(room: HostRoomInternal) {
    const state: DrawDecisionState = {
      active: room.drawPending,
      homeScore: room.drawHomeScore,
      awayScore: room.drawAwayScore,
      votes: { ...room.drawVotes },
      totalPlayers: room.players.length,
      extraTimeCount: room.drawExtraTimeCount,
    };
    this.broadcastToHostPeers({ type: 'match:draw_state', state });
    this.callbacks.onDrawState?.(state);
  }

  private evaluateDrawVotes(room: HostRoomInternal) {
    if (!room.drawPending) return;
    const entries = Object.values(room.drawVotes);
    if (entries.some((v) => v === 'tiebreaker')) {
      room.drawPending = false;
      room.drawVotes = {};
      this.broadcastToHostPeers({ type: 'match:draw_resolution', decision: 'tiebreaker' });
      this.callbacks.onDrawResolution?.('tiebreaker');
      return;
    }
    const allMoreTime =
      room.players.length > 0 && room.players.every((p) => room.drawVotes[p.clientId] === 'more_time');
    if (allMoreTime) {
      room.drawPending = false;
      room.drawVotes = {};
      this.broadcastToHostPeers({ type: 'match:draw_resolution', decision: 'more_time' });
      this.callbacks.onDrawResolution?.('more_time');
      return;
    }
    this.broadcastDrawState(room);
  }

  private removePlayerFromHostRoom(departingClientId: string) {
    const room = this.hostRoom;
    if (!room) return;
    if (departingClientId === this.clientId) return;

    const beforeCount = room.players.length;
    room.players = room.players.filter((p) => p.clientId !== departingClientId);
    if (room.players.length === beforeCount) return;

    room.playerCount = room.players.length;
    delete room.drawVotes[departingClientId];

    if (room.status === 'countdown') {
      this.clearHostCountdown(room);
    }
    if (room.status === 'lobby') {
      this.clampRoomAiControlCounts(room);
    }
    if (room.drawPending) {
      this.evaluateDrawVotes(room);
    }
    this.broadcastHostRoomState();
  }

  private applySlotSelectionOnHost(
    targetClientId: string,
    team: TeamSide,
    role: PlayerRole,
    replyPeer?: ActiveHostPeer,
  ) {
    const room = this.hostRoom;
    if (!room || room.status !== 'lobby') return;
    const player = room.players.find((p) => p.clientId === targetClientId);
    if (!player) return;

    const perTeam = getPlayersPerTeam(room.settings.matchSize);
    const targetTeamCount = room.players.filter(
      (p) => p.team === team && p.clientId !== targetClientId,
    ).length;

    const notifyError = (message: string) => {
      if (replyPeer) {
        this.sendToPeerReliable(replyPeer, { type: 'room:error', message });
      } else {
        this.callbacks.onRoomError?.(message);
      }
    };

    if (targetTeamCount >= perTeam) {
      notifyError(`${team.toUpperCase()} team is full (${perTeam}/${perTeam} for ${room.settings.matchSize}).`);
      return;
    }

    if (role === 'goalkeeper') {
      const existingGk = room.players.find(
        (p) => p.clientId !== targetClientId && p.team === team && p.role === 'goalkeeper',
      );
      if (existingGk) {
        notifyError(
          `${team.toUpperCase()} already has a dedicated Goalkeeper (${existingGk.playerName}).`,
        );
        return;
      }
    }

    player.team = team;
    player.role = role;
    if (role === 'goalkeeper') {
      player.aiControlCount = 0;
    } else if (player.aiControlCount === 0) {
      player.aiControlCount = 1;
    }
    player.ready = false;
    this.clampRoomAiControlCounts(room);
    this.broadcastHostRoomState();
  }

  private handleHostInboundMessage(
    senderClientId: string,
    data: Record<string, unknown>,
    transportPeerId?: string,
  ) {
    const room = this.hostRoom;
    if (!room) return;
    const type = String(data.type ?? '');

    const findPeer = (): ActiveHostPeer | undefined =>
      (transportPeerId ? this.hostPeers.get(transportPeerId) : undefined) ||
      this.hostPeers.get(senderClientId) ||
      Array.from(this.hostPeers.values()).find((p) => p.joinedClientId === senderClientId);

    if (type === 'room:join') {
      const peer = findPeer();
      if (room.status !== 'lobby') {
        if (peer) {
          this.sendToPeerReliable(peer, { type: 'room:error', message: 'Match has already started.' });
        }
        return;
      }

      const actualClientId = String(data.clientId || senderClientId);
      if (peer) {
        peer.joinedClientId = actualClientId;
      }

      // Idempotent guard: if player already exists, just refresh state
      if (room.players.some((p) => p.clientId === actualClientId)) {
        this.broadcastHostRoomState();
        return;
      }

      if (room.players.length >= room.maxPlayers) {
        if (peer) {
          this.sendToPeerReliable(peer, {
            type: 'room:error',
            message: `Lobby is full (max ${room.maxPlayers} players for ${room.settings.matchSize}).`,
          });
        }
        return;
      }

      const profile = data.profile as
        | {
            playerName: string;
            jerseyText: string;
            jerseyNumber: number;
            avatar: LanLobbyPlayer['avatar'];
          }
        | undefined;
      const preferredTeam: TeamSide | undefined =
        data.preferredTeam === 'home' || data.preferredTeam === 'away'
          ? data.preferredTeam
          : undefined;

      const slot = this.assignInitialSlot(room, preferredTeam);
      const joinedPlayer: LanLobbyPlayer = {
        clientId: actualClientId,
        playerName: profile?.playerName || 'Guest Player',
        jerseyText: profile?.jerseyText || 'PLAYER',
        jerseyNumber: profile?.jerseyNumber || 7,
        avatar: profile?.avatar || room.players[0].avatar,
        isHost: false,
        team: slot.team,
        role: slot.role,
        ready: false,
        aiControlCount: slot.role === 'goalkeeper' ? 0 : 1,
      };

      room.players.push(joinedPlayer);
      room.playerCount = room.players.length;
      this.clampRoomAiControlCounts(room);
      this.broadcastHostRoomState();
      return;
    }

    if (type === 'room:leave') {
      const peer = findPeer();
      if (peer) {
        this.hostPeers.delete(peer.peerId);
        if (peer.transport === 'webrtc') {
          try {
            peer.ctrlChannel?.close();
            peer.syncChannel?.close();
            peer.pc?.close();
          } catch {
            // ignore
          }
        }
      }
      this.removePlayerFromHostRoom(senderClientId);
      this.updateSignaling({});
      return;
    }

    if (type === 'room:select_slot') {
      const team: TeamSide = data.team === 'away' ? 'away' : 'home';
      const role: PlayerRole = data.role === 'goalkeeper' ? 'goalkeeper' : 'outfield';
      this.applySlotSelectionOnHost(senderClientId, team, role, findPeer());
      return;
    }

    if (type === 'room:toggle_ready') {
      const player = room.players.find((p) => p.clientId === senderClientId);
      if (!player) return;
      player.ready = !player.ready;
      if (!player.ready && room.status === 'countdown') {
        this.clearHostCountdown(room);
      }
      this.broadcastHostRoomState();
      this.maybeStartCountdown(room);
      return;
    }

    if (type === 'match:client_input') {
      if (room.status !== 'playing') return;
      const input = data.input as ClientMatchInput | undefined;
      if (!input) return;
      this.callbacks.onClientInput?.(senderClientId, input);
      return;
    }

    if (type === 'match:draw_vote') {
      if (!room.drawPending) return;
      const vote: DrawVoteOption = data.vote === 'more_time' ? 'more_time' : 'tiebreaker';
      room.drawVotes[senderClientId] = vote;
      this.evaluateDrawVotes(room);
    }
  }

  // ---------------------------------------------------------------------------
  // Client Inbound Message Handler (Joiner receiving from Host)
  // ---------------------------------------------------------------------------
  private handleClientInboundMessage(data: Record<string, unknown>) {
    switch (data.type) {
      case 'room:state':
        this.callbacks.onRoomState?.((data.room as LanRoomState) || null);
        break;
      case 'room:left':
      case 'room:host_closed':
        this.cleanupJoinerConnections();
        this.roleMode = 'none';
        if (data.type === 'room:host_closed') {
          this.callbacks.onRoomError?.('Host closed the room.');
        }
        this.callbacks.onRoomState?.(null);
        break;
      case 'room:error':
        this.callbacks.onRoomError?.(String(data.message || 'Room error'));
        break;
      case 'match:start':
        this.callbacks.onMatchStart?.(
          data.room as LanRoomState,
          (data.kickoffTeam as TeamSide) || 'home',
          Boolean(data.rejoin),
        );
        break;
      case 'match:host_migrated':
        if (typeof data.hostClientId === 'string' && data.room) {
          this.callbacks.onHostMigrated?.(data.hostClientId, data.room as LanRoomState);
        }
        break;
      case 'match:skip_prematch':
        this.callbacks.onPreMatchSkip?.();
        break;
      case 'match:snapshot':
        this.callbacks.onMatchSnapshot?.(data.snapshot as SyncedMatchSnapshot);
        break;
      case 'match:draw_state':
        this.callbacks.onDrawState?.(data.state as DrawDecisionState);
        break;
      case 'match:draw_resolution':
        this.callbacks.onDrawResolution?.(
          data.decision === 'more_time' ? 'more_time' : 'tiebreaker',
        );
        break;
      case 'match:end':
        this.callbacks.onMatchEnd?.();
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Preserved Public API (100% compatible with App.tsx & engine.ts)
  // ---------------------------------------------------------------------------
  public scanRooms() {
    this.postBroadcast({ type: 'bc:scan' });
    this.emitDiscoveredRooms();
  }

  public createRoom(profile: PlayerProfile, settings: LanMatchSettings) {
    this.leaveRoom();
    this.roleMode = 'host';

    const roomId = `PTS-${Math.floor(1000 + Math.random() * 9000)}`;
    const hostPlayer: LanLobbyPlayer = {
      clientId: this.clientId,
      playerName: profile.playerName || 'Host Player',
      jerseyText: profile.jerseyText || 'TITANIC',
      jerseyNumber: profile.jerseyNumber || 10,
      avatar: profile.avatar,
      isHost: true,
      team: 'home',
      role: 'outfield',
      ready: false,
      aiControlCount: 1,
    };

    const room: HostRoomInternal = {
      roomId,
      hostName: hostPlayer.playerName,
      settings: { ...settings },
      playerCount: 1,
      maxPlayers: getRoomMaxPlayers(settings.matchSize),
      status: 'lobby',
      players: [hostPlayer],
      kickoffTeam: null,
      countdownSeconds: 0,
      countdownTimer: null,
      drawPending: false,
      drawVotes: {},
      drawHomeScore: 0,
      drawAwayScore: 0,
      drawExtraTimeCount: 0,
    };

    this.clampRoomAiControlCounts(room);
    this.hostRoom = room;
    this.broadcastHostRoomState();
    void this.createHostInviteOffer();
  }

  public joinRoom(roomId: string, profile: PlayerProfile, preferredTeam?: TeamSide) {
    const discovered = this.discoveredRooms.get(roomId);
    if (!discovered) {
      this.callbacks.onRoomError?.(
        'Room not reachable directly. Use the Host Connection Code (PTS1:...) to connect over Wi-Fi Hotspot.',
      );
      return;
    }

    this.leaveRoom();
    this.roleMode = 'client';
    this.joinerBcRoomId = roomId;
    this.postBroadcast({
      type: 'bc:to_host',
      roomId,
      fromClientId: this.clientId,
      payload: {
        type: 'room:join',
        clientId: this.clientId,
        preferredTeam,
        profile: {
          playerName: profile.playerName,
          jerseyText: profile.jerseyText,
          jerseyNumber: profile.jerseyNumber,
          avatar: profile.avatar,
        },
      },
    });
  }

  public leaveRoom() {
    if (this.roleMode === 'host' && this.hostRoom) {
      const closedRoomId = this.hostRoom.roomId;
      this.broadcastToHostPeers({ type: 'room:host_closed' });
      this.postBroadcast({ type: 'bc:close_room', roomId: closedRoomId });
      this.cleanupHostConnections();
      this.hostRoom = null;
      this.roleMode = 'none';
      this.callbacks.onRoomState?.(null);
      return;
    }

    if (this.roleMode === 'client') {
      this.sendToHostReliable({ type: 'room:leave', clientId: this.clientId });
      this.cleanupJoinerConnections();
      this.roleMode = 'none';
      this.callbacks.onRoomState?.(null);
      return;
    }

    this.cancelJoinAttempt();
  }

  public updateSettings(settings: LanMatchSettings) {
    if (this.roleMode !== 'host' || !this.hostRoom || this.hostRoom.status !== 'lobby') return;
    this.hostRoom.settings = { ...settings };
    this.hostRoom.maxPlayers = getRoomMaxPlayers(settings.matchSize);
    this.rebalanceOverflowOnSizeChange(this.hostRoom);
    this.broadcastHostRoomState();
  }

  public selectSlot(team: TeamSide, role: PlayerRole) {
    if (this.roleMode === 'host' && this.hostRoom) {
      this.applySlotSelectionOnHost(this.clientId, team, role);
      return;
    }
    if (this.roleMode === 'client') {
      this.sendToHostReliable({
        type: 'room:select_slot',
        clientId: this.clientId,
        team,
        role,
      });
    }
  }

  public setAiControl(targetClientId: string, aiControlCount: number) {
    if (this.roleMode !== 'host' || !this.hostRoom || this.hostRoom.status !== 'lobby') return;
    const target = this.hostRoom.players.find((p) => p.clientId === targetClientId);
    if (!target || target.role === 'goalkeeper') return;
    const maxAi = this.getTeamAvailableAiOutfieldSlots(this.hostRoom, target.team);
    target.aiControlCount = Math.max(0, Math.min(maxAi, Math.floor(aiControlCount)));
    this.broadcastHostRoomState();
  }

  public hostAssignPlayer(
    targetClientId: string,
    assignment: { team?: TeamSide; role?: PlayerRole },
  ) {
    const room = this.hostRoom;
    if (this.roleMode !== 'host' || !room || room.status !== 'lobby') return;

    const target = room.players.find((p) => p.clientId === targetClientId);
    if (!target) return;

    const perTeam = getPlayersPerTeam(room.settings.matchSize);
    const desiredTeam = assignment.team;
    const desiredRole = assignment.role;

    if (desiredTeam && desiredTeam !== target.team) {
      const prevTeam = target.team;
      const destRoster = room.players.filter((p) => p.team === desiredTeam);
      if (destRoster.length >= perTeam) {
        const swapCandidate =
          destRoster.find((p) => !p.isHost && p.role === target.role) ||
          destRoster.find((p) => !p.isHost) ||
          destRoster[destRoster.length - 1];
        if (!swapCandidate) return;

        target.team = desiredTeam;
        swapCandidate.team = prevTeam;

        if (
          target.role === 'goalkeeper' &&
          room.players.some(
            (p) => p.team === desiredTeam && p.role === 'goalkeeper' && p.clientId !== target.clientId,
          )
        ) {
          target.role = 'outfield';
        }
        if (
          swapCandidate.role === 'goalkeeper' &&
          room.players.some(
            (p) =>
              p.team === prevTeam && p.role === 'goalkeeper' && p.clientId !== swapCandidate.clientId,
          )
        ) {
          swapCandidate.role = 'outfield';
        }
        target.ready = false;
        swapCandidate.ready = false;
      } else {
        target.team = desiredTeam;
        if (
          target.role === 'goalkeeper' &&
          room.players.some(
            (p) => p.team === desiredTeam && p.role === 'goalkeeper' && p.clientId !== target.clientId,
          )
        ) {
          target.role = 'outfield';
        }
        target.ready = false;
      }
    }

    if (desiredRole && desiredRole !== target.role) {
      if (desiredRole === 'goalkeeper') {
        const existingGk = room.players.find(
          (p) => p.team === target.team && p.role === 'goalkeeper' && p.clientId !== target.clientId,
        );
        if (existingGk) {
          existingGk.role = 'outfield';
          existingGk.aiControlCount = Math.max(1, existingGk.aiControlCount);
          existingGk.ready = false;
        }
        target.role = 'goalkeeper';
        target.aiControlCount = 0;
      } else {
        target.role = 'outfield';
        if (target.aiControlCount === 0) target.aiControlCount = 1;
      }
      target.ready = false;
    }

    this.clampRoomAiControlCounts(room);
    this.broadcastHostRoomState();
  }

  public toggleReady() {
    if (this.roleMode === 'host' && this.hostRoom) {
      const me = this.hostRoom.players.find((p) => p.clientId === this.clientId);
      if (!me) return;
      me.ready = !me.ready;
      if (!me.ready && this.hostRoom.status === 'countdown') {
        this.clearHostCountdown(this.hostRoom);
      }
      this.broadcastHostRoomState();
      this.maybeStartCountdown(this.hostRoom);
      return;
    }

    if (this.roleMode === 'client') {
      this.sendToHostReliable({ type: 'room:toggle_ready', clientId: this.clientId });
    }
  }

  public sendClientInput(input: ClientMatchInput) {
    if (this.roleMode !== 'client') return;
    this.sendToHostUnreliable({
      type: 'match:client_input',
      clientId: this.clientId,
      input,
    });
  }

  public sendMatchSnapshot(snapshot: SyncedMatchSnapshot) {
    if (this.roleMode !== 'host' || !this.hostRoom || this.hostRoom.status !== 'playing') return;
    this.broadcastToHostPeers({ type: 'match:snapshot', snapshot }, true);
  }

  public sendPreMatchSkip() {
    if (this.roleMode !== 'host' || !this.hostRoom || this.hostRoom.status !== 'playing') return;
    this.callbacks.onPreMatchSkip?.();
  }

  public sendDrawPrompt(homeScore: number, awayScore: number, extraTimeCount: number) {
    if (this.roleMode !== 'host' || !this.hostRoom) return;
    this.hostRoom.drawPending = true;
    this.hostRoom.drawVotes = {};
    this.hostRoom.drawHomeScore = Number(homeScore ?? 0);
    this.hostRoom.drawAwayScore = Number(awayScore ?? 0);
    this.hostRoom.drawExtraTimeCount = Number(extraTimeCount ?? 0);
    this.broadcastDrawState(this.hostRoom);
  }

  public sendDrawVote(vote: DrawVoteOption) {
    if (this.roleMode === 'host' && this.hostRoom) {
      if (!this.hostRoom.drawPending) return;
      this.hostRoom.drawVotes[this.clientId] = vote;
      this.evaluateDrawVotes(this.hostRoom);
      return;
    }
    if (this.roleMode === 'client') {
      this.sendToHostReliable({
        type: 'match:draw_vote',
        clientId: this.clientId,
        vote,
      });
    }
  }

  public sendMatchEnd() {
    if (this.roleMode !== 'host' || !this.hostRoom) return;
    if (this.hostRoom.status !== 'playing') return;

    this.hostRoom.status = 'lobby';
    this.hostRoom.drawPending = false;
    this.hostRoom.drawVotes = {};
    this.hostRoom.players.forEach((p) => {
      p.ready = false;
    });

    this.broadcastToHostPeers({ type: 'match:end' });
    this.broadcastHostRoomState();
    void this.createHostInviteOffer();
  }
}
