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
  NEUTRAL_TROOP_CAP: 9, // 修复: 降低中立州上限,从12降到9,避免中立州过于难打
  DEFAULT_SEND_RATIO: 1,
  SEND_RATIOS: [0.25, 0.5, 1.0] as const,
  COMBAT_TICK_SEC: 0.25,
  COMBAT_KILL_PER_TICK: 1,
  WIN_STATE_COUNT: 26,
  MATCH_TIME_SEC: 270,
  AI_THINK_SEC: 0.5,  // 修复: 从 0.7 降低到 0.5,AI 反应更快
  DEFEND_THREAT_RATIO: 0.7,  // 修复: 从 0.8 降低到 0.7,AI 更早防守
  ATTACK_ADVANTAGE_RATIO: 0.85,  // 修复: 从 1.0 降低到 0.85,AI 更激进进攻
  SWEEP_ENEMY_MAX: 15,  // 修复: 从 12 提升到 15,AI 敢打更多敌兵
  SWEEP_SELF_MIN: 4,  // 修复: 从 5 降低到 4,AI 更早出兵
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
