export type StateId =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "FL" | "GA"
  | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME" | "MD"
  | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH" | "NJ"
  | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI" | "SC"
  | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI" | "WY";

export interface StateLabel {
  id: StateId;
  en: string;
  zh: string;
  shortZh: string;
}

export const STATE_LABELS: readonly StateLabel[] = [
  { id: "AL", en: "Alabama", zh: "阿拉巴马", shortZh: "阿拉巴马" },
  { id: "AK", en: "Alaska", zh: "阿拉斯加", shortZh: "阿拉斯加" },
  { id: "AZ", en: "Arizona", zh: "亚利桑那", shortZh: "亚利桑那" },
  { id: "AR", en: "Arkansas", zh: "阿肯色", shortZh: "阿肯色" },
  { id: "CA", en: "California", zh: "加利福尼亚", shortZh: "加州" },
  { id: "CO", en: "Colorado", zh: "科罗拉多", shortZh: "科罗拉多" },
  { id: "CT", en: "Connecticut", zh: "康涅狄格", shortZh: "康涅狄格" },
  { id: "DE", en: "Delaware", zh: "特拉华", shortZh: "特拉华" },
  { id: "FL", en: "Florida", zh: "佛罗里达", shortZh: "佛州" },
  { id: "GA", en: "Georgia", zh: "乔治亚", shortZh: "乔治亚" },
  { id: "HI", en: "Hawaii", zh: "夏威夷", shortZh: "夏威夷" },
  { id: "ID", en: "Idaho", zh: "爱达荷", shortZh: "爱达荷" },
  { id: "IL", en: "Illinois", zh: "伊利诺伊", shortZh: "伊利诺伊" },
  { id: "IN", en: "Indiana", zh: "印第安纳", shortZh: "印第安纳" },
  { id: "IA", en: "Iowa", zh: "艾奥瓦", shortZh: "艾奥瓦" },
  { id: "KS", en: "Kansas", zh: "堪萨斯", shortZh: "堪萨斯" },
  { id: "KY", en: "Kentucky", zh: "肯塔基", shortZh: "肯塔基" },
  { id: "LA", en: "Louisiana", zh: "路易斯安那", shortZh: "路易斯安那" },
  { id: "ME", en: "Maine", zh: "缅因", shortZh: "缅因" },
  { id: "MD", en: "Maryland", zh: "马里兰", shortZh: "马里兰" },
  { id: "MA", en: "Massachusetts", zh: "马萨诸塞", shortZh: "马萨诸塞" },
  { id: "MI", en: "Michigan", zh: "密歇根", shortZh: "密歇根" },
  { id: "MN", en: "Minnesota", zh: "明尼苏达", shortZh: "明尼苏达" },
  { id: "MS", en: "Mississippi", zh: "密西西比", shortZh: "密西西比" },
  { id: "MO", en: "Missouri", zh: "密苏里", shortZh: "密苏里" },
  { id: "MT", en: "Montana", zh: "蒙大拿", shortZh: "蒙大拿" },
  { id: "NE", en: "Nebraska", zh: "内布拉斯加", shortZh: "内布拉斯加" },
  { id: "NV", en: "Nevada", zh: "内华达", shortZh: "内华达" },
  { id: "NH", en: "New Hampshire", zh: "新罕布什尔", shortZh: "新罕布什尔" },
  { id: "NJ", en: "New Jersey", zh: "新泽西", shortZh: "新泽西" },
  { id: "NM", en: "New Mexico", zh: "新墨西哥", shortZh: "新墨西哥" },
  { id: "NY", en: "New York", zh: "纽约", shortZh: "纽约" },
  { id: "NC", en: "North Carolina", zh: "北卡罗来纳", shortZh: "北卡" },
  { id: "ND", en: "North Dakota", zh: "北达科他", shortZh: "北达科他" },
  { id: "OH", en: "Ohio", zh: "俄亥俄", shortZh: "俄亥俄" },
  { id: "OK", en: "Oklahoma", zh: "俄克拉荷马", shortZh: "俄克拉荷马" },
  { id: "OR", en: "Oregon", zh: "俄勒冈", shortZh: "俄勒冈" },
  { id: "PA", en: "Pennsylvania", zh: "宾夕法尼亚", shortZh: "宾州" },
  { id: "RI", en: "Rhode Island", zh: "罗德岛", shortZh: "罗德岛" },
  { id: "SC", en: "South Carolina", zh: "南卡罗来纳", shortZh: "南卡" },
  { id: "SD", en: "South Dakota", zh: "南达科他", shortZh: "南达科他" },
  { id: "TN", en: "Tennessee", zh: "田纳西", shortZh: "田纳西" },
  { id: "TX", en: "Texas", zh: "得克萨斯", shortZh: "德州" },
  { id: "UT", en: "Utah", zh: "犹他", shortZh: "犹他" },
  { id: "VT", en: "Vermont", zh: "佛蒙特", shortZh: "佛蒙特" },
  { id: "VA", en: "Virginia", zh: "弗吉尼亚", shortZh: "弗吉尼亚" },
  { id: "WA", en: "Washington", zh: "华盛顿", shortZh: "华盛顿州" },
  { id: "WV", en: "West Virginia", zh: "西弗吉尼亚", shortZh: "西弗吉尼亚" },
  { id: "WI", en: "Wisconsin", zh: "威斯康星", shortZh: "威斯康星" },
  { id: "WY", en: "Wyoming", zh: "怀俄明", shortZh: "怀俄明" },
] as const;

export const STATE_BY_ID: Readonly<Record<StateId, StateLabel>> = Object.fromEntries(
  STATE_LABELS.map((s) => [s.id, s]),
) as Record<StateId, StateLabel>;

export const RED_HOME_CANDIDATES: readonly StateId[] = ["TX", "FL", "OH"];
export const BLUE_HOME_CANDIDATES: readonly StateId[] = ["CA", "NY", "PA"];

export const WEST_COAST_PLAYABLE: readonly StateId[] = [
  "WA", "OR", "CA", "NV", "AZ", "UT", "ID", "MT", "WY", "CO", "NM", "AK", "HI",
  "TX", "OK", "KS", "NE", "SD", "ND",
];

export const EAST_COAST_PLAYABLE: readonly StateId[] = STATE_LABELS
  .map((s) => s.id)
  .filter((id) => !WEST_COAST_PLAYABLE.includes(id));

export const ATTACK_VALUE: Readonly<Partial<Record<StateId, number>>> = {
  CA: 100, TX: 100, NY: 100, FL: 100, PA: 100,
  OH: 70, IL: 70, GA: 70, NC: 70, MI: 70,
};

export function calloutName(id: StateId): string {
  return STATE_BY_ID[id]?.shortZh ?? id;
}
