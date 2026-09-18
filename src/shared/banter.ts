/** Combat radio lines — keep punctuation and wording exact. Runtime may swap in real state shorts. */
export const BANTER = {
  出兵: [
    "出兵——目标锁定。",
    "部队离开根据地。",
    "向加州进发。",
    "德州方向，兵力已派出。",
    "增援上路。",
    "分兵两路，注意汇合。",
    "前线要人，已抽调。",
    "小股侦察先走。",
  ],
  交火: [
    "交火！双方接上了。",
    "纽约外围爆发冲突。",
    "兵力对撞，胶着中。",
    "佛州战线打响。",
    "我方火力压上去了。",
    "对方在抵抗，别停。",
    "遭遇战——报损失。",
    "宾州走廊打成一团。",
  ],
  破城: [
    "破城！拿下该州。",
    "加州易手。",
    "德州旗帜换了。",
    "占领完成，设防。",
    "俄亥俄易手。",
    "城破，补给线接上。",
    "新领地并入。",
    "伊利诺伊纳入控制。",
  ],
  迷雾揭开: [
    "迷雾散开——看见邻州了。",
    "视野扩大一圈。",
    "探明：前方是空州。",
    "揭开乔治亚方向。",
    "黑影里露出边境。",
    "侦察回报：有敌情。",
    "地图多亮一块。",
    "华盛顿州进入视野。",
  ],
  胜利: [
    "胜利——州数领先结算。",
    "我们做到了。",
    "全图优势到手。",
    "再来一局？",
    "兵力差拉开，胜。",
    "占领目标达成。",
    "红方胜出。",
    "蓝方胜出。",
    "双人同边通关。",
  ],
  失败: [
    "失败——州数落后。",
    "这局差一口气。",
    "兵力被打穿了。",
    "再开，换部署。",
    "根据地失守，结束。",
    "视野被压死，没翻盘。",
    "结算：对方州更多。",
    "输了，不骂人，重来。",
  ],
} as const;

export type BanterCat = keyof typeof BANTER;

const PLACE = ["华盛顿州", "伊利诺伊", "乔治亚", "俄亥俄", "加州", "德州", "佛州", "宾州", "纽约"] as const;

export function withState(line: string, zh?: string): string {
  if (!zh) return line;
  let out = line;
  for (const token of PLACE) {
    if (out.includes(token)) out = out.split(token).join(zh);
  }
  return out;
}

export function pickLine(cat: BanterCat, zh?: string, prefer?: (line: string) => boolean): string {
  const pool = [...BANTER[cat]];
  const ranked = prefer ? pool.filter(prefer) : [];
  const line = (ranked.length ? ranked : pool)[Math.floor(Math.random() * (ranked.length ? ranked.length : pool.length))];
  return withState(line, zh);
}
