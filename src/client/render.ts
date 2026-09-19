import { BALANCE } from "../shared/balance";
import { controlBank, labelEn, labelZh } from "../shared/constants";
import type { ArmyView, GameEvent, RoomSnapshot } from "../shared/protocol";
import mapJson from "../shared/us-map.json";
import { headFor } from "./avatars";
import { MapCamera } from "./camera";
import { sfxCapture, sfxClash, sfxSend } from "./sfx";

const MAP = mapJson as {
  viewBox: string;
  states: Record<string, { id: string; name: string; zh: string; d: string; cx: number; cy: number }>;
};

interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
}

interface Stream {
  id: string;
  from: string;
  to: string;
  faction: "trump" | "biden";
  troops: number;
  p: number;
  start: number;
  duration: number;
  arrivedAt: number;
  appliedDmg: boolean;
  cols: number;
  root: SVGGElement;
  line: SVGPathElement | null;
  head: SVGGElement;
  trailHeads: SVGGElement[];
  num: SVGTextElement;
}

export class GameView {
  svg: SVGSVGElement;
  fx: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  selected: string | null = null;
  origins = new Set<string>();
  dragTarget: string | null = null;
  private dragging = false;
  private dragStartedSelected = false;
  private dragPointer = { x: 0, y: 0 };
  private dragLine: SVGPathElement | null = null;
  ratio: number = 1;
  onSend: (from: string, to: string, ratio: number) => void = () => {};
  private armyLayer: SVGGElement;
  private trailLayer: SVGGElement;
  private labelLayer: SVGGElement;
  private floaters: Floater[] = [];
  private hover: string | null = null;
  private streams = new Map<string, Stream>();
  private consumedIds = new Set<string>();
  private pendingDmg = new Map<string, number>();
  private pendingOwner = new Map<string, "trump" | "biden">();
  private lastSnapTroops = new Map<string, number>();
  private sieges = new Map<string, { def: number; atk: number; faction: "trump" | "biden"; acc: number }>();
  private captureHold = new Map<string, number>();
  private reinforceHold = new Map<string, number>();
  private sendHold = new Map<string, number>();
  private sendLog: { from: string; n: number }[] = [];
  private lastTs = 0;
  private labels = new Map<string, { g: SVGGElement; zh: SVGTextElement; n: SVGTextElement }>();
  private viewport: HTMLElement;
  private lastShake = 0;
  private framed = false;
  camera: MapCamera;

  constructor(svg: SVGSVGElement, fx: HTMLCanvasElement) {
    this.svg = svg;
    this.fx = fx;
    this.ctx = fx.getContext("2d")!;
    this.viewport = document.getElementById("map-viewport") ?? svg.parentElement!;
    const world = document.getElementById("map-world") ?? this.viewport;
    svg.setAttribute("viewBox", MAP.viewBox);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("shape-rendering", "geometricPrecision");
    const ground = el("g", { id: "ground" });
    const hits = el("g", { id: "hits" });
    const small: { id: string; cx: number; cy: number; area: number }[] = [];
    for (const s of Object.values(MAP.states)) {
      const p = el("path", { id: `st-${s.id}`, d: s.d, class: "state fog" });
      p.dataset.state = s.id;
      p.addEventListener("pointerenter", () => {
        this.hover = s.id;
        this.tip(s.id);
      });
      p.addEventListener("pointerleave", () => {
        if (this.hover === s.id) this.hover = null;
      });
      ground.appendChild(p);
      small.push({ id: s.id, cx: s.cx, cy: s.cy, area: 0 });
    }
    this.labelLayer = el("g", { id: "labels" });
    this.trailLayer = el("g", { id: "trails" });
    this.armyLayer = el("g", { id: "armies" });
    this.dragLine = el("path", { class: "drag-line", d: "", "stroke-dasharray": "6 5" });
    this.dragLine.style.display = "none";
    this.svg.appendChild(ground);
    this.svg.appendChild(hits);
    this.svg.appendChild(this.trailLayer);
    this.svg.appendChild(this.dragLine);
    this.svg.appendChild(this.labelLayer);
    this.svg.appendChild(this.armyLayer);
    for (const s of small) {
      const path = this.svg.getElementById(`st-${s.id}`) as SVGPathElement | null;
      if (!path) continue;
      const b = path.getBBox();
      const m = Math.min(b.width, b.height);
      if (m >= 32) continue;
      const pad = el("circle", {
        class: "hit",
        cx: String(s.cx),
        cy: String(s.cy),
        r: String(m < 18 ? 18 : 14),
      });
      pad.dataset.state = s.id;
      hits.appendChild(pad);
    }
    this.camera = new MapCamera(this.viewport, world);
    this.camera.onTap = (x, y) => this.tapAt(x, y);
    this.camera.onSelectStart = (x, y) => this.selectStart(x, y);
    this.camera.onSelectMove = (x, y) => this.selectMove(x, y);
    this.camera.onSelectEnd = (x, y) => this.selectEnd(x, y);
    requestAnimationFrame((t) => this.tick(t));
  }

  private hitState(cx: number, cy: number): string | undefined {
    const stack = document.elementsFromPoint(cx, cy);
    for (const n of stack) {
      if (!(n instanceof Element)) continue;
      const hit = n.closest("[data-state]");
      if (hit instanceof HTMLElement || hit instanceof SVGElement) {
        return hit.dataset.state;
      }
    }
    return this.nearestState(cx, cy);
  }

  private tapAt(cx: number, cy: number) {
    const id = this.hitState(cx, cy);
    if (id) this.clickState(id);
    else {
      this.selected = null;
      this.origins.clear();
      this.dragTarget = null;
    }
    if (this.snap) this.render(this.snap);
  }

  private isOwnControllable(id: string): boolean {
    const snap = this.snap;
    if (!snap || snap.phase !== "playing") return false;
    const info = snap.states[id];
    if (!info?.visible || info.ownerId !== snap.you) return false;
    const me = snap.players.find((p) => p.id === snap.you);
    if (snap.mode === "2v2" && me && controlBank(id) !== me.zone) return false;
    return true;
  }

  private selectStart(cx: number, cy: number): boolean {
    const id = this.hitState(cx, cy);
    if (!id || !this.isOwnControllable(id)) return false;
    this.dragging = true;
    this.dragStartedSelected = this.selected === id && this.origins.has(id);
    this.origins = new Set([id]);
    this.selected = id;
    this.dragTarget = null;
    this.dragPointer = this.clientToSvg(cx, cy);
    this.paintDragLine();
    this.refreshPick();
    return true;
  }

  private selectMove(cx: number, cy: number) {
    if (!this.dragging || !this.snap) return;
    this.dragPointer = this.clientToSvg(cx, cy);
    const id = this.hitState(cx, cy);
    if (id && this.isOwnControllable(id)) {
      // Own state not already an origin → reinforce destination (A→own B).
      if (!this.origins.has(id) && this.origins.size > 0) {
        this.dragTarget = id;
      } else {
        this.origins.add(id);
        this.selected = id;
        this.dragTarget = null;
      }
    } else if (id) {
      const info = this.snap.states[id];
      if (info?.visible && !this.origins.has(id)) this.dragTarget = id;
      else this.dragTarget = null;
    } else {
      this.dragTarget = null;
    }
    this.paintDragLine();
    this.refreshPick();
  }

  private selectEnd(cx: number, cy: number) {
    if (!this.dragging) return;
    this.dragging = false;
    const over = this.hitState(cx, cy);
    const target = over ?? this.dragTarget;
    if (target && this.origins.size) {
      for (const from of this.origins) {
        if (from === target) continue;
        this.dispatchSend(from, target);
      }
      this.dragTarget = null;
      this.paintDragLine();
      this.refreshPick();
      // 修复 P0-7: 出兵成功后保留起点,支持连续操作
      // 不清空 selected 和 origins,玩家可以连续点击邻州
      return;
    }
    // No target: short re-tap on already-selected origin cancels; otherwise keep last origin.
    if (this.dragStartedSelected && this.origins.size === 1) {
      this.selected = null;
      this.origins.clear();
    } else if (this.origins.size) {
      const last = [...this.origins].pop()!;
      this.selected = last;
      this.origins = new Set([last]);
    }
    this.dragTarget = null;
    this.paintDragLine();
    this.refreshPick();
  }

  private clientToSvg(cx: number, cy: number) {
    const r = this.viewport.getBoundingClientRect();
    const vx = cx - r.left;
    const vy = cy - r.top;
    const vw = this.viewport.clientWidth || 1;
    const vh = this.viewport.clientHeight || 1;
    const contain = Math.min(vw / 960, vh / 600);
    const ox = (vw - 960 * contain) / 2;
    const oy = (vh - 600 * contain) / 2;
    const cam = this.camera;
    const sx = (vx - cam.x) / cam.scale;
    const sy = (vy - cam.y) / cam.scale;
    return {
      x: (sx - ox) / contain,
      y: (sy - oy) / contain,
    };
  }

  private originCentroid() {
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of this.origins) {
      const s = MAP.states[id];
      if (!s) continue;
      x += s.cx;
      y += s.cy;
      n += 1;
    }
    if (!n) return null;
    return { x: x / n, y: y / n };
  }

  private paintDragLine() {
    if (!this.dragLine) return;
    if (!this.dragging || this.origins.size === 0) {
      this.dragLine.style.display = "none";
      this.dragLine.setAttribute("d", "");
      return;
    }
    const c = this.originCentroid();
    if (!c) {
      this.dragLine.style.display = "none";
      return;
    }
    let tx = this.dragPointer.x;
    let ty = this.dragPointer.y;
    if (this.dragTarget && MAP.states[this.dragTarget]) {
      tx = MAP.states[this.dragTarget].cx;
      ty = MAP.states[this.dragTarget].cy;
    }
    this.dragLine.style.display = "";
    this.dragLine.setAttribute("d", `M${c.x} ${c.y} L${tx} ${ty}`);
  }

  private nearestState(cx: number, cy: number) {
    const r = this.viewport.getBoundingClientRect();
    const vx = cx - r.left;
    const vy = cy - r.top;
    const vw = this.viewport.clientWidth || 1;
    const vh = this.viewport.clientHeight || 1;
    const contain = Math.min(vw / 960, vh / 600);
    const ox = (vw - 960 * contain) / 2;
    const oy = (vh - 600 * contain) / 2;
    const cam = this.camera;
    let best = "";
    let bestD = 28;
    for (const s of Object.values(MAP.states)) {
      const sx = cam.x + (ox + s.cx * contain) * cam.scale;
      const sy = cam.y + (oy + s.cy * contain) * cam.scale;
      const d = Math.hypot(sx - vx, sy - vy);
      if (d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best || undefined;
  }

  private snap: RoomSnapshot | null = null;

  render(snap: RoomSnapshot) {
    this.snap = snap;
    const me = snap.players.find((p) => p.id === snap.you);
    for (const s of Object.values(MAP.states)) {
      const path = this.svg.getElementById(`st-${s.id}`) as SVGPathElement | null;
      if (!path) continue;
      const info = snap.states[s.id];
      path.classList.remove("fog", "empty", "trump", "biden", "mine", "pick", "target", "flash");
      if (!info?.visible) {
        path.classList.add("fog");
        this.hideLabel(s.id);
        continue;
      }
      const predF = this.pendingOwner.get(s.id);
      const confirmed = !!(predF && info.faction === predF);
      if (confirmed) {
        const leftover = this.sieges.get(s.id)?.atk ?? this.captureHold.get(s.id) ?? 0;
        this.pendingDmg.set(s.id, 0);
        this.pendingOwner.delete(s.id);
        this.sieges.delete(s.id);
        if ((info.troops ?? 0) <= 0 && leftover > 0) this.captureHold.set(s.id, leftover);
        else this.captureHold.delete(s.id);
      }
      const sg = this.sieges.get(s.id);
      let faction = info.faction;
      if (sg && sg.def > 0) faction = info.faction;
      else if (sg && sg.atk > 0) faction = sg.faction;
      else if (predF) faction = predF;
      if (!faction) path.classList.add("empty");
      else path.classList.add(faction);
      const mineFaction = me?.faction;
      if (faction && mineFaction && faction === mineFaction) {
        if (snap.mode !== "2v2" || controlBank(s.id) === me.zone) path.classList.add("mine");
      } else if (info.ownerId === snap.you) {
        if (snap.mode !== "2v2" || !me || controlBank(s.id) === me.zone) path.classList.add("mine");
      }
      if (this.origins.has(s.id) || this.selected === s.id) path.classList.add("pick");
      if (
        (this.selected || this.origins.size) &&
        info.visible &&
        s.id !== this.selected &&
        !this.origins.has(s.id)
      ) {
        path.classList.add("target");
      }
      if (this.dragTarget === s.id) path.classList.add("target");
      const isOrigin = this.origins.has(s.id) || this.selected === s.id;
      const snapT = info.troops ?? 0;
      const prevT = this.lastSnapTroops.get(s.id);
      if (prevT != null && snapT < prevT) {
        const pend = this.pendingDmg.get(s.id) ?? 0;
        this.pendingDmg.set(s.id, Math.max(0, pend - (prevT - snapT)));
        // 修复 P0-4: 渐进式清理 sendHold,避免粗暴覆盖导致数字跳动
        const loss = prevT - snapT;
        const held = this.sendHold.get(s.id) ?? 0;
        if (held > 0) {
          const cleared = Math.min(held, loss);
          const next = held - cleared;
          if (next > 0) this.sendHold.set(s.id, next);
          else this.sendHold.delete(s.id);
        }
      }
      if (prevT != null && snapT > prevT) {
        const add = snapT - prevT;
        const rh = this.reinforceHold.get(s.id) ?? 0;
        if (rh > 0) this.reinforceHold.set(s.id, Math.max(0, rh - add));
      }
      // 修复 P0-6: 老家从0恢复产兵时,清理状态让数字正常增长
      if (prevT === 0 && snapT > 0) {
        this.pendingDmg.set(s.id, 0);
        this.sendHold.delete(s.id);
      }
      this.lastSnapTroops.set(s.id, snapT);
      let shown = this.shownTroops(s.id, info);
      this.upsertLabel(
        s.id,
        isOrigin ? `${labelZh(s.id)} · 起点` : labelZh(s.id),
        snap.phase === "lobby" ? "" : String(shown),
        s.cx,
        s.cy,
      );
    }
    this.paintOrigin();
    this.paintDragLine();

    const live = new Set(snap.armies.map((a) => a.id));
    for (const a of snap.armies) {
      if (this.consumedIds.has(a.id)) continue;
      this.upsertStream(a);
    }
    for (const [id, stream] of [...this.streams]) {
      if (this.consumedIds.has(id)) continue;
      if (live.has(id)) continue;
      if (stream.p < 1) continue;
      this.removeStream(stream);
    }

    if (snap.events.length) this.playEvents(snap.events);

    if (snap.phase === "playing") {
      if (!this.framed && me?.home && MAP.states[me.home]) {
        const home = MAP.states[me.home];
        this.camera.centerOnSvg(home.cx, home.cy);
        this.framed = true;
      }
    } else {
      this.framed = false;
    }

    const tip = document.getElementById("callout");
    if (tip && this.hover) this.tip(this.hover);
    else if (tip && me && this.selected) this.tip(this.selected);
  }

  private upsertLabel(id: string, zh: string, n: string, cx: number, cy: number) {
    let row = this.labels.get(id);
    if (!row) {
      const g = el("g", { class: "label", transform: `translate(${cx},${cy})` });
      const z = document.createElementNS("http://www.w3.org/2000/svg", "text");
      z.setAttribute("text-anchor", "middle");
      z.setAttribute("y", "-7");
      z.setAttribute("class", "zh");
      const num = document.createElementNS("http://www.w3.org/2000/svg", "text");
      num.setAttribute("text-anchor", "middle");
      num.setAttribute("y", "10");
      num.setAttribute("class", "n");
      g.appendChild(z);
      g.appendChild(num);
      this.labelLayer.appendChild(g);
      row = { g, zh: z, n: num };
      this.labels.set(id, row);
    }
    row.g.style.display = "";
    row.zh.textContent = zh;
    row.n.textContent = n;
  }

  private hideLabel(id: string) {
    const row = this.labels.get(id);
    if (row) row.g.style.display = "none";
  }

  private noteSend(from: string) {
    const info = this.snap?.states[from];
    if (!info) return;
    const n = this.shownTroops(from, info);
    if (n <= 0) return;
    // 修复 Bug: 避免重复记录导致翻倍
    // 只记录一次,不累加到 sendHold (sendHold 会在 upsertStream 时处理)
    this.sendLog.push({ from, n });
  }

  revertLastSend() {
    const last = this.sendLog.pop();
    if (!last) return;
    const left = (this.sendHold.get(last.from) ?? 0) - last.n;
    if (left > 0) this.sendHold.set(last.from, left);
    else this.sendHold.delete(last.from);
  }

  dispatchSend(from: string, to: string) {
    // 修复 Bug: 出兵时立即从显示的兵力中扣除,避免延迟
    const info = this.snap?.states[from];
    if (info) {
      const n = Math.floor(info.troops ?? 0);
      if (n > 0) {
        // 立即设置 sendHold,让数字马上下降
        this.sendHold.set(from, (this.sendHold.get(from) ?? 0) + n);
      }
    }
    this.onSend(from, to, 1);
  }

  private shownTroops(id: string, info: { troops?: number } | undefined): number {
    const snapT = info?.troops ?? 0;
    const sg = this.sieges.get(id);
    // 修复 P0-3: 占领时显示剩余攻击兵力,消除闪0
    if (sg && sg.def > 0) return Math.max(0, Math.ceil(sg.def));
    if (sg && sg.atk > 0) return Math.max(1, Math.ceil(sg.atk));
    // 修复: 打平时确保至少显示1兵
    if (sg && sg.def <= 0 && sg.atk <= 0) return 1;
    const hold = this.captureHold.get(id);
    if (hold && snapT <= 0) return hold;
    if (hold && snapT > 0) this.captureHold.delete(id);
    // 修复 P0-4: 避免重复计算 sendHold 和 streams 的兵力
    // sendHold 只在出兵瞬间记录,upsertStream 时扣除,不在这里累加
    const inFlight = this.sendHold.get(id) ?? 0;
    const shown = Math.max(
      0,
      Math.round(snapT + (this.reinforceHold.get(id) ?? 0) + inFlight - (this.pendingDmg.get(id) ?? 0)),
    );
    return shown;
  }

  private paintNumbers() {
    const snap = this.snap;
    if (!snap || snap.phase === "lobby") return;
    for (const s of Object.values(MAP.states)) {
      const info = snap.states[s.id];
      if (!info?.visible) continue;
      const row = this.labels.get(s.id);
      if (!row) continue;
      const isOrigin = this.origins.has(s.id) || this.selected === s.id;
      row.zh.textContent = isOrigin ? `${labelZh(s.id)} · 起点` : labelZh(s.id);
      row.n.textContent = String(this.shownTroops(s.id, info));
    }
  }

  private upsertStream(a: ArmyView) {
    const duration = durationMs(a.from, a.to);
    let s = this.streams.get(a.id);
    if (!s) {
      const root = el("g", { class: `army ${a.faction}` });
      s = {
        id: a.id,
        from: a.from,
        to: a.to,
        faction: a.faction,
        troops: a.troops,
        p: 0,
        start: 0,
        duration,
        arrivedAt: 0,
        appliedDmg: false,
        cols: 0,
        root,
        line: null,
        head: root,
        trailHeads: [],
        num: el("text", {}),
      };
      const seed = progressOf(a);
      s.p = seed;
      s.start = performance.now() - seed * duration;
      const n0 = Math.max(1, Math.min(30, Math.floor(a.troops)));
      s.cols = n0 < 10 ? 1 : n0 < 30 ? 2 : 3;
      this.ensureHeads(s, n0);
      this.armyLayer.appendChild(root);
      this.streams.set(a.id, s);
      const held = this.sendHold.get(a.from) ?? 0;
      const take = Math.min(held, Math.floor(a.troops));
      if (take > 0) {
        const next = held - take;
        if (next > 0) this.sendHold.set(a.from, next);
        else this.sendHold.delete(a.from);
      }
      // 修复 Bug: 如果 sendHold 为 0,也删除避免阻塞产兵显示
      if ((this.sendHold.get(a.from) ?? 0) === 0) {
        this.sendHold.delete(a.from);
      }
    }
    s.from = a.from;
    s.to = a.to;
    s.duration = duration;
  }

  private ensureHeads(s: Stream, n: number) {
    const size = 11;
    while (s.trailHeads.length < n) {
      const g = el("g", { class: "trail-head-wrap", opacity: "0" });
      const wrap = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
      wrap.setAttribute("x", String(-size / 2));
      wrap.setAttribute("y", String(-size / 2));
      wrap.setAttribute("width", String(size));
      wrap.setAttribute("height", String(size));
      wrap.innerHTML = `<div xmlns="http://www.w3.org/1999/xhtml" class="army-head trail-head">${headFor(s.faction, size)}</div>`;
      g.appendChild(wrap);
      s.root.appendChild(g);
      s.trailHeads.push(g);
    }
    while (s.trailHeads.length > n) {
      s.trailHeads.pop()?.remove();
    }
  }

  private originBound = false;
  private paintOrigin() {
    const badge = document.getElementById("origin-badge");
    const name = document.getElementById("origin-name");
    if (!this.originBound) {
      this.originBound = true;
      document.getElementById("btn-cancel-origin")?.addEventListener("click", () => {
        this.selected = null;
        this.origins.clear();
        this.dragTarget = null;
        this.refreshPick();
      });
    }
    if (!badge || !name) return;
    const snap = this.snap;
    const on = !!(this.selected && snap && snap.phase !== "lobby");
    badge.hidden = !on;
    if (on && this.selected) {
      const extra = this.origins.size > 1 ? ` +${this.origins.size - 1}` : "";
      name.textContent = `${labelZh(this.selected)}${extra}`;
    }
  }

  private refreshPick() {
    if (!this.snap) {
      this.paintOrigin();
      this.paintDragLine();
      return;
    }
    for (const s of Object.values(MAP.states)) {
      const path = this.svg.getElementById(`st-${s.id}`) as SVGPathElement | null;
      if (!path) continue;
      const info = this.snap.states[s.id];
      const isOrigin = this.origins.has(s.id) || this.selected === s.id;
      path.classList.toggle("pick", isOrigin);
      path.classList.toggle(
        "target",
        !!(
          info?.visible &&
          (this.selected || this.origins.size) &&
          !isOrigin &&
          (this.dragTarget === s.id || !this.dragging)
        ),
      );
      if (info?.visible && this.labels.get(s.id)) {
        const zh = isOrigin ? `${labelZh(s.id)} · 起点` : labelZh(s.id);
        this.upsertLabel(
          s.id,
          zh,
          this.snap.phase === "lobby" ? "" : String(this.shownTroops(s.id, info)),
          s.cx,
          s.cy,
        );
      }
    }
    this.paintOrigin();
    this.paintDragLine();
  }

  private clickState(id: string) {
    const snap = this.snap;
    if (!snap || snap.phase !== "playing") return;
    const info = snap.states[id];
    if (this.selected === id) {
      this.selected = null;
      this.origins.clear();
      this.dragTarget = null;
      this.refreshPick();
      return;
    }
    if (this.selected && this.selected !== id && info?.visible) {
      const froms = this.origins.size ? [...this.origins] : [this.selected];
      for (const from of froms) {
        if (from === id) continue;
        this.dispatchSend(from, id);
      }
      this.dragTarget = null;
      this.refreshPick();
      return;
    }
    if (info?.visible && info.ownerId === snap.you) {
      const me = snap.players.find((p) => p.id === snap.you);
      if (snap.mode === "2v2" && me && controlBank(id) !== me.zone) {
        this.selected = null;
        this.origins.clear();
        this.refreshPick();
        return;
      }
      this.selected = id;
      this.origins = new Set([id]);
      this.tip(id);
      this.refreshPick();
    } else {
      this.selected = null;
      this.origins.clear();
      this.refreshPick();
    }
  }

  private tip(id: string) {
    const s = MAP.states[id];
    const info = this.snap?.states[id];
    const elTip = document.getElementById("callout");
    if (!s || !elTip) return;
    if (!info?.visible) {
      elTip.innerHTML = `<strong>迷雾</strong><span>尚未侦察</span>`;
      return;
    }
    const owner = this.snap?.players.find((p) => p.id === info.ownerId);
    elTip.innerHTML = `<strong>${labelEn(id)}</strong><span>${labelZh(id)} · ${owner ? owner.name : "中立"} · ${info.troops ?? 0} 兵</span>`;
  }

  private playEvents(events: GameEvent[]) {
    let clash = false;
    for (const e of events) {
      if (e.kind === "send") sfxSend();
      if (e.kind === "clash") {
        clash = true;
        const left = this.snap?.states[e.state]?.troops;
        this.floaters.push({
          x: e.x,
          y: e.y,
          vy: -26,
          life: 0.95,
          text: left != null ? String(Math.floor(left)) : "-1",
          color: "#c23b22",
        });
        const path = this.svg.getElementById(`st-${e.state}`);
        if (path) {
          path.classList.add("flash");
          window.setTimeout(() => path.classList.remove("flash"), 200);
        }
      }
      if (e.kind === "capture") {
        sfxCapture(e.faction);
        this.svg.getElementById(`st-${e.state}`)?.classList.add("flash");
      }
    }
    if (clash) sfxClash();
  }

  private shake() {
    const now = performance.now();
    if (now - this.lastShake < 160) return;
    this.lastShake = now;
    const vp = this.viewport;
    if (!vp) return;
    vp.classList.remove("shake");
    void vp.offsetWidth;
    vp.classList.add("shake");
    window.setTimeout(() => vp.classList.remove("shake"), 220);
  }

  private tick = (ts: number) => {
    const dt = this.lastTs ? Math.min(0.05, (ts - this.lastTs) / 1000) : 0.016;
    this.lastTs = ts;
    const now = performance.now();
    // 修复 P0-2: 客户端持续模拟交火,实时扣血
    for (const [id, sg] of this.sieges) {
      sg.acc += dt;
      while (sg.acc >= 0.25 && sg.def > 0 && sg.atk > 0) {
        sg.acc -= 0.25;
        sg.def -= 1;
        sg.atk -= 1;
      }
      // 修复: 打平时保留防守方1兵,避免空城0
      if (sg.def <= 0 && sg.atk <= 0) {
        sg.def = 1;
        sg.atk = 0;
      }
      if (sg.def <= 0 && sg.atk > 0) this.pendingOwner.set(id, sg.faction);
    }
    for (const s of [...this.streams.values()]) {
      s.p = Math.max(0, Math.min(1, (now - s.start) / s.duration));
      const a = MAP.states[s.from];
      const b = MAP.states[s.to];
      if (!a || !b) continue;

      const dx0 = b.cx - a.cx;
      const dy0 = b.cy - a.cy;
      const dist0 = Math.hypot(dx0, dy0) || 1;
      if (!s.appliedDmg && s.p * dist0 >= dist0 - 16) {
        s.appliedDmg = true;
        const dest = this.snap?.states[s.to];
        const alreadyMine = dest && (dest.ownerId === this.snap?.you || dest.faction === s.faction);
        if (alreadyMine && dest) {
          this.reinforceHold.set(s.to, (this.reinforceHold.get(s.to) ?? 0) + Math.floor(s.troops));
        } else if (dest) {
          const prev = this.sieges.get(s.to);
          this.sieges.set(s.to, {
            def: prev ? prev.def : Math.floor(dest.troops ?? 0),
            atk: (prev?.atk ?? 0) + Math.floor(s.troops),
            faction: s.faction,
            acc: prev ? prev.acc : 0.25,
          });
        }
      }
      if (s.p >= 1) {
        this.pendingDmg.set(s.from, (this.pendingDmg.get(s.from) ?? 0) + Math.floor(s.troops));
        this.consumedIds.add(s.id);
        this.removeStream(s);
        continue;
      }

      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const px = -uy;
      const py = ux;
      const n = s.trailHeads.length;
      // 修复 P1-8: 队列列数创建时锁定,不随兵力变化
      const cols = s.cols || 1;
      const alongGap = Math.max(18, dist * 0.08);
      const sideGap = 14;
      const front = s.p * dist;
      for (let i = 0; i < n; i++) {
        const th = s.trailHeads[i];
        const col = cols === 1 ? 0 : i % cols;
        const row = cols === 1 ? i : Math.floor(i / cols);
        const side = (col - (cols - 1) / 2) * sideGap;
        const along = front - row * alongGap;
        if (along < 4) {
          th.setAttribute("opacity", "0");
          continue;
        }
        const x = a.cx + ux * along + px * side;
        const y = a.cy + uy * along + py * side;
        th.setAttribute("opacity", "0.92");
        th.setAttribute("transform", `translate(${x},${y})`);
      }
    }

    this.paintNumbers();
    const canvas = this.fx;
    const w = this.svg.clientWidth || 960;
    const h = this.svg.clientHeight || 600;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const sx = w / 960;
    const sy = h / 600;
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    c.font = "600 13px 'Noto Sans SC', sans-serif";
    c.textAlign = "center";
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const f of this.floaters) {
      f.y += f.vy * dt;
      f.life -= dt * 1.4;
      c.globalAlpha = Math.max(0, f.life);
      c.fillStyle = f.color;
      c.fillText(f.text, f.x * sx, f.y * sy);
    }
    c.globalAlpha = 1;
    requestAnimationFrame(this.tick);
  };

  private removeStream(s: Stream) {
    s.root.remove();
    s.line?.remove();
    this.streams.delete(s.id);
  }
}

function progressOf(a: ArmyView): number {
  const from = MAP.states[a.from];
  const to = MAP.states[a.to];
  if (!from || !to) return 0;
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy) || 1;
  return Math.max(0, Math.min(1, ((a.x - from.cx) * dx + (a.y - from.cy) * dy) / (len * len)));
}

function durationMs(from: string, to: string) {
  const a = MAP.states[from];
  const b = MAP.states[to];
  if (!a || !b) return 2000;
  const dist = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  const seconds = Math.min(6.8, Math.max(2.2, dist / 90));
  return seconds * 1000;
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
