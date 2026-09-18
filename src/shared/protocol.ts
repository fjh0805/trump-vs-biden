import type { Faction, Mode, Phase, Zone } from "./constants";

export type ClientToServer =
  | { type: "hello"; playerId: string; name: string; code: string; intent: "create" | "join"; mode?: Mode; faction?: Faction; home?: string }
  | { type: "start" }
  | { type: "pickHome"; home: string }
  | { type: "send"; from: string; to: string; ratio: number }
  | { type: "chat"; text: string }
  | { type: "mute"; muted: boolean }
  | { type: "speaking"; speaking: boolean }
  | { type: "rematch" }
  | { type: "signal"; to: string; payload: SignalPayload };

export type SignalPayload =
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: string | null; sdpMid: string | null; sdpMLineIndex: number | null };

export type GameEvent =
  | { kind: "send"; from: string; to: string; faction: Faction; scout?: boolean }
  | { kind: "clash"; x: number; y: number; state: string }
  | { kind: "capture"; state: string; faction: Faction }
  | { kind: "arrive"; state: string };

export interface PlayerView {
  id: string;
  name: string;
  faction: Faction;
  zone: Zone;
  home: string;
  isAI: boolean;
  isHost: boolean;
  connected: boolean;
  muted: boolean;
  speaking: boolean;
  aiHold: boolean;
}

export interface StateView {
  ownerId: string | null;
  faction: Faction | null;
  troops: number | null;
  visible: boolean;
}

export interface ArmyView {
  id: string;
  ownerId: string;
  faction: Faction;
  x: number;
  y: number;
  troops: number;
  from: string;
  to: string;
}

export interface RoomSnapshot {
  type: "snapshot";
  code: string;
  mode: Mode;
  phase: Phase;
  you: string;
  hostId: string;
  humanFaction: Faction;
  timeLeftMs: number;
  tick: number;
  players: PlayerView[];
  states: Record<string, StateView>;
  armies: ArmyView[];
  events: GameEvent[];
  chat: { id: number; from: string; name: string; text: string; t: number }[];
  trumpStates: number;
  bidenStates: number;
  trumpTroops: number;
  bidenTroops: number;
  winner: Faction | "draw" | null;
  reason: string | null;
}

export type ServerToClient =
  | RoomSnapshot
  | { type: "error"; message: string }
  | { type: "signal"; from: string; payload: SignalPayload }
  | { type: "peers"; ids: string[] };
