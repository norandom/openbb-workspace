import type { RangeAreaInterpolation } from "./rangeAreaTypes";
export type Point = readonly [number, number];
export function finitePoints(points: readonly Point[]): void {
  if (points.some((p) => p.some((v) => !Number.isFinite(v))))
    throw Error("Nonfinite Range Area geometry.");
}
function gradients(p: readonly Point[]): number[] {
  const g = p.map((v, i) => {
    const a = p[Math.max(0, i - 1)];
    const b = p[Math.min(p.length - 1, i + 1)];
    if (Math.sign(a[1] - v[1]) === Math.sign(b[1] - v[1])) return 0;
    if (i > 0 && i < p.length - 1) {
      const range = Math.abs(a[1] - b[1]);
      const previous = Math.abs(v[1] - a[1]) / range;
      const next = Math.abs(v[1] - b[1]) / range;
      if (previous <= 0.05 || 1 - previous <= 0.05 || next <= 0.05 || 1 - next <= 0.05)
        return 0;
    }
    return (b[1] - a[1]) / (b[0] - a[0]);
  });
  if (g.length > 1) {
    if (g[1] === 0) g[0] *= 2;
    if (g[g.length - 2] === 0) g[g.length - 1] *= 2;
  }
  return g;
}
function cubic(
  a: Point,
  b: Point,
  previous: number,
  current: number,
  tension: number,
): string {
  const dx = b[0] - a[0];
  const d = (dx * tension) / 3;
  const dy = b[1] - a[1];
  let x1 = d;
  let y1 = (dx * previous * tension) / 3;
  let x2 = d;
  let y2 = (dx * current * tension) / 3;
  if (current === 0 && Math.abs(y1) > Math.abs(dy)) {
    x1 *= Math.abs(dy / y1);
    y1 = Math.sign(y1) * Math.abs(dy);
  }
  if (previous === 0 && Math.abs(y2) > Math.abs(dy)) {
    x2 *= Math.abs(dy / y2);
    y2 = Math.sign(y2) * Math.abs(dy);
  }
  const p: Point = [a[0] + x1, a[1] + y1];
  const q: Point = [b[0] - x2, b[1] - y2];
  finitePoints([p, q]);
  return `C${p.join(" ")} ${q.join(" ")} ${b.join(" ")}`;
}
export function boundary(
  points: readonly Point[],
  mode: RangeAreaInterpolation,
): string {
  finitePoints(points);
  if (!points.length) return "";
  if (points.length === 1) return `M${points[0].join(" ")}`;
  const g = mode.type === "smooth" ? gradients(points) : [];
  const commands = [`M${points[0].join(" ")}`];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b[0] - a[0];
    if (mode.type === "linear") commands.push(`L${b.join(" ")}`);
    else if (mode.type === "step") {
      const x = a[0] + dx * { start: 0, middle: 0.5, end: 1 }[mode.position];
      commands.push(`L${x} ${a[1]}L${x} ${b[1]}L${b.join(" ")}`);
    } else {
      commands.push(cubic(a, b, g[i - 1], g[i], mode.tension));
    }
  }
  return commands.join("");
}
export function areaPaths(
  low: readonly Point[],
  high: readonly Point[],
  mode: RangeAreaInterpolation,
) {
  const upper = boundary(high, mode);
  const lower = boundary(low, mode);
  // Reversing points preserves the source gradient and exchanges cubic control order.
  const reverseMode =
    mode.type === "step"
      ? {
          ...mode,
          position: ({ start: "end", middle: "middle", end: "start" } as const)[
            mode.position
          ],
        }
      : mode;
  const reverse = boundary([...low].reverse(), reverseMode).replace(/^M/, "L");
  return { fill: `${upper + reverse}Z`, outline: upper + lower };
}
export function partition<T>(data: readonly (T | null)[], connect: boolean): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const value of data) {
    if (value !== null) current.push(value);
    else if (!connect && current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}
