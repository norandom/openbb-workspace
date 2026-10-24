import { linearRawTicks, niceLinearExtent } from "./linearTicks";
import { finite } from "./radialData";
export const TURN = 2 * Math.PI;
export const TOP = -Math.PI / 2;
export function modulo(angle: number): number {
  return ((angle % TURN) + TURN) % TURN;
}
export function convert(
  value: number,
  domain: readonly [number, number],
  a: number,
  b: number,
): number {
  const fraction =
    domain[0] === domain[1]
      ? 0.5
      : (value - domain[0]) / (domain[1] - domain[0]);
  return finite(a + (b - a) * Math.max(0, Math.min(1, fraction)));
}
export function barDomain(extent: readonly [number, number]): [number, number] {
  if (extent[0] === extent[1]) return [...extent];
  const density = {
    tickCount: 5,
    minTickCount: 0,
    maxTickCount: Number.POSITIVE_INFINITY,
  };
  const nice = niceLinearExtent(extent, density);
  const ticks = linearRawTicks(nice, density);
  const step = finite(ticks[1] - ticks[0]);
  const count = 2 ** Math.ceil(Math.log2((nice[1] - nice[0]) / step));
  const stop =
    step >= 1
      ? Math.ceil(nice[0] / step + count) * step
      : Math.ceil((nice[0] + count * step) / step) * step;
  return [nice[0], finite(stop)];
}
export function bands(
  a: number,
  b: number,
  count: number,
  padding: number,
  outer = 0,
) {
  const p = count === 1 ? 0 : padding;
  const step =
    count === 1
      ? (b - a) * (1 - 2 * outer)
      : (b - a) / Math.max(1, count - p + 2 * outer);
  const width = step * (1 - p);
  const inset = a + (b - a - step * (count - p)) / 2;
  return {
    width,
    origin: (i: number) =>
      Math.max(Math.min(a, b), Math.min(Math.max(a, b), inset + i * step)),
  };
}
export function columnWidth(
  start: number,
  end: number,
  radius: number,
  ratio = 0.5,
  maxRatio = 0.5,
): number {
  const delta = modulo(end - start);
  return delta < 1e-3
    ? 2 * radius * maxRatio
    : Math.max(
        1,
        Math.min(
          2 * radius * maxRatio,
          Math.floor(2 * radius * Math.abs(Math.sin((delta * ratio) / 2))),
        ),
      );
}
export function connected(start: number, hole: number, width: number): boolean {
  const angle = Math.asin(width / (2 * start));
  return (
    Math.abs(start - hole) < 1e-10 &&
    Number.isFinite(angle) &&
    angle < Math.PI / 6
  );
}
