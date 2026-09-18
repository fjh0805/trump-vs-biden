/**
 * 修订数值真理源（特朗普验算版）
 *
 * 目标：一局 4–5 分钟；前 2 分钟约扩到 8–12 州；交火时长 ≈ min(兵力)*COMBAT_TICK_SEC ≥ 3s（12v12）
 * 作废：1兵/1.2s、上限50、交火0.1s；生产上限40只向上填充，增援可叠过上限
 */

export const BALANCE = {
  HOME_START_TROOPS: 12,
  NEUTRAL_START: { small: 5, medium: 7, large: 9 } as const,
  PROD_INTERVAL_SEC: 2.0,
  HOME_PROD_INTERVAL_SEC: 1.6,
  NEUTRAL_PROD_INTERVAL_SEC: 3.0,
  TROOP_CAP: 40,
  NEUTRAL_TROOP_CAP: 12,
  DEFAULT_SEND_RATIO: 1,
  SEND_RATIOS: [0.25, 0.5, 1.0] as const,
  COMBAT_TICK_SEC: 0.25,
  COMBAT_KILL_PER_TICK: 1,
  WIN_STATE_COUNT: 26,
  MATCH_TIME_SEC: 270,
  AI_THINK_SEC: 0.7,
  DEFEND_THREAT_RATIO: 0.8,
  ATTACK_ADVANTAGE_RATIO: 1.0,
  SWEEP_ENEMY_MAX: 12,
  SWEEP_SELF_MIN: 5,
  SUPPORT_ALLY_MAX: 6,
  ATTACK_SEND_RATIO: 1.0,
  DEFEND_SEND_RATIO: 0.5,
  SUPPORT_SEND_RATIO: 0.45,
  RICH_MIN_TROOPS: 5,
} as const;

export type Balance = typeof BALANCE;

export function estimateCombatSeconds(a: number, b: number): number {
  return Math.min(a, b) * BALANCE.COMBAT_TICK_SEC;
}

export function troopsPerSecond(isHome: boolean): number {
  const interval = isHome ? BALANCE.HOME_PROD_INTERVAL_SEC : BALANCE.PROD_INTERVAL_SEC;
  return 1 / interval;
}

export function neutralTroopsPerSecond(): number {
  return 1 / BALANCE.NEUTRAL_PROD_INTERVAL_SEC;
}
