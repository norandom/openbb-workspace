import { converter, type Oklch, parse } from "culori";

export type HierarchyExtent = readonly [number, number];
export class HierarchyPaintAdapterRequired extends Error {}
const oklch = converter("oklch");
const rgb = converter("rgb");
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function hierarchyFraction(value: number, domain: HierarchyExtent): number {
  const [min, max] = domain;
  if (value <= min) return 0;
  if (value >= max) return 1;
  const span = max - min;
  return Number.isFinite(span)
    ? (value - min) / span
    : (value / 2 - min / 2) / (max / 2 - min / 2);
}
export function hierarchyOpacity(color: string, opacity: number): string {
  if (opacity === 1) return color;
  const parsed = parse(color);
  if (!parsed) throw Error("Invalid hierarchy color.");
  const c = rgb(parsed);
  return `rgba(${[c.r, c.g, c.b].map((v) => Math.round(clamp(v) * 255)).join(", ")}, ${Math.round((c.alpha ?? 1) * opacity * 1000) / 1000})`;
}
function decode(value: string): Oklch {
  const parsed = parse(value);
  if (!parsed) throw Error("Invalid hierarchy color.");
  return oklch(parsed);
}
function achromatic(c: Oklch): boolean {
  return c.c < 1e-6 || c.l < 1e-6 || c.l > 1 - 1e-6;
}
export function interpolateHierarchyOklch(a: Oklch, b: Oklch, t: number): string {
  t = clamp(t);
  let first = a.h ?? 0;
  let last = b.h ?? 0;
  if (achromatic(a)) first = last;
  else if (achromatic(b)) last = first;
  else if (last - first > 180) last -= 360;
  else if (last - first < -180) last += 360;
  const mix = (x: number, y: number) => x * (1 - t) + y * t;
  const c = rgb({
    mode: "oklch",
    l: mix(a.l, b.l),
    c: mix(a.c, b.c),
    h: mix(first, last),
    alpha: mix(a.alpha ?? 1, b.alpha ?? 1),
  });
  const channels = [c.r, c.g, c.b].map((v) => Math.round(clamp(v) * 255));
  const alpha = c.alpha ?? 1;
  return alpha === 1
    ? `rgb(${channels.join(", ")})`
    : `rgba(${channels.join(", ")}, ${Math.round(alpha * 1000) / 1000})`;
}
/** Color conversion is library-owned; this wrapper preserves the pinned source's hue/alpha policy. */
export function hierarchyColorScale(range: readonly string[], domain: HierarchyExtent) {
  if (!range.length || !domain.every(Number.isFinite) || domain[0] >= domain[1])
    throw Error("Invalid hierarchy color scale.");
  const colors = range.length === 1 ? [range[0], range[0]] : [...range];
  const parsed = colors.map(decode);
  const at = (t: number): string => {
    if (t <= 0) return colors[0];
    if (t >= 1) return colors[colors.length - 1];
    const p = t * (colors.length - 1);
    const index = Math.min(Math.floor(p), colors.length - 2);
    return interpolateHierarchyOklch(parsed[index], parsed[index + 1], p - index);
  };
  const stops = [{ offset: 0, color: colors[0] }];
  // The original samples every 0.05 inside each source color-stop interval.
  for (let index = 1; index < colors.length; index++) {
    const start = (index - 1) / (colors.length - 1);
    const end = index / (colors.length - 1);
    for (let offset = start + 0.05; offset < end; offset += 0.05)
      stops.push({ offset, color: at(offset) });
    stops.push({ offset: end, color: colors[index] });
  }
  return {
    color: (value: number) => at(hierarchyFraction(value, domain)),
    stops,
  };
}
