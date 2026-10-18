import type { ResolvedFontStyle } from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";

export function fallbackDisplay(precision: number): ChartDisplayPolicy {
  return {
    category: (v) => v,
    numericAxis: (v) => (typeof v === "number" ? v.toFixed(precision) : v),
    crosshair: (v) => v,
    legend: (v) => v,
    seriesLabel: (v) => (typeof v === "number" ? v.toFixed(precision) : v),
    tooltipNumber: (v) => v.toFixed(precision),
  };
}
export function fontStyle(
  value: ResolvedFontStyle & { font: string; size: number; color: string },
) {
  return {
    fontFamily: value.font,
    fontSize: value.size,
    color: value.color,
    fontWeight: value.fontWeight as
      | number
      | "normal"
      | "bold"
      | "bolder"
      | "lighter"
      | undefined,
    fontStyle: value.fontStyle as "normal" | "italic" | "oblique" | undefined,
  };
}
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}
/** Original menu uses local-calendar d3 directives, including its literal %e choices. */
export function timeLabel(value: string | number, format: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number, length = 2) => String(n).padStart(length, "0");
  const tokens: Record<string, string> = {
    Y: pad(date.getFullYear(), 4),
    y: pad(date.getFullYear() % 100),
    m: pad(date.getMonth() + 1),
    d: pad(date.getDate()),
    e: String(date.getDate()).padStart(2, " "),
    B: date.toLocaleString("en-US", { month: "long" }),
    b: date.toLocaleString("en-US", { month: "short" }),
    A: date.toLocaleString("en-US", { weekday: "long" }),
    a: date.toLocaleString("en-US", { weekday: "short" }),
    H: pad(date.getHours()),
    I: pad(date.getHours() % 12 || 12),
    M: pad(date.getMinutes()),
    S: pad(date.getSeconds()),
    L: pad(date.getMilliseconds(), 3),
    p: date.getHours() < 12 ? "AM" : "PM",
    "%": "%",
  };
  return format.replace(/%([a-zA-Z%])/g, (_, token: string) => tokens[token] ?? token);
}
