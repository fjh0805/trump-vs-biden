import type { Faction, Mode, Phase, Zone } from "./constants";

export interface Player {
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
  disconnectedAt: number;
}

export interface Territory {
  ownerId: string | null;
  troops: number;
  startTroops: number;
}

export interface Army {
  id: string;
  ownerId: string;
  faction: Faction;
  from: string;
  to: string;
  troops: number;
  progress: number;
  speed: number;
  x: number;
  y: number;
  arrived: boolean;
}

export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
  t: number;
}

export interface RoomState {
  code: string;
  mode: Mode;
  phase: Phase;
  humanFaction: Faction;
  hostId: string;
  createdAt: number;
  startedAt: number;
  endedAt: number;
  tick: number;
  armySeq: number;
  chatSeq: number;
  players: Player[];
  territories: Record<string, Territory>;
  armies: Army[];
  chat: ChatLine[];
  winner: Faction | "draw" | null;
  reason: string | null;
}
