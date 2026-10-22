import { describe, expect, it } from "vitest";
import {
  pickRangeChart,
  pickRangeSeries,
} from "../../../src/components/General/Table/Chart/echarts/rangePointerPick";
import type { RangePickCandidate } from "../../../src/components/General/Table/Chart/echarts/rangePointerTypes";

const candidate = (
  fieldSlot: number,
  groupSlot: number,
  x: number,
  y: number,
  size = 0,
): RangePickCandidate => ({
  key: `${fieldSlot}:${groupSlot}`,
  fieldSlot,
  groupSlot,
  endpoint: "low",
  x,
  y,
  size,
  majorVisible: true,
  minorVisible: true,
});
describe("Range source pixel ranking", () => {
  it("ranks major then minor, replaces exact ties, and subtracts literal marker size", () => {
    const nodes = [
      candidate(0, 0, 10, 20),
      candidate(0, 1, 10, 12),
      candidate(0, 2, 10, 12, 6),
    ];
    expect(pickRangeSeries({ x: 8, y: 10 }, "x", nodes)).toMatchObject({
      candidate: { groupSlot: 2 },
      distance: Math.sqrt(2),
    });
    expect(
      pickRangeSeries({ x: 10, y: 10 }, "x", [candidate(0, 0, 10, 12, 6)])?.distance,
    ).toBe(0);
  });
  it("uses reverse field scalar ties and collects every zero-distance field", () => {
    const fields = [[candidate(0, 0, 10, 10, 6)], [candidate(1, 0, 10, 10, 6)]];
    expect(
      pickRangeChart({ x: 10, y: 10 }, "x", fields)?.matches.map((m) => m.fieldSlot),
    ).toEqual([1, 0]);
    expect(
      pickRangeChart({ x: 20, y: 20 }, "x", fields)?.matches.map((m) => m.fieldSlot),
    ).toEqual([1]);
  });
  it("rejects invisible minor candidates but admits a requested outside-minor policy", () => {
    const node = { ...candidate(0, 0, 10, 10), minorVisible: false };
    expect(pickRangeSeries({ x: 10, y: 10 }, "x", [node])).toBeUndefined();
    expect(pickRangeSeries({ x: 10, y: 10 }, "x", [node], true)?.distance).toBe(0);
  });
});
