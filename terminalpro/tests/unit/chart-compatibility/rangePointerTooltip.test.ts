import { beforeEach, describe, expect, it, vi } from "vitest";
import { composeRangeApplication } from "../../../src/components/General/Table/Chart/echarts/rangeApplication";
import { rangePointerCandidates } from "../../../src/components/General/Table/Chart/echarts/rangePointerCandidates";
import {
  rangePointerTooltip,
  rangeSharedTooltipRows,
} from "../../../src/components/General/Table/Chart/echarts/rangePointerTooltip";
import { rangeLiveInput } from "./rangeLive.fixtures";
import type { RangeBarProjection } from "../../../src/components/General/Table/Chart/echarts/rangeBarTypes";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);
function composed(family: "rangeBar" | "rangeArea" = "rangeBar") {
  const result = composeRangeApplication(rangeLiveInput(family));
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
describe("Range explicit financial tooltip identity", () => {
  it("repairs a valid post-gap Bar row using its own raw pair and escaped field label", () => {
    const c = composed();
    const picked = rangePointerCandidates(c)[0].find((d) => d.groupSlot === 2)!;
    expect(picked).toBeDefined();
    const html = rangePointerTooltip(c, picked, [true, true]);
    expect(html).toContain("Revenue &lt;USD&gt;");
    expect(html).toContain("number:5 - number:10");
    expect(html).toContain("number:7 - number:14");
    expect(rangePointerTooltip(c, picked, [false, true])).toBe("");
  });
  it("uses typed exact categories, preserves selected duplicate, and takes first valid peer", () => {
    const source = composed().projection;
    const datum = (groupSlot: number, valid = true) => ({
      ...source.fields[0].data[0],
      groupSlot,
      summary: valid ? source.fields[0].data[0].summary : null,
    });
    const projection: RangeBarProjection = {
      ...source,
      groups: [
        { slot: 0, category: 1, rowIds: [] },
        { slot: 1, category: "1", rowIds: [] },
        { slot: 2, category: 1, rowIds: [] },
      ],
      fields: [
        { ...source.fields[0], data: [datum(0), datum(1), datum(2)] },
        { ...source.fields[1], data: [datum(0, false), datum(1), datum(2)] },
      ],
    };
    expect(
      rangeSharedTooltipRows(projection, { fieldSlot: 0, groupSlot: 2 }, [true, true]),
    ).toEqual([
      { fieldSlot: 0, groupSlot: 2 },
      { fieldSlot: 1, groupSlot: 2 },
    ]);
    expect(
      rangeSharedTooltipRows(projection, { fieldSlot: 0, groupSlot: 1 }, [true, true]),
    ).toEqual([
      { fieldSlot: 0, groupSlot: 1 },
      { fieldSlot: 1, groupSlot: 1 },
    ]);
  });
  it("retains high then low Area candidates and marker size with drawing disabled", () => {
    const c = composed("rangeArea");
    const fields = rangePointerCandidates(c);
    expect(fields[0].slice(0, 2).map((d) => [d.endpoint, d.size])).toEqual([
      ["high", 6],
      ["low", 6],
    ]);
    expect(fields[0].map((d) => d.groupSlot)).toEqual([0, 0, 2, 2]);
  });
});
