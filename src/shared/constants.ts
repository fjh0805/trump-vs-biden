import { BALANCE } from "./balance";
import {
  BLUE_HOME_CANDIDATES,
  RED_HOME_CANDIDATES,
  STATE_BY_ID,
  WEST_COAST_PLAYABLE,
  calloutName,
  type StateId,
} from "./state-labels";

export { BALANCE };
export const TICK_MS = 100;
export const ROUND_MS = BALANCE.MATCH_TIME_SEC * 1000;
export const MAJORITY = BALANCE.WIN_STATE_COUNT;
export const MAX_TROOPS = BALANCE.TROOP_CAP;
export const PROD_MS = BALANCE.PROD_INTERVAL_SEC * 1000;
export const HOME_PROD_MS = BALANCE.HOME_PROD_INTERVAL_SEC * 1000;
export const COMBAT_LOSS = BALANCE.COMBAT_KILL_PER_TICK;
export const COMBAT_MS = BALANCE.COMBAT_TICK_SEC * 1000;
export const DEFAULT_SEND: number = BALANCE.DEFAULT_SEND_RATIO;
export const HOME_TROOPS = BALANCE.HOME_START_TROOPS;
export const NEUTRAL_SMALL = BALANCE.NEUTRAL_START.small;
export const NEUTRAL_MED = BALANCE.NEUTRAL_START.medium;
export const NEUTRAL_LARGE = BALANCE.NEUTRAL_START.large;
export const NEUTRAL_TROOPS = BALANCE.NEUTRAL_START.medium;
export const HOST_HOLD_MS = 60_000;
export const PEER_WAIT_MS = 15_000;
export const CODE_LENGTH = 4;
export const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY23456789";
export const STATE_COUNT = 48;

export function labelZh(id: string): string {
  return calloutName(id as StateId);
}

export function labelEn(id: string): string {
  return STATE_BY_ID[id as StateId]?.en ?? id;
}

export type Faction = "trump" | "biden";
export type Zone = "west" | "east";
export type Mode = "1v1" | "2v2";
export type Phase = "lobby" | "playing" | "ended";
export type HomeId = "TX" | "FL" | "OH" | "CA" | "NY" | "PA";

export const HOMES: Record<Faction, HomeId[]> = {
  trump: [...RED_HOME_CANDIDATES] as HomeId[],
  biden: [...BLUE_HOME_CANDIDATES] as HomeId[],
};

export const HOME_ZH: Record<HomeId, string> = {
  TX: calloutName("TX"),
  FL: calloutName("FL"),
  OH: calloutName("OH"),
  CA: calloutName("CA"),
  NY: calloutName("NY"),
  PA: calloutName("PA"),
};

export const WEST_CONTROL = new Set<string>(WEST_COAST_PLAYABLE);

export const WEST_ZH = WEST_COAST_PLAYABLE.map((id) => calloutName(id)).join("、");

export function controlBank(id: string): Zone {
  return WEST_CONTROL.has(id) ? "west" : "east";
}

export function homesInBank(faction: Faction, zone: Zone): HomeId[] {
  return HOMES[faction].filter((h) => controlBank(h) === zone);
}

export function resolveHome(faction: Faction, pick: string, zone?: Zone): HomeId {
  const pool = zone ? homesInBank(faction, zone) : HOMES[faction];
  const list = pool.length ? pool : HOMES[faction];
  if (pick !== "random" && list.includes(pick as HomeId)) return pick as HomeId;
  return list[Math.floor(Math.random() * list.length)];
}

/** 统一的行军时长计算(秒) - 客户端和服务端共用 */
export function armyTravelSeconds(distanceInMapUnits: number): number {
  return Math.min(4.6, Math.max(1.15, distanceInMapUnits / 140));
}

export const ADJACENT: Record<string, string[]> = {
  AL: ["MS", "TN", "GA", "FL"],
  AZ: ["CA", "NV", "UT", "CO", "NM"],
  AR: ["MO", "TN", "MS", "LA", "TX", "OK"],
  CA: ["OR", "NV", "AZ"],
  CO: ["WY", "NE", "KS", "OK", "NM", "AZ", "UT"],
  CT: ["NY", "MA", "RI"],
  DE: ["MD", "PA", "NJ"],
  FL: ["AL", "GA"],
  GA: ["FL", "AL", "TN", "NC", "SC"],
  ID: ["MT", "WY", "UT", "NV", "OR", "WA"],
  IL: ["WI", "IA", "MO", "KY", "IN"],
  IN: ["IL", "KY", "OH", "MI"],
  IA: ["MN", "WI", "IL", "MO", "NE", "SD"],
  KS: ["NE", "MO", "OK", "CO"],
  KY: ["IL", "IN", "OH", "WV", "VA", "TN", "MO"],
  LA: ["TX", "AR", "MS"],
  ME: ["NH"],
  MD: ["VA", "WV", "PA", "DE"],
  MA: ["NY", "VT", "NH", "RI", "CT"],
  MI: ["OH", "IN", "WI"],
  MN: ["ND", "SD", "IA", "WI"],
  MS: ["LA", "AR", "TN", "AL"],
  MO: ["IA", "IL", "KY", "TN", "AR", "OK", "KS", "NE"],
  MT: ["ID", "WY", "SD", "ND"],
  NE: ["SD", "IA", "MO", "KS", "CO", "WY"],
  NV: ["OR", "ID", "UT", "AZ", "CA"],
  NH: ["VT", "ME", "MA"],
  NJ: ["NY", "PA", "DE"],
  NM: ["AZ", "UT", "CO", "OK", "TX"],
  NY: ["PA", "NJ", "CT", "MA", "VT"],
  NC: ["VA", "TN", "GA", "SC"],
  ND: ["MT", "SD", "MN"],
  OH: ["MI", "IN", "KY", "WV", "PA"],
  OK: ["KS", "MO", "AR", "TX", "NM", "CO"],
  OR: ["WA", "ID", "NV", "CA"],
  PA: ["NY", "NJ", "DE", "MD", "WV", "OH"],
  RI: ["CT", "MA"],
  SC: ["NC", "GA"],
  SD: ["ND", "MN", "IA", "NE", "WY", "MT"],
  TN: ["KY", "VA", "NC", "GA", "AL", "MS", "AR", "MO"],
  TX: ["NM", "OK", "AR", "LA"],
  UT: ["ID", "WY", "CO", "NM", "AZ", "NV"],
  VT: ["NY", "NH", "MA"],
  VA: ["MD", "WV", "KY", "TN", "NC"],
  WA: ["OR", "ID"],
  WV: ["PA", "MD", "VA", "KY", "OH"],
  WI: ["MN", "IA", "IL", "MI"],
  WY: ["MT", "SD", "NE", "CO", "UT", "ID"],
};

/** 共建高频邻接；并入 ADJACENT，完整邻接仍以烘焙表为准。 */
export const ADJACENT_HINTS: Record<string, readonly string[]> = {
  TX: ["NM", "OK", "AR", "LA"],
  CA: ["OR", "NV", "AZ"],
  NY: ["PA", "NJ", "CT", "MA", "VT"],
  FL: ["GA", "AL"],
  PA: ["NY", "NJ", "OH", "WV", "MD", "DE"],
  OH: ["PA", "MI", "IN", "KY", "WV"],
  IL: ["WI", "IN", "KY", "MO", "IA"],
};

for (const [a, ns] of Object.entries(ADJACENT_HINTS)) {
  ADJACENT[a] = [...new Set([...(ADJACENT[a] ?? []), ...ns])];
  for (const b of ns) {
    ADJACENT[b] = [...new Set([...(ADJACENT[b] ?? []), a])];
  }
}

export const RULES_ZH = [
  "点自己亮着的州，有视野就能出兵抢地。",
  "迷雾只亮你领地和部队周围一圈，靠边打边探。",
  "建房拿房间码，好友输码进房；开麦报州名，州多的赢。",
];
