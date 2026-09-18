import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { feature } from "topojson-client";
import { geoAlbers, geoPath } from "d3-geo";

const FIPS_TO_POSTAL = {
  "01": "AL",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "12": "FL",
  "13": "GA",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

const ZH = {
  AL: "阿拉巴马",
  AK: "阿拉斯加",
  AZ: "亚利桑那",
  AR: "阿肯色",
  CA: "加州",
  CO: "科罗拉多",
  CT: "康涅狄格",
  DE: "特拉华",
  DC: "特区",
  FL: "佛州",
  GA: "乔治亚",
  HI: "夏威夷",
  ID: "爱达荷",
  IL: "伊利诺伊",
  IN: "印第安纳",
  IA: "爱荷华",
  KS: "堪萨斯",
  KY: "肯塔基",
  LA: "路易斯安那",
  ME: "缅因",
  MD: "马里兰",
  MA: "麻州",
  MI: "密歇根",
  MN: "明尼苏达",
  MS: "密西西比",
  MO: "密苏里",
  MT: "蒙大拿",
  NE: "内布拉斯加",
  NV: "内华达",
  NH: "新罕布什尔",
  NJ: "新泽西",
  NM: "新墨西哥",
  NY: "纽约",
  NC: "北卡",
  ND: "北达科他",
  OH: "俄亥俄",
  OK: "俄克拉荷马",
  OR: "俄勒冈",
  PA: "宾州",
  RI: "罗德岛",
  SC: "南卡",
  SD: "南达科他",
  TN: "田纳西",
  TX: "德州",
  UT: "犹他",
  VT: "佛蒙特",
  VA: "弗吉尼亚",
  WA: "华盛顿",
  WV: "西弗",
  WI: "威斯康星",
  WY: "怀俄明",
};

const INCOME = {
  CA: 14,
  TX: 11,
  FL: 9,
  NY: 8,
  PA: 6,
  IL: 6,
  OH: 5,
  GA: 5,
  NC: 5,
  MI: 5,
  NJ: 4,
  VA: 4,
  WA: 4,
  AZ: 4,
  TN: 4,
  MA: 4,
  IN: 4,
  MO: 3,
  MD: 3,
  WI: 3,
  MN: 3,
  CO: 3,
  SC: 3,
  AL: 3,
  LA: 3,
  KY: 3,
  OR: 3,
  OK: 3,
  CT: 3,
  UT: 2,
  IA: 2,
  NV: 2,
  AR: 2,
  MS: 2,
  KS: 2,
  NM: 2,
  NE: 2,
  ID: 2,
  WV: 2,
  NH: 2,
  ME: 2,
  MT: 2,
  RI: 2,
  DE: 2,
  SD: 2,
  ND: 2,
  VT: 2,
  WY: 2,
};

const topology = JSON.parse(readFileSync("/tmp/states-10m.json", "utf8"));
const collection = feature(topology, topology.objects.states);
const projection = geoAlbers()
  .rotate([96, 0])
  .center([-0.6, 38.2])
  .parallels([29.5, 45.5])
  .scale(1280)
  .translate([490, 305]);
const path = geoPath(projection).digits(1);

const states = {};
for (const f of collection.features) {
  const postal = FIPS_TO_POSTAL[f.id];
  if (!postal) continue;
  const d = path(f);
  const [cx, cy] = path.centroid(f);
  if (!d) continue;
  states[postal] = {
    id: postal,
    name: f.properties.name,
    zh: ZH[postal],
    d,
    cx: Math.round(cx * 10) / 10,
    cy: Math.round(cy * 10) / 10,
    income: INCOME[postal] ?? 2,
  };
}

if (Object.keys(states).length !== 48) {
  throw new Error(`expected 48 states, got ${Object.keys(states).length}`);
}

mkdirSync("src/shared", { recursive: true });
writeFileSync(
  "src/shared/us-map.json",
  JSON.stringify({ viewBox: "0 0 960 600", states }, null, 0),
);
console.log("baked", Object.keys(states).length, "states");
