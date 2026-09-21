// 修复手机端bug: 提升点击移动阈值,避免轻微抖动被识别为拖动
const TAP_PX = 12;
const DBL_MS = 300;

export class MapCamera {
  scale = 1;
  x = 0;
  y = 0;
  minScale = 1;
  maxScale = 6;
  private pointers = new Map<number, { x: number; y: number }>();
  private moved = false;
  private lastTap = 0;
  private pinch = { dist: 1, scale: 1, wx: 0, wy: 0 };
  private drag = { x: 0, y: 0, px: 0, py: 0 };
  private landscape: boolean | null = null;
  private selecting = false;
  onTap: (x: number, y: number) => void = () => {};
  /** Return true to claim this gesture as army select-drag (no pan). */
  onSelectStart: (clientX: number, clientY: number) => boolean = () => false;
  onSelectMove: (clientX: number, clientY: number) => void = () => {};
  onSelectEnd: (clientX: number, clientY: number) => void = () => {};

  constructor(
    private viewport: HTMLElement,
    private world: HTMLElement,
  ) {
    // 修复手机端bug: 添加touch-action防止浏览器默认手势干扰
    viewport.style.touchAction = "none";

    viewport.addEventListener("pointerdown", this.onDown, { passive: false });
    viewport.addEventListener("pointermove", this.onMove, { passive: false });
    viewport.addEventListener("pointerup", this.onUp);
    viewport.addEventListener("pointercancel", this.onUp);
    viewport.addEventListener("wheel", this.onWheel, { passive: false });
    viewport.addEventListener("contextmenu", (e) => e.preventDefault());
    viewport.addEventListener("dblclick", (e) => e.preventDefault());
    new ResizeObserver(() => {
      const w = viewport.clientWidth;
      const h = viewport.clientHeight;
      const wide = w > h;
      if (this.landscape !== null && this.landscape !== wide) this.fitCover();
      else {
        this.minScale = this.coverScale();
        this.clamp();
        this.apply();
      }
      this.landscape = wide;
    }).observe(viewport);
    this.fitCover();
  }

  coverScale() {
    const vw = this.viewport.clientWidth || 1;
    const vh = this.viewport.clientHeight || 1;
    const contain = Math.min(vw / 960, vh / 600) || 1;
    const cover = Math.max(vw / 960, vh / 600);
    return Math.max(1, cover / contain);
  }

  fitCover() {
    this.minScale = this.coverScale();
    this.scale = this.minScale;
    this.center();
    this.clamp();
    this.apply();
  }

  /** 把 SVG 坐标（viewBox 960×600）放到视口中心，竖屏裁切时能看见老家。 */
  centerOnSvg(cx: number, cy: number) {
    const vw = this.viewport.clientWidth || 1;
    const vh = this.viewport.clientHeight || 1;
    const contain = Math.min(vw / 960, vh / 600);
    const ox = (vw - 960 * contain) / 2;
    const oy = (vh - 600 * contain) / 2;
    this.minScale = this.coverScale();
    if (this.scale < this.minScale) this.scale = this.minScale;
    this.x = vw / 2 - (ox + cx * contain) * this.scale;
    this.y = vh / 2 - (oy + cy * contain) * this.scale;
    this.clamp();
    this.apply();
  }

  fitContain() {
    this.scale = 1;
    this.x = 0;
    this.y = 0;
    this.clamp();
    this.apply();
  }

  private center() {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    this.x = (vw - vw * this.scale) / 2;
    this.y = (vh - vh * this.scale) / 2;
  }

  private clamp() {
    const vw = this.viewport.clientWidth;
    const vh = this.viewport.clientHeight;
    const W = vw * this.scale;
    const H = vh * this.scale;
    if (W <= vw) this.x = (vw - W) / 2;
    else this.x = Math.min(0, Math.max(vw - W, this.x));
    if (H <= vh) this.y = (vh - H) / 2;
    else this.y = Math.min(0, Math.max(vh - H, this.y));
    this.minScale = this.coverScale();
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale));
  }

  private apply() {
    this.world.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.scale})`;
  }

  zoomAt(mx: number, my: number, next: number) {
    const wx = (mx - this.x) / this.scale;
    const wy = (my - this.y) / this.scale;
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, next));
    this.x = mx - wx * this.scale;
    this.y = my - wy * this.scale;
    this.clamp();
    this.apply();
  }

  private pt(e: PointerEvent) {
    const r = this.viewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    this.viewport.setPointerCapture(e.pointerId);
    const p = this.pt(e);
    this.pointers.set(e.pointerId, p);
    this.moved = false;
    if (this.pointers.size === 1) {
      if (this.onSelectStart(e.clientX, e.clientY)) {
        this.selecting = true;
        return;
      }
      this.selecting = false;
      this.drag = { x: this.x, y: this.y, px: p.x, py: p.y };
    } else if (this.pointers.size === 2) {
      this.selecting = false;
      const [a, b] = [...this.pointers.values()];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.pinch = {
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        scale: this.scale,
        wx: (cx - this.x) / this.scale,
        wy: (cy - this.y) / this.scale,
      };
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pt(e);
    const prev = this.pointers.get(e.pointerId)!;
    if (Math.hypot(p.x - prev.x, p.y - prev.y) > TAP_PX) this.moved = true;
    this.pointers.set(e.pointerId, p);
    e.preventDefault();
    if (this.selecting && this.pointers.size === 1) {
      this.onSelectMove(e.clientX, e.clientY);
      return;
    }
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.pinch.scale * (dist / this.pinch.dist)));
      this.x = cx - this.pinch.wx * this.scale;
      this.y = cy - this.pinch.wy * this.scale;
      this.clamp();
      this.apply();
      return;
    }
    if (!this.moved && this.pointers.size === 1) return;
    this.x = this.drag.x + (p.x - this.drag.px);
    this.y = this.drag.y + (p.y - this.drag.py);
    this.clamp();
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.pt(e);
    this.pointers.delete(e.pointerId);
    if (this.selecting && this.pointers.size === 0) {
      this.selecting = false;
      this.onSelectEnd(e.clientX, e.clientY);
      return;
    }
    if (this.pointers.size === 1) {
      const only = [...this.pointers.values()][0];
      this.drag = { x: this.x, y: this.y, px: only.x, py: only.y };
      return;
    }
    if (this.pointers.size > 0) return;
    if (this.moved) return;
    const now = performance.now();
    if (now - this.lastTap < DBL_MS) {
      this.lastTap = 0;
      if (this.scale > this.coverScale() * 1.08) this.fitCover();
      else this.zoomAt(p.x, p.y, Math.min(this.maxScale, this.scale * 1.85));
      return;
    }
    this.lastTap = now;
    this.onTap(e.clientX, e.clientY);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.viewport.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.scale * factor);
  };
}
