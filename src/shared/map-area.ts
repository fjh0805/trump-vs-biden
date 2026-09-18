import { BALANCE } from "./balance";
import mapJson from "./us-map.json";

const MAP = mapJson as { states: Record<string, { id: string; d: string }> };

function pathArea(d: string): number {
  const cmds = d.match(/[MLZmlz][^MLZmlz]*/g) ?? [];
  let total = 0;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let acc = 0;
  const lineTo = (nx: number, ny: number) => {
    acc += x * ny - nx * y;
    x = nx;
    y = ny;
  };
  for (const raw of cmds) {
    const t = raw[0]!;
    const nums = raw
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (t === "M" || t === "m") {
      if (!nums.length) continue;
      x = t === "M" ? nums[0]! : x + nums[0]!;
      y = t === "M" ? nums[1]! : y + nums[1]!;
      sx = x;
      sy = y;
      for (let i = 2; i + 1 < nums.length; i += 2) {
        lineTo(t === "M" ? nums[i]! : x + nums[i]!, t === "M" ? nums[i + 1]! : y + nums[i + 1]!);
      }
    } else if (t === "L" || t === "l") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        lineTo(t === "L" ? nums[i]! : x + nums[i]!, t === "L" ? nums[i + 1]! : y + nums[i + 1]!);
      }
    } else if (t === "Z" || t === "z") {
      lineTo(sx, sy);
      total += Math.abs(acc) / 2;
      acc = 0;
    }
  }
  if (acc) total += Math.abs(acc) / 2;
  return total;
}

const ranked = Object.values(MAP.states)
  .map((s) => ({ id: s.id, area: pathArea(s.d) }))
  .sort((a, b) => a.area - b.area);

const NEUTRAL: Record<string, number> = {};
const third = Math.ceil(ranked.length / 3);
for (let i = 0; i < ranked.length; i++) {
  const band = i < third ? BALANCE.NEUTRAL_START.small : i < third * 2 ? BALANCE.NEUTRAL_START.medium : BALANCE.NEUTRAL_START.large;
  NEUTRAL[ranked[i]!.id] = band;
}

export function neutralTroops(id: string): number {
  return NEUTRAL[id] ?? BALANCE.NEUTRAL_START.medium;
}
