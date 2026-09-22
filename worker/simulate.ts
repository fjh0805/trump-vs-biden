import { decideAiOrders } from "../src/shared/ai-policy";
import type { AiContext, AiStateView } from "../src/shared/ai-policy";
import { BALANCE, neutralTroopsPerSecond, troopsPerSecond } from "../src/shared/balance";
import type { StateId } from "../src/shared/state-labels";
import {
  ADJACENT,
  HOMES,
  STATE_COUNT,
  TICK_MS,
  controlBank,
  homesInBank,
  resolveHome,
  armyTravelSeconds,
} from "../src/shared/constants";
import { neutralTroops } from "../src/shared/map-area";
import type { Faction, HomeId, Mode, Zone } from "../src/shared/constants";
import type { GameEvent } from "../src/shared/protocol";
import type { Army, RoomState, Territory } from "../src/shared/room-state";
import map from "../src/shared/us-map.json";

const MAP = map as {
  states: Record<string, { cx: number; cy: number; income: number; d: string }>;
};

export function emptyTerritories(): Record<string, Territory> {
  const out: Record<string, Territory> = {};
  for (const id of Object.keys(MAP.states)) {
    const n = neutralTroops(id);
    out[id] = { ownerId: null, troops: n, startTroops: n };
  }
  return out;
}

export function factionOf(state: RoomState, playerId: string | null): Faction | null {
  if (!playerId) return null;
  return state.players.find((p) => p.id === playerId)?.faction ?? null;
}

export function teammates(state: RoomState, playerId: string): Set<string> {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return new Set([playerId]);
  return new Set(state.players.filter((p) => p.faction === me.faction).map((p) => p.id));
}

export function seedMatch(state: RoomState) {
  state.territories = emptyTerritories();
  state.armies = [];
  state.tick = 0;
  state.winner = null;
  state.reason = null;
  state.startedAt = Date.now();
  state.endedAt = 0;
  state.phase = "playing";
  state.armySeq = 1;

  for (const p of state.players) {
    const home = p.home;
    if (!MAP.states[home]) continue;
    state.territories[home] = {
      ownerId: p.id,
      troops: BALANCE.HOME_START_TROOPS,
      startTroops: BALANCE.HOME_START_TROOPS,
    };
  }
}

export function layoutPlayers(
  mode: Mode,
  humanFaction: Faction,
  humans: { id: string; name: string; home?: string }[],
  hostId: string,
) {
  const opposite: Faction = humanFaction === "trump" ? "biden" : "trump";
  if (mode === "1v1") {
    const a = humans[0];
    const b = humans[1] ?? { id: "ai-east", name: "电脑对手" };
    const homeA = resolveHome(humanFaction, a.home ?? "random");
    const homeB = resolveHome(opposite, b.home ?? "random");
    return [
      player(a.id, a.name, humanFaction, controlBank(homeA), homeA, a.id.startsWith("ai-"), a.id === hostId),
      player(b.id, b.name, opposite, controlBank(homeB), homeB, b.id.startsWith("ai-"), b.id === hostId),
    ];
  }
  const west = humans[0];
  const east = humans[1];
  const homeW = resolveHome(humanFaction, west.home ?? "random", "west");
  const homeE = resolveHome(humanFaction, east.home ?? "random", "east");
  const aiW = pickFree(opposite, "west", [homeW, homeE]);
  const aiE = pickFree(opposite, "east", [homeW, homeE, aiW]);
  return [
    player(west.id, west.name, humanFaction, "west", homeW, false, west.id === hostId),
    player(east.id, east.name, humanFaction, "east", homeE, false, east.id === hostId),
    player("ai-west", "电脑·西岸", opposite, "west", aiW, true, false),
    player("ai-east", "电脑·东岸", opposite, "east", aiE, true, false),
  ];
}

function pickFree(faction: Faction, zone: Zone, taken: string[]): HomeId {
  const opts = homesInBank(faction, zone).filter((h) => !taken.includes(h));
  const pool = opts.length ? opts : homesInBank(faction, zone);
  const list = pool.length ? pool : HOMES[faction];
  return list[Math.floor(Math.random() * list.length)];
}

function player(id: string, name: string, faction: Faction, zone: Zone, home: string, isAI: boolean, isHost: boolean) {
  return { id, name, faction, zone, home, isAI, isHost, connected: !isAI, muted: false, speaking: false, aiHold: false, disconnectedAt: 0 };
}


export function visibleSet(state: RoomState, playerId: string): Set<string> {
  const mine = teammates(state, playerId);
  const vis = new Set<string>();
  for (const [id, terr] of Object.entries(state.territories)) {
    if (terr.ownerId && mine.has(terr.ownerId)) {
      vis.add(id);
      for (const n of ADJACENT[id] ?? []) vis.add(n);
    }
  }
  for (const army of state.armies) {
    if (!mine.has(army.ownerId)) continue;
    vis.add(army.from);
    vis.add(army.to);
    for (const [id, meta] of Object.entries(MAP.states)) {
      if (Math.hypot(meta.cx - army.x, meta.cy - army.y) < 52) vis.add(id);
    }
  }
  return vis;
}

export function canSendTo(state: RoomState, playerId: string, from: string, to: string): boolean {
  if (!from || !to || from === to) return false;
  const terr = state.territories[from];
  if (!terr || terr.ownerId !== playerId) return false;
  return visibleSet(state, playerId).has(to);
}

export function sendArmy(state: RoomState, playerId: string, from: string, to: string, ratio: number): string | null {
  if (state.phase !== "playing") return "对局尚未开始";
  const terr = state.territories[from];
  if (!terr || terr.ownerId !== playerId) return "只能从自己的州出兵";
  const actor = state.players.find((p) => p.id === playerId);
  if (state.mode === "2v2" && actor && controlBank(from) !== actor.zone) {
    return "2v2 只能指挥自己半边的州";
  }
  if (!canSendTo(state, playerId, from, to)) return "目标不在视野内";
  const n = Math.floor(terr.troops * clamp(ratio, 0.1, 1));
  if (n < 1) return "兵力不足";
  terr.troops = Math.max(0, terr.troops - n);
  const a = MAP.states[from];
  const b = MAP.states[to];
  const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const seconds = armyTravelSeconds(dist);
  const army: Army = {
    id: `a${state.armySeq++}`,
    ownerId: playerId,
    faction: factionOf(state, playerId)!,
    from,
    to,
    troops: n,
    progress: 0,
    speed: TICK_MS / (seconds * 1000),
    x: a.cx,
    y: a.cy,
    arrived: false,
  };
  state.armies.push(army);
  return null;
}

export function step(state: RoomState): GameEvent[] {
  if (state.phase !== "playing") return [];
  const events: GameEvent[] = [];
  state.tick += 1;
  const homes = new Set(state.players.map((p) => p.home));
  for (const [id, terr] of Object.entries(state.territories)) {
    if (!terr.ownerId) {
      const gain = neutralTroopsPerSecond() * (TICK_MS / 1000);
      if (terr.troops < BALANCE.NEUTRAL_TROOP_CAP) {
        terr.troops = Math.min(BALANCE.NEUTRAL_TROOP_CAP, terr.troops + gain);
      }
      continue;
    }
    const gain = troopsPerSecond(homes.has(id)) * (TICK_MS / 1000);
    // Cap only fills UP TO TROOP_CAP — never clamp stacked reinforcements down.
    if (terr.troops < BALANCE.TROOP_CAP) {
      terr.troops = Math.min(BALANCE.TROOP_CAP, terr.troops + gain);
    }
  }

  for (const army of state.armies) {
    if (army.arrived) continue;
    const a = MAP.states[army.from];
    const b = MAP.states[army.to];
    const next = Math.min(1, army.progress + army.speed);
    if (next >= 1 && army.progress < 1) {
      army.arrived = true;
      events.push({ kind: "arrive", state: army.to });
    }
    army.progress = next;
    army.x = a.cx + (b.cx - a.cx) * army.progress;
    army.y = a.cy + (b.cy - a.cy) * army.progress;
  }

  const strike = combatDue(state.tick);
  resolveClashes(state, events, strike);
  resolveSieges(state, events, strike);

  runAI(state, events);

  const scores = countScores(state);
  const elapsed = Date.now() - state.startedAt;
  const timeUp = elapsed >= BALANCE.MATCH_TIME_SEC * 1000;
  const majority = BALANCE.WIN_STATE_COUNT;

  if (scores.trumpStates >= majority) {
    end(state, "trump", `特朗普阵营占领 ${scores.trumpStates} 州，达 ${majority} 州获胜`);
  } else if (scores.bidenStates >= majority) {
    end(state, "biden", `拜登阵营占领 ${scores.bidenStates} 州，达 ${majority} 州获胜`);
  } else if (timeUp) {
    if (scores.trumpStates > scores.bidenStates) end(state, "trump", "时间到：州数更多");
    else if (scores.bidenStates > scores.trumpStates) end(state, "biden", "时间到：州数更多");
    else if (scores.trumpTroops > scores.bidenTroops) end(state, "trump", "时间到：州数相同，兵力更多");
    else if (scores.bidenTroops > scores.trumpTroops) end(state, "biden", "时间到：州数相同，兵力更多");
    else end(state, "draw", "时间到：州数与兵力均持平");
  }
  return events;
}

export function countScores(state: RoomState) {
  let trumpStates = 0;
  let bidenStates = 0;
  let trumpTroops = 0;
  let bidenTroops = 0;
  for (const terr of Object.values(state.territories)) {
    const f = factionOf(state, terr.ownerId);
    if (f === "trump") {
      trumpStates += 1;
      trumpTroops += terr.troops;
    } else if (f === "biden") {
      bidenStates += 1;
      bidenTroops += terr.troops;
    }
  }
  for (const a of state.armies) {
    if (a.faction === "trump") trumpTroops += a.troops;
    else bidenTroops += a.troops;
  }
  return { trumpStates, bidenStates, trumpTroops, bidenTroops, empty: STATE_COUNT - trumpStates - bidenStates };
}

function end(state: RoomState, winner: Faction | "draw", reason: string) {
  state.phase = "ended";
  state.winner = winner;
  state.reason = reason;
  state.endedAt = Date.now();
}

function combatDue(tick: number) {
  const now = tick * TICK_MS;
  const prev = (tick - 1) * TICK_MS;
  const combatMs = BALANCE.COMBAT_TICK_SEC * 1000;
  return Math.floor(now / combatMs) !== Math.floor(prev / combatMs);
}

function resolveClashes(state: RoomState, events: GameEvent[], strike: boolean) {
  const live = state.armies;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (!a.troops || !b.troops) continue;
      if (a.faction === b.faction) continue;
      const sameEdge =
        (a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from);
      const near = Math.hypot(a.x - b.x, a.y - b.y) < 18;
      if (!sameEdge && !near) continue;
      if (!near) continue;
      if (!strike) continue;
      a.troops = Math.max(0, a.troops - BALANCE.COMBAT_KILL_PER_TICK);
      b.troops = Math.max(0, b.troops - BALANCE.COMBAT_KILL_PER_TICK);
      events.push({
        kind: "clash",
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        state: nearestState((a.x + b.x) / 2, (a.y + b.y) / 2),
      });
    }
  }
  state.armies = state.armies.filter((a) => a.troops > 0);
}

function resolveSieges(state: RoomState, events: GameEvent[], strike: boolean) {
  const traveling: Army[] = [];
  const atDest = new Map<string, Army[]>();
  for (const army of state.armies) {
    if (!army.arrived && army.progress < 1) {
      traveling.push(army);
      continue;
    }
    army.arrived = true;
    const list = atDest.get(army.to) ?? [];
    list.push(army);
    atDest.set(army.to, list);
  }

  const keep: Army[] = [...traveling];
  for (const [to, armies] of atDest) {
    const dest = state.territories[to];
    if (!dest) continue;
    const destFaction = factionOf(state, dest.ownerId);
    const assault: Army[] = [];
    const reinforce: Army[] = [];

    for (const army of armies) {
      // 修复体验问题: 进攻中立州也要战斗,不能直接占领
      const isNeutral = !dest.ownerId;
      const isFriendly = dest.ownerId === army.ownerId || destFaction === army.faction;

      if (isFriendly && !isNeutral) {
        // 只有非中立的友方领土才能直接增援
        reinforce.push(army);
      } else {
        // 中立州和敌方领土都需要战斗
        assault.push(army);
      }
    }

    // 先处理增援
    for (const army of reinforce) {
      dest.troops = dest.troops + army.troops;
    }

    if (!assault.length) continue;

    const meta = MAP.states[to];
    const atkTotal = assault.reduce((sum, a) => sum + a.troops, 0);
    const defTotal = dest.troops;

    // 修复战斗结算核心bug: 攻守双方互相消耗
    if (atkTotal > defTotal) {
      // 攻击方胜利: 扣除守军后占领
      const survivors = atkTotal - defTotal;
      captureWith(state, dest, to, assault, survivors, events);
    } else {
      // 守军胜利: 攻击方全歼,守军扣除攻击兵力
      dest.troops = Math.max(0, defTotal - atkTotal);
      events.push({ kind: "clash", x: meta.cx, y: meta.cy, state: to });
    }
  }
  state.armies = keep;
}

function deductTroops(armies: Army[], n: number) {
  let left = n;
  for (const a of armies) {
    if (left <= 0) break;
    const take = Math.min(a.troops, left);
    a.troops -= take;
    left -= take;
  }
}

function captureWith(state: RoomState, dest: Territory, to: string, armies: Army[], survivors: number, events: GameEvent[]) {
  const lead = armies[0];

  dest.ownerId = assignOwner(state, lead.ownerId, to);
  dest.troops = Math.max(1, survivors);  // 至少留1兵占领
  dest.startTroops = dest.troops;
  events.push({ kind: "capture", state: to, faction: lead.faction });
}

function runAI(state: RoomState, events: GameEvent[]) {
  const period = Math.max(6, Math.round((BALANCE.AI_THINK_SEC * 1000) / TICK_MS));
  for (const p of state.players) {
    if (!p.isAI || state.phase !== "playing") continue;
    const stagger = p.zone === "east" ? 3 : 0;
    if ((state.tick + stagger) % period !== 0) continue;
    const ctx = aiContext(state, p.id);
    if (!ctx) continue;
    const orders = decideAiOrders(ctx);
    for (const order of orders) {
      const err = sendArmy(state, p.id, order.from, order.to, order.sendRatio);
      if (!err) events.push({ kind: "send", from: order.from, to: order.to, faction: p.faction });
    }
  }
}

function aiContext(state: RoomState, playerId: string): AiContext | null {
  const me = state.players.find((p) => p.id === playerId);
  if (!me) return null;
  const team = me.faction === "trump" ? "red" : "blue";
  const split = state.mode === "2v2";
  const states: AiStateView[] = Object.entries(state.territories).map(([id, t]) => {
    const f = factionOf(state, t.ownerId);
    const owner = !t.ownerId || !f ? "neutral" : f === "trump" ? "red" : "blue";
    return {
      id: id as StateId,
      owner,
      troops: t.troops,
      isHome: me.home === id,
      inMyHalf: !split || controlBank(id) === me.zone,
    };
  });
  const allyStateIds =
    split
      ? new Set(
          Object.entries(state.territories)
            .filter(([, t]) => {
              const owner = state.players.find((x) => x.id === t.ownerId);
              return !!owner && owner.faction === me.faction && owner.id !== me.id;
            })
            .map(([id]) => id as StateId),
        )
      : undefined;
  const neighbors = ADJACENT as unknown as Readonly<Record<StateId, readonly StateId[]>>;
  return {
    team,
    enemyTeam: team === "red" ? "blue" : "red",
    states,
    neighbors,
    allyStateIds,
  };
}

function assignOwner(state: RoomState, capturerId: string, stateId: string): string {
  if (state.mode !== "2v2") return capturerId;
  const cap = state.players.find((p) => p.id === capturerId);
  if (!cap) return capturerId;
  const half = controlBank(stateId);
  if (cap.zone === half) return capturerId;
  const mate = state.players.find((p) => p.faction === cap.faction && p.zone === half);
  return mate?.id ?? capturerId;
}

export function nearestState(x: number, y: number): string {
  let best = "CA";
  let d = Infinity;
  for (const [id, m] of Object.entries(MAP.states)) {
    const n = Math.hypot(m.cx - x, m.cy - y);
    if (n < d) {
      d = n;
      best = id;
    }
  }
  return best;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
