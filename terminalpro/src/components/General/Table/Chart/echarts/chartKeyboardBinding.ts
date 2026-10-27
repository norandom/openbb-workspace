import { groupedBarBounds } from "./chartKeyboardGeometry";
import type {
  ChartKeyboardBinding,
  ChartKeyboardPorts,
  GroupedBarKeyboardPlan,
} from "./chartKeyboardTypes";

/** The plot owns one tab stop; renderer state remains behind the lifecycle's narrow ports. */
export function createChartKeyboardBinding(
  ports: ChartKeyboardPorts,
): ChartKeyboardBinding {
  let plan: GroupedBarKeyboardPlan | undefined;
  let scope: string | undefined;
  let seriesId: string | undefined;
  let category = 0;
  let plot: HTMLDivElement | undefined;
  let outline: HTMLDivElement | undefined;
  let announcement: HTMLDivElement | undefined;
  let disposed = false;

  function invoke(action: () => void): void {
    if (disposed || !plan || !ports.isActive()) return;
    try {
      action();
    } catch (error) {
      ports.fail(error);
    }
  }

  function clear(): void {
    if (outline) outline.hidden = true;
    ports.clear();
  }

  function visible() {
    const selected = ports.readSelected();
    return (
      plan?.series.filter((series) => selected[series.name] !== false) ?? []
    );
  }

  function paint(): void {
    if (!plan || !plot || !outline) return;
    const series = visible();
    const active = series.find((item) => item.id === seriesId) ?? series[0];
    seriesId = active?.id;
    category = Math.max(0, Math.min(category, plan.categories.length - 1));
    const bounds =
      active &&
      groupedBarBounds(
        plan,
        ports.readSelected(),
        active.id,
        category,
        ports.convertToPixel,
      );
    plot.setAttribute(
      "aria-label",
      bounds && active
        ? `${plan.label}: ${plan.categories[category]}, ${active.name}, ${active.values[category]}`
        : `${plan.label}: No visible data`,
    );
    if (announcement)
      announcement.textContent =
        document.activeElement === plot ? plot.getAttribute("aria-label") : "";
    if (document.activeElement !== plot) {
      outline.hidden = true;
      return;
    }
    if (!bounds || !active) {
      clear();
      return;
    }
    Object.assign(outline.style, {
      left: `${bounds.x}px`,
      top: `${bounds.y}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      outline: `${plan.focus.borderWidth}px solid ${plan.focus.color}`,
      boxShadow: `0 0 0 ${plan.focus.borderWidth * 2}px ${plan.focus.backgroundColor}`,
    });
    outline.hidden = false;
    ports.highlight(active.id, category);
  }

  function keydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      return;
    }
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    invoke(() => {
      if (event.key === "ArrowLeft") category--;
      if (event.key === "ArrowRight") category++;
      const series = visible();
      const current = Math.max(
        0,
        series.findIndex((item) => item.id === seriesId),
      );
      if (event.key === "ArrowUp" || event.key === "ArrowDown")
        seriesId =
          series[
            Math.max(
              0,
              Math.min(
                series.length - 1,
                current + (event.key === "ArrowDown" ? 1 : -1),
              ),
            )
          ]?.id;
      paint();
    });
  }

  function ensure(): void {
    if (plot) return;
    plot = document.createElement("div");
    plot.dataset.chartKeyboard = "plot";
    plot.tabIndex = 0;
    plot.setAttribute("role", "img");
    Object.assign(plot.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      outline: "none",
    });
    plot.addEventListener("keydown", keydown);
    plot.addEventListener("focus", focus);
    plot.addEventListener("blur", blur);
    outline = document.createElement("div");
    outline.dataset.chartKeyboard = "outline";
    outline.setAttribute("aria-hidden", "true");
    Object.assign(outline.style, {
      position: "absolute",
      pointerEvents: "none",
      zIndex: "1",
      boxSizing: "border-box",
    });
    outline.hidden = true;
    // Insert before legend mirrors to preserve plot -> legend -> settings tab order.
    ports.container.prepend(plot);
    ports.container.append(outline);
    announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    Object.assign(announcement.style, {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clipPath: "inset(50%)",
    });
    ports.container.append(announcement);
  }

  function focus(): void {
    invoke(paint);
  }
  function blur(): void {
    invoke(clear);
    if (announcement) announcement.textContent = "";
  }

  function remove(): void {
    plot?.removeEventListener("keydown", keydown);
    plot?.removeEventListener("focus", focus);
    plot?.removeEventListener("blur", blur);
    plot?.remove();
    outline?.remove();
    announcement?.remove();
    plot = undefined;
    outline = undefined;
    announcement = undefined;
  }

  function sync(
    next: GroupedBarKeyboardPlan | undefined,
    nextScope: string | undefined,
  ): void {
    if (disposed) return;
    if (scope !== nextScope) {
      seriesId = undefined;
      category = 0;
    }
    scope = nextScope;
    plan = next;
    if (!plan) {
      clear();
      remove();
      return;
    }
    ensure();
    paint();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    plan = undefined;
    try {
      clear();
    } finally {
      remove();
    }
  }
  return { sync, clear, dispose };
}
