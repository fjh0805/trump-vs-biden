import { BALANCE } from "../src/shared/balance";
import type { ArmyView, RoomSnapshot, StateView } from "../src/shared/protocol";
import type { RoomState } from "../src/shared/room-state";
import { countScores, factionOf, nearestState, visibleSet } from "./simulate";
import map from "../src/shared/us-map.json";

const MAP = map as { states: Record<string, { cx: number; cy: number }> };

export { visibleSet };

export function snapshotFor(state: RoomState, playerId: string, events: RoomSnapshot["events"]): RoomSnapshot {
  const ids = Object.keys(MAP.states);
  const vis = state.phase === "playing" ? visibleSet(state, playerId) : new Set(ids);
  const states: Record<string, StateView> = {};
  for (const id of ids) {
    const terr = state.territories[id] ?? { ownerId: null, troops: 0 };
    const visible = vis.has(id);
    states[id] = visible
      ? {
          ownerId: terr.ownerId,
          faction: factionOf(state, terr.ownerId),
          troops: Math.floor(terr.troops),
          visible: true,
        }
      : { ownerId: null, faction: null, troops: null, visible: false };
  }
  const filtered = events.filter((e) => {
    if (e.kind === "send") return vis.has(e.from) || vis.has(e.to);
    if (e.kind === "capture" || e.kind === "arrive") return vis.has(e.state);
    if (e.kind === "clash") return vis.has(e.state);
    return false;
  });
  const armies: ArmyView[] = state.armies
    .filter((a) => !a.arrived && (vis.has(a.from) || vis.has(a.to) || vis.has(nearestState(a.x, a.y))))
    .map((a) => ({
      id: a.id,
      ownerId: a.ownerId,
      faction: a.faction,
      x: a.x,
      y: a.y,
      troops: a.troops,
      from: a.from,
      to: a.to,
    }));
  const scores = countScores(state);
  const elapsed = state.phase === "playing" ? Date.now() - state.startedAt : 0;
  const matchMs = BALANCE.MATCH_TIME_SEC * 1000;
  const timeLeftMs =
    state.phase === "playing" ? Math.max(0, matchMs - elapsed) : state.phase === "ended" ? 0 : matchMs;
  return {
    type: "snapshot",
    code: state.code,
    mode: state.mode,
    phase: state.phase,
    you: playerId,
    hostId: state.hostId,
    humanFaction: state.humanFaction,
    timeLeftMs,
    tick: state.tick,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction,
      zone: p.zone,
      home: p.home,
      isAI: p.isAI,
      isHost: p.isHost,
      connected: p.connected,
      muted: p.muted,
      speaking: p.speaking,
      aiHold: p.aiHold,
    })),
    states,
    armies,
    events: filtered,
    chat: state.chat.slice(-40),
    trumpStates: scores.trumpStates,
    bidenStates: scores.bidenStates,
    trumpTroops: Math.floor(scores.trumpTroops),
    bidenTroops: Math.floor(scores.bidenTroops),
    winner: state.winner,
    reason: state.reason,
  };
}
