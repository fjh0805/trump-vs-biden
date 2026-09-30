import { estimateCombatSeconds } from "../shared/balance";
import { controlBank, labelEn, labelZh } from "../shared/constants";
import type { ArmyView, GameEvent, RoomSnapshot, StateView } from "../shared/protocol";
import mapJson from "../shared/us-map.json";
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
  arrivedAt: number | null;
  combatDuration: number;
  combatDepth: number;
  cols: number;
  nextSlot: number;
  root: SVGGElement;
  trailHeads: SVGGElement[];
}

interface TroopDisplay {
  from: number;
  target: number;
  start: number;
  ownerId: string | null;
  faction: StateView["faction"];
}

const DAMAGE_TWEEN_MS = 90;

export class GameView {
  svg: SVGSVGElement;
  fx: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  selected: string | null = null;
  origins = new Set<string>();
  dragTarget: string | null = null;
  private dragging = false;
  private dragStartedSelected = false;
  private dragMoved = false;
  private dragStart = { x: 0, y: 0 };
  private lastDragPoint = { x: 0, y: 0 };
  private dragCandidate: string | null = null;
  private selectionBeforeDrag: { selected: string | null; origins: Set<string> } | null = null;
  private dragPointer = { x: 0, y: 0 };
  private dragLine: SVGPathElement | null = null;
  onSend: (from: string, to: string) => boolean = () => false;
  private armyLayer: SVGGElement;
  private trailLayer: SVGGElement;
  private labelLayer: SVGGElement;
  private floaters: Floater[] = [];
  private hover: string | null = null;
  private streams = new Map<string, Stream>();
  private pendingSends: { from: string; to: string; n: number; acked: boolean }[] = [];
  private troopDisplays = new Map<string, TroopDisplay>();
  private lastTs = 0;
  private labels = new Map<string, { g: SVGGElement; zh: SVGTextElement; n: SVGTextElement }>();
  private viewport: HTMLElement;
  private lastShake = 0;
  private framed = false;
  camera: MapCamera;
  onNotice: (text: string) => void = () => {};

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
        if (this.hover === s.id) {
          this.hover = null;
          this.tip(this.selected ?? undefined);
        }
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
      // 修复手机端bug: 扩大小州点击区域,手指触控更友好
      const hitRadius = m < 18 ? 24 : 20;
      const pad = el("circle", {
        class: "hit",
        cx: String(s.cx),
        cy: String(s.cy),
        r: String(hitRadius),
      });
      pad.dataset.state = s.id;
      hits.appendChild(pad);
    }
    this.camera = new MapCamera(this.viewport, world);
    this.camera.onTap = (x, y) => this.tapAt(x, y);
    this.camera.onSelectStart = (x, y) => this.selectStart(x, y);
    this.camera.onSelectMove = (x, y) => this.selectMove(x, y);
    this.camera.onSelectEnd = (x, y) => this.selectEnd(x, y);
    this.camera.canDoubleTapZoom = () => !this.selected;
    this.camera.onSelectCancel = () => this.cancelSelection();
    requestAnimationFrame((t) => this.tick(t));
  }

  private hitState(cx: number, cy: number, allowNearby = true): string | undefined {
    const rect = this.viewport.getBoundingClientRect();
    if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) return;
    const stack = document.elementsFromPoint(cx, cy);
    // Small-state hit circles can overlap a neighboring state's actual shape.
    const path = stack.find((n) => n instanceof SVGPathElement && n.dataset.state && this.svg.contains(n));
    if (path instanceof SVGPathElement) return path.dataset.state;
    for (const n of stack) {
      if (!(n instanceof Element) || !this.svg.contains(n)) continue;
      const hit = n.closest("[data-state]");
      if (hit instanceof HTMLElement || hit instanceof SVGElement) {
        return hit.dataset.state;
      }
    }
    return allowNearby ? this.nearestState(cx, cy) : undefined;
  }

  private tapAt(cx: number, cy: number) {
    const id = this.hitState(cx, cy);
    if (id) this.clickState(id);
    else {
      this.selected = null;
      this.origins.clear();
      this.dragTarget = null;
      this.refreshPick();
    }
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

  private cancelSelection() {
    this.dragging = false;
    this.dragTarget = null;
    if (this.selectionBeforeDrag) {
      this.origins = new Set([...this.selectionBeforeDrag.origins].filter((id) => this.isOwnControllable(id)));
      const selected = this.selectionBeforeDrag.selected;
      this.selected = selected && this.isOwnControllable(selected)
        ? selected : this.origins.values().next().value ?? null;
    }
    this.selectionBeforeDrag = null;
    this.dragCandidate = null;
    this.refreshPick();
  }

  private selectStart(cx: number, cy: number): boolean {
    const id = this.hitState(cx, cy);
    if (!id || !this.isOwnControllable(id)) return false;

    this.selectionBeforeDrag = { selected: this.selected, origins: new Set(this.origins) };
    this.dragging = true;
    this.dragStartedSelected = this.selected === id;
    this.dragMoved = false;
    this.dragStart = { x: cx, y: cy };
    this.lastDragPoint = this.dragStart;
    this.dragCandidate = id;
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
    if (!this.dragMoved && Math.hypot(cx - this.dragStart.x, cy - this.dragStart.y) < 12) return;
    this.dragMoved = true;
    this.dragPointer = this.clientToSvg(cx, cy);
    const previousSize = this.origins.size;
    const previousTarget = this.dragTarget;
    const distance = Math.hypot(cx - this.lastDragPoint.x, cy - this.lastDragPoint.y);
    const samples = Math.max(1, Math.ceil(distance / 14));
    for (let i = 1; i <= samples; i++) {
      const x = this.lastDragPoint.x + ((cx - this.lastDragPoint.x) * i) / samples;
      const y = this.lastDragPoint.y + ((cy - this.lastDragPoint.y) * i) / samples;
      const id = this.hitState(x, y, false) ?? null;
      if (id === this.dragCandidate && (id !== null || this.dragTarget === null)) continue;
      if (this.dragCandidate && this.isOwnControllable(this.dragCandidate)) {
        this.origins.add(this.dragCandidate);
      }
      this.dragCandidate = id && this.isOwnControllable(id) ? id : null;
      this.dragTarget = id && this.snap.states[id]?.visible && !this.origins.has(id) ? id : null;
    }
    this.lastDragPoint = { x: cx, y: cy };
    if (previousSize !== this.origins.size || previousTarget !== this.dragTarget) this.refreshPick();
    else this.paintDragLine();
  }

  private selectEnd(cx: number, cy: number) {
    if (!this.dragging) return;
    if (Math.hypot(cx - this.dragStart.x, cy - this.dragStart.y) >= 12) this.selectMove(cx, cy);
    this.dragging = false;
    const target = this.dragMoved ? this.hitState(cx, cy, false) : null;
    if (target && this.isOwnControllable(target)) {
      this.origins.add(target);
    } else if (target && this.snap?.states[target]?.visible && !this.origins.has(target) && this.origins.size) {
      for (const from of this.origins) {
        this.dispatchSend(from, target);
      }
    } else if (target && this.dragMoved && !this.snap?.states[target]?.visible) {
      this.onNotice("目标尚未侦察");
    } else if (!this.dragMoved && this.dragStartedSelected) {
      this.selected = null;
      this.origins.clear();
    }
    this.selectionBeforeDrag = null;
    this.dragCandidate = null;
    this.dragTarget = null;
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
      if (this.dragLine.style.display !== "none") this.dragLine.style.display = "none";
      if (this.dragLine.getAttribute("d")) this.dragLine.setAttribute("d", "");
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
    if (this.dragLine.style.display) this.dragLine.style.display = "";
    const d = `M${c.x} ${c.y} L${tx} ${ty}`;
    if (this.dragLine.getAttribute("d") !== d) this.dragLine.setAttribute("d", d);
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
    // 修复手机端bug: 扩大nearestState查找半径,手指粗点也能准确识别
    let bestD = 24;
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
    if (this.snap?.phase !== snap.phase || this.snap.code !== snap.code) {
      this.selected = null;
      this.origins.clear();
      this.dragTarget = null;
      this.pendingSends = [];
      this.troopDisplays.clear();
      for (const stream of this.streams.values()) stream.root.remove();
      this.streams.clear();
      this.framed = false;
    } else {
      this.pendingSends = this.pendingSends.filter((send) => !send.acked);
    }
    this.snap = snap;
    for (const id of this.origins) {
      if (!this.isOwnControllable(id)) this.origins.delete(id);
    }
    if (this.selected && !this.isOwnControllable(this.selected)) {
      this.selected = this.origins.values().next().value ?? null;
    }
    if (!this.selected && this.dragging) {
      this.dragging = false;
      this.selectionBeforeDrag = null;
      this.dragCandidate = null;
      this.dragTarget = null;
    }
    const me = snap.players.find((p) => p.id === snap.you);
    const live = new Set(snap.armies.map((a) => a.id));
    for (const a of snap.armies) this.upsertStream(a);
    for (const [id, stream] of [...this.streams]) {
      if (!live.has(id)) this.removeStream(stream);
    }
    for (const s of Object.values(MAP.states)) {
      const path = this.svg.getElementById(`st-${s.id}`) as SVGPathElement | null;
      if (!path) continue;
      const info = snap.states[s.id];
      const visible = !!info?.visible;
      path.classList.toggle("fog", !visible);
      if (!visible) {
        for (const name of ["empty", "trump", "biden", "mine", "pick", "target"]) {
          path.classList.toggle(name, false);
        }
        this.troopDisplays.delete(s.id);
        this.hideLabel(s.id);
        continue;
      }
      const faction = info.faction;
      path.classList.toggle("empty", !faction);
      path.classList.toggle("trump", faction === "trump");
      path.classList.toggle("biden", faction === "biden");
      const inBank = snap.mode !== "2v2" || !me || controlBank(s.id) === me.zone;
      path.classList.toggle("mine", inBank && (info.ownerId === snap.you || !!(faction && faction === me?.faction)));
      const isOrigin = this.origins.has(s.id) || this.selected === s.id;
      path.classList.toggle("pick", isOrigin);
      path.classList.toggle("target", !isOrigin && !!(this.selected || this.origins.size) &&
        (!this.dragging || this.dragTarget === s.id));
      const shown = this.updateTroopDisplay(s.id, info, snap);
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

    this.tip(this.hover ?? this.selected ?? undefined);
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
    if (row.g.style.display) row.g.style.display = "";
    if (row.zh.textContent !== zh) row.zh.textContent = zh;
    if (row.n.textContent !== n) row.n.textContent = n;
  }

  private hideLabel(id: string) {
    const row = this.labels.get(id);
    if (row && row.g.style.display !== "none") row.g.style.display = "none";
  }

  revertLastSend() {
    const index = this.pendingSends.findIndex((send) => !send.acked);
    if (index < 0) return;
    this.pendingSends.splice(index, 1);
    this.paintNumbers();
  }

  clearPendingSends() {
    if (!this.pendingSends.length) return;
    this.pendingSends = [];
    this.paintNumbers();
  }

  confirmSend(from: string, to: string) {
    const send = this.pendingSends.find((s) => s.from === from && s.to === to && !s.acked);
    if (send) send.acked = true;
  }

  reset() {
    this.snap = null;
    this.selected = null;
    this.origins.clear();
    this.dragTarget = null;
    this.dragging = false;
    this.selectionBeforeDrag = null;
    this.dragCandidate = null;
    this.pendingSends = [];
    this.troopDisplays.clear();
    for (const stream of this.streams.values()) this.removeStream(stream);
    this.framed = false;
    this.paintOrigin();
    this.paintDragLine();
    this.tip();
  }

  dispatchSend(from: string, to: string) {
    const info = this.snap?.states[from];
    if (!info || !this.isOwnControllable(from) || !this.snap?.states[to]?.visible || from === to) return;
    const actualTroops = this.shownTroops(from, info);
    if (actualTroops <= 0) {
      this.onNotice("本州暂无可派兵力");
      return;
    }
    if (this.onSend(from, to)) {
      this.pendingSends.push({ from, to, n: actualTroops, acked: false });
      this.paintNumbers();
    } else {
      this.onNotice("连接已断开，请返回重连");
    }
  }

  private shownTroops(id: string, info: { troops?: number | null } | undefined): number {
    const outgoing = this.pendingSends.reduce((sum, send) => sum + (send.from === id ? send.n : 0), 0);
    return Math.max(0, (info?.troops ?? 0) - outgoing);
  }

  private displayTroops(id: string, now = performance.now()): number {
    const display = this.troopDisplays.get(id);
    if (!display) return 0;
    const progress = Math.min(1, (now - display.start) / DAMAGE_TWEEN_MS);
    return Math.ceil(display.from + (display.target - display.from) * progress);
  }

  private updateTroopDisplay(id: string, info: StateView, snap: RoomSnapshot): number {
    const target = this.shownTroops(id, info);
    const previous = this.troopDisplays.get(id);
    const now = performance.now();
    if (target !== previous?.target || previous.ownerId !== info.ownerId || previous.faction !== info.faction) {
      const animate = previous && snap.phase === "playing" && info.ownerId !== snap.you &&
        previous.ownerId === info.ownerId && previous.faction === info.faction && target < previous.target;
      this.troopDisplays.set(id, {
        from: animate ? this.displayTroops(id, now) : target,
        target,
        start: now,
        ownerId: info.ownerId,
        faction: info.faction,
      });
    }
    return this.displayTroops(id, now);
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
      const label = isOrigin ? `${labelZh(s.id)} · 起点` : labelZh(s.id);
      if (row.zh.textContent !== label) row.zh.textContent = label;
      const target = this.shownTroops(s.id, info);
      if (info.ownerId === snap.you) {
        this.troopDisplays.set(s.id, { from: target, target, start: performance.now(), ownerId: info.ownerId, faction: info.faction });
      }
      const number = String(info.ownerId === snap.you ? target : this.displayTroops(s.id));
      if (row.n.textContent !== number) row.n.textContent = number;
    }
  }

  private upsertStream(a: ArmyView) {
    const duration = a.travelMs;
    let s = this.streams.get(a.id);
    const created = !s;
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
        arrivedAt: null,
        combatDuration: 1000,
        combatDepth: 18,
        cols: 0,
        nextSlot: 0,
        root,
        trailHeads: [],
      };
      const seed = progressOf(a);
      s.p = seed;
      s.start = performance.now() - seed * duration;
      const n0 = Math.max(1, Math.min(30, Math.floor(a.troops)));
      s.cols = n0 < 10 ? 1 : n0 < 30 ? 2 : 3;
      this.ensureHeads(s, n0);
      this.armyLayer.appendChild(root);
      this.streams.set(a.id, s);
    }
    s.from = a.from;
    s.to = a.to;
    s.troops = a.troops;
    this.ensureHeads(s, Math.max(1, Math.min(30, Math.floor(a.troops))));
    const seed = progressOf(a);
    const now = performance.now();
    if (a.arrived) {
      s.p = 1;
      if (s.arrivedAt === null) this.startCombat(s, now);
    } else if (!created) {
      const predicted = Math.max(s.p, Math.min(1, (now - s.start) / s.duration));
      const driftMs = (seed - predicted) * duration;
      if (driftMs > 0) s.start -= Math.min(35, driftMs);
      else if (driftMs < -120) {
        // Slow the prediction without moving its time axis behind the last drawn head.
        s.start += Math.max(0, Math.min(25, -driftMs - 80, now - s.p * duration - s.start));
      }
    }
    s.duration = duration;
  }

  private ensureHeads(s: Stream, n: number) {
    const size = 14; // 提升到14px,手机端更清晰
    while (s.trailHeads.length < n) {
      const g = el("g", { class: "trail-head-wrap", opacity: "0" });
      g.dataset.slot = String(s.nextSlot++);

      // 修复移动端bug: 不使用foreignObject+img,改用SVG circle+image避免兼容性问题
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "0");
      circle.setAttribute("cy", "0");
      circle.setAttribute("r", String(size / 2));
      circle.setAttribute("fill", s.faction === "trump" ? "#c23b22" : "#2f5d9f");
      circle.setAttribute("class", "army-head-bg");

      const img = document.createElementNS("http://www.w3.org/2000/svg", "image");
      img.setAttribute("x", String(-size / 2));
      img.setAttribute("y", String(-size / 2));
      img.setAttribute("width", String(size));
      img.setAttribute("height", String(size));
      img.setAttribute("href", s.faction === "trump" ? "/trump.jpg" : "/biden.jpg");
      img.setAttribute("clip-path", `circle(${size / 2}px at center)`);
      img.setAttribute("class", "army-head-img");

      // 降级方案: 如果图片加载失败,显示首字母
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", "0");
      text.setAttribute("y", "0");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "white");
      text.setAttribute("font-size", String(size * 0.6));
      text.setAttribute("font-weight", "bold");
      text.setAttribute("class", "army-head-fallback");
      text.setAttribute("style", "display: none;");
      text.textContent = s.faction === "trump" ? "T" : "B";

      g.appendChild(circle);
      g.appendChild(img);
      g.appendChild(text);

      // 图片加载失败时显示降级文字
      img.addEventListener("error", () => {
        img.style.display = "none";
        text.style.display = "block";
      });

      s.root.appendChild(g);
      s.trailHeads.push(g);
    }
    while (s.trailHeads.length > n) {
      s.trailHeads.pop()?.remove();
    }
  }

  private startCombat(s: Stream, now: number) {
    s.arrivedAt = now;
    const from = MAP.states[s.from];
    const to = MAP.states[s.to];
    const distance = from && to ? Math.hypot(to.cx - from.cx, to.cy - from.cy) : 100;
    const gap = Math.max(18, distance * 0.08);
    const lastSlot = Number(s.trailHeads.at(-1)?.dataset.slot ?? 0);
    s.combatDepth = Math.max(18, Math.floor(lastSlot / s.cols) * gap);
    const defender = this.snap?.states[s.to]?.troops ?? s.troops;
    s.combatDuration = Math.max(400, estimateCombatSeconds(s.troops, defender) * 1000);
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
    if (badge.hidden === on) badge.hidden = !on;
    if (on && this.selected) {
      const extra = this.origins.size > 1 ? ` +${this.origins.size - 1}` : "";
      const text = `${labelZh(this.selected)}${extra}`;
      if (name.textContent !== text) name.textContent = text;
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
      const visible = !!info?.visible;
      const isOrigin = visible && (this.origins.has(s.id) || this.selected === s.id);
      path.classList.toggle("pick", isOrigin);
      path.classList.toggle(
        "target",
        !!(
          visible &&
          (this.selected || this.origins.size) &&
          !isOrigin &&
          (this.dragTarget === s.id || !this.dragging)
        ),
      );
      if (visible && this.labels.get(s.id)) {
        const zh = isOrigin ? `${labelZh(s.id)} · 起点` : labelZh(s.id);
        this.upsertLabel(
          s.id,
          zh,
          this.snap.phase === "lobby" ? "" : String(info.ownerId === this.snap.you
            ? this.shownTroops(s.id, info) : this.displayTroops(s.id)),
          s.cx,
          s.cy,
        );
      }
    }
    this.paintOrigin();
    this.paintDragLine();
    this.tip(this.hover ?? this.selected ?? undefined);
  }

  private clickState(id: string) {
    const snap = this.snap;
    if (!snap || snap.phase !== "playing") return;
    const info = snap.states[id];

    // 点击已选中的州 → 取消选择
    if (this.selected === id) {
      this.selected = null;
      this.origins.clear();
      this.dragTarget = null;
      this.refreshPick();
      return;
    }

    if (this.isOwnControllable(id)) {
      this.origins = new Set([id]);
      this.selected = id;
      this.refreshPick();
      return;
    }

    // A tap on a visible target sends only the explicitly selected origins.
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

    if (this.selected && !info?.visible) {
      this.onNotice("目标尚未侦察");
      return;
    }

    this.selected = null;
    this.origins.clear();
    this.refreshPick();
  }

  focusHome() {
    const snap = this.snap;
    const home = MAP.states[snap?.players.find((p) => p.id === snap.you)?.home ?? ""];
    this.camera.fitCover();
    if (home) this.camera.centerOnSvg(home.cx, home.cy);
  }

  private tip(id?: string) {
    const elTip = document.getElementById("callout");
    if (!elTip) return;
    const title = elTip.querySelector("strong");
    const detail = elTip.querySelector("span");
    if (!title || !detail) return;
    if (!id || !MAP.states[id]) {
      if (title.textContent !== "州名") title.textContent = "州名";
      if (detail.textContent !== "点己方州，有视野就能出兵") detail.textContent = "点己方州，有视野就能出兵";
      return;
    }
    const info = this.snap?.states[id];
    if (!info?.visible) {
      if (title.textContent !== "迷雾") title.textContent = "迷雾";
      if (detail.textContent !== "尚未侦察") detail.textContent = "尚未侦察";
      return;
    }
    const owner = this.snap?.players.find((p) => p.id === info.ownerId);
    const heading = labelEn(id);
    const troops = info.ownerId === this.snap?.you ? this.shownTroops(id, info) : info.troops ?? 0;
    const text = `${labelZh(id)} · ${owner ? owner.name : "中立"} · ${troops} 兵`;
    if (title.textContent !== heading) title.textContent = heading;
    if (detail.textContent !== text) detail.textContent = text;
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
        const path = this.svg.getElementById(`st-${e.state}`);
        if (path) {
          path.classList.add("flash");
          window.setTimeout(() => path.classList.remove("flash"), 200);
        }
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
    for (const [id, display] of this.troopDisplays) {
      if (display.from === display.target) continue;
      const row = this.labels.get(id);
      if (row) {
        const text = String(this.displayTroops(id, now));
        if (row.n.textContent !== text) row.n.textContent = text;
      }
      if (now - display.start >= DAMAGE_TWEEN_MS) display.from = display.target;
    }
    for (const s of this.streams.values()) {
      const previousProgress = s.p;
      if (s.arrivedAt === null) s.p = Math.max(s.p, Math.min(1, (now - s.start) / s.duration));
      if (s.arrivedAt === null && s.p === previousProgress) continue;
      const a = MAP.states[s.from];
      const b = MAP.states[s.to];
      if (!a || !b) continue;

      const dx0 = b.cx - a.cx;
      const dy0 = b.cy - a.cy;
      const dist = Math.hypot(dx0, dy0) || 1;
      const dx = dx0;
      const dy = dy0;
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
        const slot = Number(th.dataset.slot);
        const col = cols === 1 ? 0 : slot % cols;
        const row = cols === 1 ? slot : Math.floor(slot / cols);
        const side = (col - (cols - 1) / 2) * sideGap;
        let along = front - row * alongGap;
        let opacity = 0.96;
        if (s.arrivedAt !== null) {
          const head = combatHeadAt(row, alongGap, s.combatDepth, now - s.arrivedAt, s.combatDuration);
          along = dist - head.back;
          opacity *= head.opacity;
        }
        if (along < 4 || opacity <= 0) {
          if (th.getAttribute("opacity") !== "0") th.setAttribute("opacity", "0");
          continue;
        }
        const x = a.cx + ux * along + px * side;
        const y = a.cy + uy * along + py * side;
        // 修复手机端bug: 提升头像不透明度,强光下更清晰
        const opacityText = String(opacity);
        if (th.getAttribute("opacity") !== opacityText) th.setAttribute("opacity", opacityText);
        th.setAttribute("transform", `translate(${x},${y})`);
      }
    }

    const canvas = this.fx;
    if (this.floaters.length) {
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
    }
    requestAnimationFrame(this.tick);
  };

  private removeStream(s: Stream) {
    s.root.remove();
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

export function combatHeadAt(row: number, gap: number, depth: number, elapsedMs: number, durationMs: number) {
  const back = row * gap - Math.min(1, elapsedMs / durationMs) * depth;
  return { back, opacity: Math.min(1, Math.max(0, back) / 8) };
}

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const n = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}
