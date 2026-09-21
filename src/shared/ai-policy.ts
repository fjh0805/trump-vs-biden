import { ATTACK_VALUE, type StateId } from "./state-labels";
import { BALANCE } from "./balance";

export type TeamId = "red" | "blue";
export type AiIntent = "defend" | "support" | "attack" | "idle";

export interface AiStateView {
  id: StateId;
  owner: TeamId | "neutral" | null;
  troops: number;
  isHome?: boolean;
  inMyHalf?: boolean;
}

export interface AiContext {
  team: TeamId;
  enemyTeam: TeamId;
  states: readonly AiStateView[];
  neighbors: Readonly<Record<StateId, readonly StateId[]>>;
  allyStateIds?: ReadonlySet<StateId>;
}

export interface AiOrder {
  intent: AiIntent;
  from: StateId;
  to: StateId;
  sendRatio: number;
  reason: string;
}

function byId(ctx: AiContext): Map<StateId, AiStateView> {
  return new Map(ctx.states.map((s) => [s.id, s]));
}

function mine(ctx: AiContext, s: AiStateView): boolean {
  return s.owner === ctx.team && s.inMyHalf !== false;
}

function enemyOwned(ctx: AiContext, s: AiStateView): boolean {
  return s.owner === ctx.enemyTeam;
}

function attackScore(id: StateId): number {
  return ATTACK_VALUE[id] ?? 10;
}

/** 防守 > 支援 > 进攻；兼容旧接口，每次最多 1 条 */
export function decideAiOrder(ctx: AiContext): AiOrder | null {
  return decideAiOrders(ctx)[0] ?? null;
}

/** 防守与进攻可并行时最多 2 条命令 */
export function decideAiOrders(ctx: AiContext): AiOrder[] {
  const map = byId(ctx);
  const myStates = ctx.states.filter((s) => mine(ctx, s));
  if (myStates.length === 0) return [];

  const defend = pickDefend(ctx, map, myStates);
  const attack = pickAttack(ctx, map, myStates);
  if (myStates.length < 8 && attack) return [attack];
  if (defend && attack && defend.from !== attack.from) {
    return [defend, attack];
  }

  if (defend) return [defend];

  const support = pickSupport(ctx, map, myStates);
  if (support && attack && support.from !== attack.from) {
    return [support, attack];
  }
  if (support) return [support];
  if (attack) return [attack];
  return [];
}

function pickDefend(
  ctx: AiContext,
  map: Map<StateId, AiStateView>,
  myStates: AiStateView[],
): AiOrder | null {
  type Threat = { state: AiStateView; pressure: number };
  const threats: Threat[] = [];

  for (const s of myStates) {
    const neigh = ctx.neighbors[s.id] ?? [];
    let pressure = 0;
    for (const nid of neigh) {
      const n = map.get(nid);
      if (!n || !enemyOwned(ctx, n)) continue;
      pressure = Math.max(pressure, n.troops);
    }
    const threatened = pressure >= s.troops * BALANCE.DEFEND_THREAT_RATIO;
    if (threatened) threats.push({ state: s, pressure });
  }
  if (threats.length === 0) return null;

  threats.sort((a, b) => b.pressure - a.pressure || a.state.troops - b.state.troops);
  const target = threats[0].state;

  const donors = myStates
    .filter((s) => s.id !== target.id && s.troops >= BALANCE.RICH_MIN_TROOPS)
    .sort((a, b) => b.troops - a.troops);

  // 兜底策略: 如果没有富裕州,从兵力最多的州支援(即使低于阈值)
  if (donors.length === 0) {
    const fallbackDonors = myStates
      .filter((s) => s.id !== target.id && s.troops >= 2)
      .sort((a, b) => b.troops - a.troops);
    if (fallbackDonors.length === 0) return null;
    const donor = fallbackDonors[0];
    return {
      intent: "defend",
      from: donor.id,
      to: target.id,
      sendRatio: BALANCE.DEFEND_SEND_RATIO,
      reason: `emergency defend ${target.id} vs pressure (fallback)`,
    };
  }

  const adjacentDonor =
    donors.find((d) => (ctx.neighbors[d.id] ?? []).includes(target.id)) ?? donors[0];

  return {
    intent: "defend",
    from: adjacentDonor.id,
    to: target.id,
    sendRatio: BALANCE.DEFEND_SEND_RATIO,
    reason: `defend ${target.id} vs pressure`,
  };
}

function pickSupport(
  ctx: AiContext,
  map: Map<StateId, AiStateView>,
  myStates: AiStateView[],
): AiOrder | null {
  const allyIds = ctx.allyStateIds;
  if (!allyIds || allyIds.size === 0) return null;

  const needy: AiStateView[] = [];
  for (const id of allyIds) {
    const s = map.get(id);
    if (!s || s.owner !== ctx.team) continue;
    if (s.troops >= BALANCE.SUPPORT_ALLY_MAX) continue;
    const hasEnemyNeighbor = (ctx.neighbors[id] ?? []).some((nid) => {
      const n = map.get(nid);
      return Boolean(n && enemyOwned(ctx, n));
    });
    if (hasEnemyNeighbor) needy.push(s);
  }
  if (needy.length === 0) return null;
  needy.sort((a, b) => a.troops - b.troops);
  const target = needy[0];

  const donors = myStates
    .filter((s) => s.troops >= BALANCE.RICH_MIN_TROOPS)
    .sort((a, b) => b.troops - a.troops);
  if (donors.length === 0) return null;
  const donor =
    donors.find((d) => (ctx.neighbors[d.id] ?? []).includes(target.id)) ?? donors[0];

  return {
    intent: "support",
    from: donor.id,
    to: target.id,
    sendRatio: BALANCE.SUPPORT_SEND_RATIO,
    reason: `support ally ${target.id}`,
  };
}

function pickAttack(
  ctx: AiContext,
  map: Map<StateId, AiStateView>,
  myStates: AiStateView[],
): AiOrder | null {
  type Cand = { from: StateId; to: StateId; score: number };
  const cands: Cand[] = [];

  for (const s of myStates) {
    if (s.troops < BALANCE.RICH_MIN_TROOPS) continue;

    const targets = new Set<StateId>(ctx.neighbors[s.id] ?? []);
    for (const t of ctx.states) {
      if (t.id === s.id) continue;
      if (t.owner === ctx.team) continue;
      const val = attackScore(t.id);
      const weakEnemyHome = enemyOwned(ctx, t) && Boolean(t.isHome) && t.troops <= s.troops;
      const highValue = val >= 70;
      const softNeutral =
        (t.owner === "neutral" || t.owner == null) && t.troops <= BALANCE.SWEEP_ENEMY_MAX + 4;
      if (highValue || weakEnemyHome || softNeutral) targets.add(t.id);
    }

    for (const nid of targets) {
      const n = map.get(nid);
      if (!n) continue;
      if (n.owner === ctx.team) continue;

      const enemyTroops = n.troops;
      const advantage = s.troops >= enemyTroops * BALANCE.ATTACK_ADVANTAGE_RATIO;
      const sweep =
        enemyTroops <= BALANCE.SWEEP_ENEMY_MAX && s.troops >= BALANCE.SWEEP_SELF_MIN;
      const commit =
        s.troops > enemyTroops && s.troops >= BALANCE.RICH_MIN_TROOPS + 2;
      if (!advantage && !sweep && !commit) continue;

      const adjacentBonus = (ctx.neighbors[s.id] ?? []).includes(nid) ? 8 : 0;
      const score =
        attackScore(nid) +
        (s.troops - enemyTroops) +
        adjacentBonus +
        (n.owner === "neutral" || n.owner == null ? 5 : 0) +
        (enemyOwned(ctx, n) && n.isHome ? 12 : 0);
      cands.push({ from: s.id, to: nid, score });
    }
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  return {
    intent: "attack",
    from: best.from,
    to: best.to,
    sendRatio: BALANCE.ATTACK_SEND_RATIO,
    reason: `attack ${best.to}`,
  };
}
