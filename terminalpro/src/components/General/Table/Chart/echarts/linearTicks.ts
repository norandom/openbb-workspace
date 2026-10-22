export interface LinearTickDensity {
  readonly tickCount: number;
  readonly minTickCount: number;
  readonly maxTickCount: number;
}
/** Retained community12.1.1 density and 1/2/5/10 linear scale arithmetic. */
export function linearTickDensity(span: number, fraction = 1): LinearTickDensity {
  if (span <= 0) return { tickCount: 0, minTickCount: 0, maxTickCount: 0 };
  const spacing = Math.min(span, Math.max(50, span / 6));
  const maxTickCount = Math.max(
    1,
    Math.floor(span / (fraction * Math.max(1, spacing))),
  );
  const minTickCount = Math.min(maxTickCount, Math.ceil(1 / fraction));
  return {
    minTickCount,
    maxTickCount,
    tickCount: Math.max(minTickCount, Math.min(maxTickCount, Math.floor(5 / fraction))),
  };
}
function step(a: number, b: number, d: LinearTickDensity): number {
  if (a === b) return Math.max(d.minTickCount, Math.min(d.maxTickCount, 1));
  const extent = Math.abs(b - a);
  const unit = 10 ** Math.floor(Math.log10(extent / d.tickCount));
  let chosen = Number.NaN;
  let distance = Number.POSITIVE_INFINITY;
  let bounded = false;
  for (const multiplier of [1, 2, 5, 10]) {
    const count = Math.ceil(extent / (multiplier * unit));
    const valid = count >= d.minTickCount && count <= d.maxTickCount;
    if (bounded && !valid) continue;
    const diff = Math.abs(count - d.tickCount);
    if (distance > diff || bounded !== valid) {
      bounded ||= valid;
      distance = diff;
      chosen = multiplier * unit;
    }
  }
  return chosen;
}
export function niceLinearExtent(
  domain: readonly [number, number],
  d: LinearTickDensity,
): [number, number] {
  let [a, b] = domain;
  if (d.tickCount === 1) {
    const extent = Math.abs(b - a);
    const unit = 10 ** Math.floor(Math.log10(extent));
    let error = Number.POSITIVE_INFINITY;
    for (const multiplier of [1, 2, 5, 10]) {
      const s = multiplier * unit;
      const low = Math.floor(domain[0] / s) * s;
      const high = Math.ceil(domain[1] / s) * s;
      const next = 1 - extent / Math.abs(high - low);
      if (error > next) {
        error = next;
        a = low;
        b = high;
      }
    }
  } else if (d.tickCount > 1) {
    for (let n = 0; n < 4; n++) {
      const s = step(a, b, d);
      const low = Math.floor(domain[0] / s) * s;
      const high = Math.ceil(domain[1] / s) * s;
      if (a === low && b === high) break;
      a = low;
      b = high;
    }
  }
  return [a, b];
}
export function linearRawTicks(
  domain: readonly [number, number],
  d: LinearTickDensity,
  visible = domain,
): number[] {
  const [a, b] = domain;
  if (d.tickCount < 1) return [];
  if (a === b) return [a];
  if (d.tickCount < 2) return [a, b].filter((v) => v >= visible[0] && v <= visible[1]);
  const s = step(a, b, d);
  if (!Number.isFinite(s) || s <= 0) throw Error("Nonfinite Box tick step.");
  const digits = Math.max(0, -Math.floor(Math.log10(s)));
  const factor = 10 ** digits;
  const first = Math.abs(Math.round(a / s) - a / s) < 1e-12 ? a : Math.ceil(a / s) * s;
  const last = Math.abs(Math.round(b / s) - b / s) < 1e-12 ? b : Math.floor(b / s) * s;
  const count = Math.floor((last - first) / s + 1e-10) + 1;
  if (!Number.isFinite(count) || count > 10000)
    throw Error("Unsupported Box tick density.");
  return Array.from(
    { length: Math.max(0, count) },
    (_, i) => Math.round((first + i * s) * factor) / factor,
  ).filter(
    (v) =>
      v >= Math.floor(visible[0] * factor) / factor &&
      v <= Math.ceil(visible[1] * factor) / factor,
  );
}
