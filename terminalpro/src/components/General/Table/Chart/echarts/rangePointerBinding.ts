import type {
  ChartPointerBinding,
  ChartPointerMatch,
  ChartPointerPlan,
  ChartPointerPoint,
} from "./chartPointerTypes";
import { RangePointerOverlay } from "./rangePointerOverlay";

class RangePointerBinding implements ChartPointerBinding {
  private plan: ChartPointerPlan | undefined;
  private active: ChartPointerMatch | undefined;
  private down: ChartPointerPoint | undefined;
  private dragged = false;
  private disposed = false;
  private readonly overlay: RangePointerOverlay;
  private readonly previousPosition: string;
  private readonly handlers: Readonly<Record<string, EventListener>>;
  private readonly release: EventListener;
  constructor(
    private readonly container: HTMLElement,
    private readonly onError: (error: unknown) => void,
  ) {
    this.previousPosition = container.style.position;
    if (getComputedStyle(container).position === "static")
      container.style.position = "relative";
    this.overlay = new RangePointerOverlay(container);
    this.handlers = {
      pointermove: (e) => this.guard(() => this.move(e as PointerEvent)),
      pointerleave: () => this.resetSelection(),
      pointerdown: (e) => this.start(e as PointerEvent),
      pointercancel: () => {
        this.down = undefined;
        this.dragged = true;
        this.resetSelection();
      },
      click: (e) => this.guard(() => this.click(e as MouseEvent)),
      wheel: () => this.resetSelection(),
    };
    for (const [type, handler] of Object.entries(this.handlers))
      container.addEventListener(type, handler, { passive: true });
    this.release = (e) => this.end(e as PointerEvent);
    container.ownerDocument.addEventListener("pointerup", this.release, {
      passive: true,
    });
  }
  setPlan(plan: ChartPointerPlan | undefined) {
    this.clear();
    if (!this.disposed) this.plan = plan;
  }
  clear() {
    this.plan = undefined;
    this.resetSelection();
  }
  private resetSelection() {
    this.active = undefined;
    this.overlay.hide();
  }
  private guard(action: () => void) {
    try {
      action();
    } catch (error) {
      this.clear();
      this.onError(error);
    }
  }
  private point(event: MouseEvent): ChartPointerPoint {
    const rect = this.container.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * this.container.clientWidth) / rect.width,
      y: ((event.clientY - rect.top) * this.container.clientHeight) / rect.height,
    };
  }
  private valid(point: ChartPointerPoint) {
    const plan = this.plan;
    if (
      this.disposed ||
      !plan ||
      plan.viewport.width !== this.container.clientWidth ||
      plan.viewport.height !== this.container.clientHeight
    ) {
      this.plan = undefined;
      this.resetSelection();
      return;
    }
    const p = plan.plot;
    return point.x >= p.left &&
      point.x <= p.left + p.width &&
      point.y >= p.top &&
      point.y <= p.top + p.height
      ? plan
      : undefined;
  }
  private start(event: PointerEvent) {
    this.down = this.point(event);
    this.dragged = false;
  }
  private end(event: PointerEvent) {
    if (
      this.down &&
      Math.hypot(this.point(event).x - this.down.x, this.point(event).y - this.down.y) >
        3
    )
      this.dragged = true;
    this.down = undefined;
  }
  private move(event: PointerEvent) {
    const point = this.point(event);
    if (this.down) {
      if (Math.hypot(point.x - this.down.x, point.y - this.down.y) > 3)
        this.dragged = true;
      this.resetSelection();
      return;
    }
    this.select(point, "hover", false);
  }
  private click(event: MouseEvent) {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.select(this.point(event), "click", true);
  }
  private select(
    point: ChartPointerPoint,
    intent: "hover" | "click",
    advance: boolean,
  ) {
    const plan = this.valid(point);
    const pick = plan?.pick(point, intent);
    if (!plan || !pick?.matches.length) {
      this.resetSelection();
      return;
    }
    let index =
      plan.pagination && pick.distance === 0
        ? pick.matches.findIndex(
            (m) =>
              (m.identityKey ?? m.key) ===
              (this.active?.identityKey ?? this.active?.key),
          )
        : -1;
    index = Math.max(0, index);
    if (advance && plan.pagination && pick.distance === 0)
      index = (index + 1) % pick.matches.length;
    this.active = pick.matches[index];
    const presentation = plan.present(this.active);
    if (presentation) this.overlay.show(presentation, plan);
    else this.overlay.hide();
  }
  consumeDoubleClick(point: ChartPointerPoint): boolean {
    try {
      const plan = this.valid(point);
      const pick = plan?.pick(point, "click");
      return !!pick?.matches.length && (pick.distance === 0 || !!plan?.pagination);
    } catch (error) {
      this.clear();
      this.onError(error);
      return false;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.down = undefined;
    this.dragged = false;
    for (const [type, handler] of Object.entries(this.handlers))
      this.container.removeEventListener(type, handler);
    this.container.ownerDocument.removeEventListener("pointerup", this.release);
    this.overlay.dispose();
    if (this.container.style.position === "relative")
      this.container.style.position = this.previousPosition;
  }
}
export function createRangePointerBinding(
  container: HTMLElement,
  onError: (error: unknown) => void,
): ChartPointerBinding {
  return new RangePointerBinding(container, onError);
}
