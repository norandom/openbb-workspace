import type { ChartPointerPoint } from "./chartPointerTypes";
import type { RangePickCandidate, RangePickRange } from "./rangePointerTypes";
import { createRangeSpatialIndex } from "./rangeSpatialAdapter";

export function pickRangeSeries(
  point: ChartPointerPoint,
  major: "x" | "y",
  candidates: readonly RangePickCandidate[],
  outsideMinor = false,
) {
  const minor = major === "x" ? "y" : "x";
  let best: RangePickCandidate | undefined;
  let a = Infinity;
  let b = Infinity;
  for (const candidate of candidates) {
    if (!candidate.majorVisible || (!outsideMinor && !candidate.minorVisible)) continue;
    if (![candidate.x, candidate.y].every(Number.isFinite)) continue;
    const majorDistance = Math.abs(point[major] - candidate[major]);
    const minorDistance = Math.abs(point[minor] - candidate[minor]);
    if (majorDistance > a || (majorDistance === a && minorDistance > b)) continue;
    best = candidate;
    a = majorDistance;
    b = minorDistance;
  }
  return best
    ? { candidate: best, distance: Math.sqrt(Math.max(a * a + b * b - best.size, 0)) }
    : undefined;
}
export function pickRangeChart(
  point: ChartPointerPoint,
  major: "x" | "y",
  fields: readonly (readonly RangePickCandidate[])[],
  range: RangePickRange = "nearest",
  exact?: readonly ((p: ChartPointerPoint) => RangePickCandidate | undefined)[],
  outsideMinor = false,
) {
  let distance = Infinity;
  let matches: RangePickCandidate[] = [];
  for (let n = fields.length - 1; n >= 0; n--) {
    const aligned =
      range === "exact"
        ? undefined
        : pickRangeSeries(point, major, fields[n], outsideMinor);
    const shape =
      !aligned || (typeof range === "number" && aligned.distance > range)
        ? exact?.[n]?.(point)
        : undefined;
    const picked =
      aligned && (typeof range !== "number" || aligned.distance <= range)
        ? aligned
        : shape
          ? { candidate: shape, distance: 0 }
          : undefined;
    if (
      !picked ||
      picked.distance > distance ||
      (picked.distance === distance && distance > 0)
    )
      continue;
    if (distance !== 0 || picked.distance !== 0) matches = [];
    distance = picked.distance;
    matches.push(picked.candidate);
  }
  return matches.length ? { distance, matches } : undefined;
}
export function rangeExactPickers(
  fields: readonly (readonly RangePickCandidate[])[],
  viewport: { readonly width: number; readonly height: number },
) {
  return fields.map((field) => createRangeSpatialIndex(field, viewport));
}
