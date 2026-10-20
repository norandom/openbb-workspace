import { niceNumberExtent } from "./cartesianAxes";

/** Refit tick density while rounding the original endpoints, as the original linear scale does. */
export function histogramNiceExtent(
  min: number, max: number, pixels: number,
  bounds: { readonly min?: number; readonly max?: number } = {},
): { min: number; max: number; interval?: number } {
  if (![min, max, max - min].every(Number.isFinite) || !(min < max))
    throw Error("Histogram extent is not representable.");
  const fallback = { min, max };
  if (!(pixels > 0) || !Number.isFinite(pixels) ||
      (bounds.min !== undefined && bounds.max !== undefined)) return fallback;
  let current = fallback;
  let interval: number | undefined;
  for (let attempt = 0; attempt < 4; attempt++) {
    interval = niceNumberExtent(current.min, current.max, pixels).interval;
    if (interval === undefined || !Number.isFinite(interval) || !(interval > 0)) return fallback;
    const next = {
      min: bounds.min ?? Math.floor(min / interval) * interval,
      max: bounds.max ?? Math.ceil(max / interval) * interval,
    };
    if (![next.min, next.max, next.max - next.min].every(Number.isFinite) ||
        !(next.min < next.max) || next.min > min || next.max < max) return fallback;
    if (next.min === current.min && next.max === current.max) break;
    current = next;
  }
  return { ...current, interval };
}
