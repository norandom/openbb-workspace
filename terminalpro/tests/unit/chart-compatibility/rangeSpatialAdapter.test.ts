import { describe, expect, it } from "vitest";
import { _ModuleSupport } from "ag-charts-community";
import { createRangeSpatialIndex } from "../../../src/components/General/Table/Chart/echarts/rangeSpatialAdapter";
import type { RangePickCandidate } from "../../../src/components/General/Table/Chart/echarts/rangePointerTypes";
function nodes(count: number): RangePickCandidate[] {
  return Array.from({ length: count }, (_, n) => ({
    key: String(n),
    fieldSlot: 0,
    groupSlot: n,
    endpoint: "bar",
    x: n % 2 ? 75 : 25,
    y: 25,
    size: 0,
    majorVisible: true,
    minorVisible: true,
    rect: { x: n % 2 ? 55 : 5, y: 5, width: 40, height: 40 },
  }));
}
describe("MIT Community Range spatial adapter", () => {
  it("instantiates the public pure helper without renderer nodes and preserves leaf first hit", () => {
    expect(typeof _ModuleSupport.QuadtreeNearest).toBe("function");
    const pick = createRangeSpatialIndex(nodes(2), { width: 100, height: 100 });
    expect(pick({ x: 25, y: 25 })?.key).toBe("0");
    expect(pick({ x: 50, y: 90 })).toBeUndefined();
  });
  it("preserves NW/NE/SW/SE insertion traversal across the capacity split", () => {
    const data = nodes(102);
    const pick = createRangeSpatialIndex(data, { width: 100, height: 100 });
    expect(pick({ x: 25, y: 25 })?.key).toBe("0");
    expect(pick({ x: 75, y: 25 })?.key).toBe("1");
  });
  it("lets NW traversal beat earlier NE insertion for overlapping rectangles after subdivision", () => {
    const data = nodes(102).map((n, index) => ({
      ...n,
      rect:
        index === 0
          ? { x: 25, y: 5, width: 100, height: 40 }
          : index === 1
            ? { x: -25, y: 5, width: 100, height: 40 }
            : { x: 89, y: 89, width: 2, height: 2 },
    }));
    expect(
      createRangeSpatialIndex(data, { width: 100, height: 100 })({ x: 50, y: 25 })?.key,
    ).toBe("1");
  });
});
