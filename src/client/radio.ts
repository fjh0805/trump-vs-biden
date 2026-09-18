import { BANTER, pickLine, type BanterCat } from "../shared/banter";

const MAX = 8;

export function pushRadio(cat: BanterCat, text: string) {
  const box = document.getElementById("radio");
  const feed = document.getElementById("radio-feed");
  if (!box || !feed) return;
  box.dataset.cat = cat;
  const tag = box.querySelector(".radio-cat");
  const line = box.querySelector(".radio-line");
  if (tag) tag.textContent = `【${cat}】`;
  if (line) {
    line.textContent = text;
    line.classList.remove("pop");
    void (line as HTMLElement).offsetWidth;
    line.classList.add("pop");
  }
  const row = document.createElement("div");
  row.className = "radio-item";
  row.innerHTML = `<b>【${cat}】</b><span>${escapeHtml(text)}</span>`;
  feed.prepend(row);
  while (feed.children.length > MAX) feed.lastElementChild?.remove();
}

export function linesForEnd(opts: {
  won: boolean;
  draw: boolean;
  winner: "trump" | "biden" | "draw" | null;
  mode: "1v1" | "2v2";
  byTroops: boolean;
}): string[] {
  if (opts.draw) return [BANTER.失败[1], BANTER.胜利[3]];
  const cat: BanterCat = opts.won ? "胜利" : "失败";
  const out: string[] = [];
  if (opts.won) {
    out.push(BANTER.胜利[0]);
    if (opts.byTroops) out.push(BANTER.胜利[4]);
    else out.push(BANTER.胜利[5]);
    if (opts.winner === "trump") out.push(BANTER.胜利[6]);
    if (opts.winner === "biden") out.push(BANTER.胜利[7]);
    if (opts.mode === "2v2") out.push(BANTER.胜利[8]);
    out.push(BANTER.胜利[3]);
  } else {
    out.push(BANTER.失败[0]);
    out.push(opts.byTroops ? BANTER.失败[2] : BANTER.失败[6]);
    out.push(BANTER.失败[7]);
  }
  for (const extra of [pickLine(cat), pickLine(cat)]) {
    if (!out.includes(extra)) out.push(extra);
  }
  return out.slice(0, 5);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
