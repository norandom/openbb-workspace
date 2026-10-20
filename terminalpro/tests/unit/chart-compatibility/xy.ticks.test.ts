import { beforeEach, expect, it, vi } from "vitest";
import { xyTickAxis, xyPlotGeometry } from "../../../src/components/General/Table/Chart/echarts/xyTicks";
import { xyNumericExtent } from "../../../src/components/General/Table/Chart/echarts/xyDomain";

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
  measureText: (text: string) => ({ width: text.length * 6 }),
} as any));
const axis = { min: 360e9, max: 420e9, interval: 10e9,
  axisLabel: { formatter: (v: number) => `${(v / 1e9).toFixed(2)} B`, fontSize: 12 } };
it("selects measured 1/2/5 intervals without moving explicit endpoints", () => {
  const out = xyTickAxis({ ...axis, min: 361e9, max: 419e9 }, 240, true, 60, 10);
  expect(out).toMatchObject({ min: 361e9, max: 419e9, interval: 20e9 });
  expect(out.axisLabel).toMatchObject({ hideOverlap: true, showMinLabel: false, showMaxLabel: false });
  const padded = xyTickAxis(axis, 600, true, 60, 60);
  expect(padded.interval).toBe(10e9);
  expect(padded.axisLabel).toMatchObject({ showMinLabel: true, showMaxLabel: true });
});
it("projects rotation and measures perpendicular labels only when they consume plot space", () => {
  expect(xyTickAxis({ ...axis, axisLabel: { ...axis.axisLabel, rotate: 90 } }, 240, true, 60, 10).interval)
    .toBe(10e9);
  const grid = { left: 10, right: 10, containLabel: true };
  expect(xyPlotGeometry(axis, grid, 381).pixels).toBeLessThan(361);
  expect(xyPlotGeometry(axis, { ...grid, containLabel: false }, 381).pixels).toBe(361);
});
it("bounds candidate arithmetic for negative, reversed, equal and extreme domains", () => {
  for (const [min, max] of [[-420e9,-360e9],[10,10],[20,10],[-Number.MAX_VALUE,Number.MAX_VALUE]]) {
    const result = xyTickAxis({ ...axis, min, max }, 1, true, 0, 0);
    expect(result.min).toBe(min); expect(result.max).toBe(max);
    expect(result.interval === undefined || Number.isFinite(result.interval) && result.interval > 0).toBe(true);
  }
  expect(xyNumericExtent([10,10], { type: "value" }, 200).interval).toBeUndefined();
});
