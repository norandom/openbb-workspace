import type { ChartPointerPlan, ChartPointerPresentation } from "./chartPointerTypes";
export class RangePointerOverlay {
  private readonly root: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly label: HTMLDivElement;
  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    this.root.dataset.openbbRangePointer = "true";
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "30",
      overflow: "hidden",
      display: "none",
    });
    this.tooltip = document.createElement("div");
    this.tooltip.setAttribute("role", "tooltip");
    Object.assign(this.tooltip.style, {
      position: "absolute",
      borderRadius: "4px",
      padding: "8px 12px",
      maxWidth: "80%",
    });
    this.line = document.createElement("div");
    Object.assign(this.line.style, {
      position: "absolute",
      opacity: ".6",
    });
    this.label = document.createElement("div");
    Object.assign(this.label.style, {
      position: "absolute",
      padding: "2px 4px",
      whiteSpace: "nowrap",
    });
    this.root.append(this.line, this.label, this.tooltip);
    container.append(this.root);
  }
  hide() {
    this.root.style.display = "none";
  }
  dispose() {
    this.root.remove();
  }
  show(presentation: ChartPointerPresentation, plan: ChartPointerPlan) {
    if (!presentation.html) {
      this.hide();
      return;
    }
    this.root.style.display = "block";
    this.paint(plan);
    this.tooltip.innerHTML = presentation.html;
    const a = presentation.anchor;
    this.tooltip.style.left = `${Math.max(0, Math.min(a.x + 12, plan.viewport.width - this.tooltip.offsetWidth))}px`;
    this.tooltip.style.top = `${Math.max(0, Math.min(a.y + 12, plan.viewport.height - this.tooltip.offsetHeight))}px`;
    const pointer = presentation.categoryPointer;
    this.line.style.display = pointer ? "block" : "none";
    this.label.style.display = pointer ? "block" : "none";
    if (!pointer) return;
    const p = plan.plot;
    const vertical = pointer.axis === "x";
    Object.assign(this.line.style, {
      left: `${vertical ? pointer.coordinate : p.left}px`,
      top: `${vertical ? p.top : pointer.coordinate}px`,
      width: `${vertical ? 1 : p.width}px`,
      height: `${vertical ? p.height : 1}px`,
    });
    this.label.textContent = pointer.label;
    Object.assign(this.label.style, {
      left: `${vertical ? pointer.coordinate : p.left}px`,
      top: `${vertical ? p.top + p.height : pointer.coordinate}px`,
    });
  }
  private paint(plan: ChartPointerPlan) {
    const p = plan.paint;
    const fontFamily = p?.fontFamily ?? "inherit";
    const fontSize = `${p?.fontSize ?? 12}px`;
    const fontWeight = String(p?.fontWeight ?? 400);
    Object.assign(this.tooltip.style, {
      background: `var(--ag-charts-tooltip-background-color, ${p?.background ?? "Canvas"})`,
      color: `var(--ag-charts-tooltip-text-color, ${p?.color ?? "CanvasText"})`,
      border: `var(--ag-charts-tooltip-border, 1px solid ${p?.borderColor ?? "currentColor"})`,
      fontFamily,
      fontSize,
      fontWeight,
    });
    this.line.style.background = p?.pointerColor ?? "currentColor";
    Object.assign(this.label.style, {
      background: `var(--ag-charts-crosshair-label-background-color, ${p?.pointerLabelBackground ?? "Canvas"})`,
      color: `var(--ag-charts-crosshair-label-text-color, ${p?.pointerLabelColor ?? "CanvasText"})`,
      fontFamily,
      fontSize,
      fontWeight,
    });
  }
}
