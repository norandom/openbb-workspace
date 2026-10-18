import { expect, it } from "vitest";
import { projectArea } from "../../../src/components/General/Table/Chart/echarts/cartesianArea";
import type { AreaFamily } from "../../../src/components/General/Table/Chart/echarts/cartesianAreaTypes";
import fixture from "./fixtures/area-charts.json";
import { validSnapshotInput } from "./snapshot.fixtures";

function input(rows: (number | null)[][], family: AreaFamily = "stackedArea") {
  const columns = rows[0].map((_, i) => ({ id: `s${i}`, label: `Series ${i}`, role: "number" as const }));
  return { snapshot: { ...validSnapshotInput, columns, rows: rows.map((values, i) => ({
    id: `r${i}`, category: "repeated", values: Object.fromEntries(values.map((v, j) => [`s${j}`, v])),
  })) }, columns, family, connectMissingData: false };
}

it.each(fixture.finiteRows)("retains ordered signed endpoints for $values", ({ values, prefix, normalizedPrefix }) => {
  expect(projectArea(input([values])).series.map(s => s.markers[0])).toEqual(prefix);
  projectArea(input([values], "normalizedArea")).series.forEach((s, i) => {
    expect(s.markers[0]).toBeCloseTo(normalizedPrefix[i], 12);
  });
});

it("uses stored selection order and independent zero baselines across sign changes", () => {
  const data = input([[7, -6, 5], [-4, 8, -3]]);
  expect(projectArea({ ...data, columns: [data.columns[0], data.columns[2], data.columns[1]] })
    .series.map(s => s.markers)).toEqual([[7, -4], [12, -7], [6, 1]]);
  expect(projectArea({ ...data, family: "area" }).series.map(s => s.markers))
    .toEqual([[7, -4], [-6, 8], [5, -3]]);
});

it.each(fixture.missingRows)("keeps substituted labels separate from missing financial cells $values", ({ values, processedLabelValues, normalizedPrefix }) => {
  const data = input([values], "normalizedArea");
  const before = JSON.stringify(data.snapshot);
  const result = projectArea(data);
  expect(result.series.map(s => s.labelValues[0])).toEqual(processedLabelValues);
  result.series.forEach((s, i) => expect(s.markers[0]).toBeCloseTo(normalizedPrefix[i], 12));
  expect(JSON.stringify(data.snapshot)).toBe(before);
});

it("splits lower missing boundaries and supplies phantom fills without inventing strokes", () => {
  const result = projectArea(input([[2, 3], [null, 4], [5, 6]]));
  expect(result.series[0].strokes).toEqual([]);
  expect(result.series[0].fills).toEqual([
    [{ rowIndex: 0, lower: 0, upper: 0 }, { rowIndex: 1, lower: 0, upper: 0 }],
    [{ rowIndex: 1, lower: 0, upper: 0 }, { rowIndex: 2, lower: 0, upper: 0 }],
  ]);
  expect(result.series[1].strokes).toEqual([
    [{ rowIndex: 0, value: 3 }, { rowIndex: 1, value: 4 }],
    [{ rowIndex: 1, value: 4 }, { rowIndex: 2, value: 6 }],
  ]);
  expect(result.series[1].markers).toEqual([5, 4, 11]);
});

it("falls back through middle and upper gaps to earlier stacks", () => {
  const result = projectArea(input([[2, 3, 4], [2, null, null], [2, 3, 4]]));
  expect(result.series[1].strokes).toEqual([]);
  expect(result.series[1].fills.every(span => span.every(p => p.lower === 2 && p.upper === 2))).toBe(true);
  expect(result.series[2].strokes).toEqual([]);
  expect(result.series[2].fills).toEqual(result.series[1].fills);
});

it("connects processed gaps only under the original stack-count substitution rule", () => {
  const data = input([[2, 3], [null, 4], [5, null]]);
  const result = projectArea({ ...data, connectMissingData: true });
  expect(result.series.map(s => s.labelValues)).toEqual([[2, 0, 5], [3, 4, 0]]);
  expect(result.series[1].strokes).toEqual([
    [{ rowIndex: 0, value: 3 }, { rowIndex: 1, value: 4 }],
    [{ rowIndex: 1, value: 4 }, { rowIndex: 2, value: 0 }],
  ]);
  const single = projectArea({ ...input([[2], [null], [5]]), connectMissingData: true });
  expect(single.series[0].strokes).toEqual([[{ rowIndex: 0, value: 2 }, { rowIndex: 2, value: 5 }]]);
});

it("keeps normalized single-series missing and zero markers distinct", () => {
  const result = projectArea(input([[4], [null], [0], [-2]], "normalizedArea"));
  expect(result.series[0].labelValues).toEqual([4, null, 0, -2]);
  expect(result.series[0].markers).toEqual([100, null, 0, -100]);
  expect(result.series[0].strokes).toEqual([]);
});

it("reprojects hidden membership and has finite empty/all-hidden output", () => {
  const data = input([[7, -6, 5]], "normalizedArea");
  const selected = projectArea({ ...data, legendSelection: { s1: false } }).series;
  expect(selected[0].markers[0]).toBeCloseTo(100 * 7 / 12, 12);
  expect(selected[1].markers[0]).toBeNull();
  expect(selected[2].markers[0]).toBe(100);
  const hidden = projectArea({ ...data, legendSelection: { s0: false, s1: false, s2: false } });
  expect(hidden.series.every(s => s.markers.every(v => v === null) && s.fills.length === 0)).toBe(true);
  expect(hidden.extent).toEqual({ min: 0, max: 0 });
  expect(projectArea(input([[null], [null]])).extent).toEqual({ min: 0, max: 0 });
});

it("keeps large finite normalization finite without mutating frozen rows", () => {
  const data = input([[1e308, 1e308], [-1e308, -1e308]], "normalizedArea");
  Object.freeze(data.snapshot.rows);
  data.snapshot.rows.forEach(r => { Object.freeze(r.values); Object.freeze(r); });
  const result = projectArea(data);
  expect(result.series.map(s => s.markers)).toEqual([[50, -50], [100, -100]]);
  expect(result.extent).toEqual({ min: -100, max: 100 });
});

it("rejects unrepresentable ordinary stack coordinates instead of changing the amount", () => {
  expect(() => projectArea(input([[1e308, 1e308]]))).toThrow(RangeError);
  expect(projectArea(input([[1e308, -1e308]])).series.map(s => s.markers[0])).toEqual([1e308, 0]);
});

it("retains consecutive gap slots and repeated financial category indexes", () => {
  const result = projectArea(input([[2, 3], [null, null], [null, null], [5, 6]]));
  expect(result.series[0].strokes).toEqual([]);
  expect(result.series[1].strokes).toEqual([]);
  expect(result.series[1].fills).toHaveLength(3);
  expect(result.series[1].fills.map(span => span.map(p => p.rowIndex))).toEqual([[0, 1], [1, 2], [2, 3]]);
});

it("preserves independent baseline and upper-gap phantom boundaries", () => {
  const data = input([[2, 3], [4, null], [5, 6]]);
  const result = projectArea(data);
  expect(result.series[0].strokes).toEqual([
    [{ rowIndex: 0, value: 2 }, { rowIndex: 1, value: 4 }],
    [{ rowIndex: 1, value: 4 }, { rowIndex: 2, value: 5 }],
  ]);
  expect(result.series[1].strokes).toEqual([]);
  expect(result.series[1].fills).toEqual([
    [{ rowIndex: 0, lower: 2, upper: 2 }, { rowIndex: 1, lower: 4, upper: 4 }],
    [{ rowIndex: 1, lower: 4, upper: 4 }, { rowIndex: 2, lower: 5, upper: 5 }],
  ]);
  expect(projectArea({ ...data, family: "area" }).series[0].fills.every(span => span.every(p => p.lower === 0))).toBe(true);
});

it("uses original ungrouped stroke boundaries for one selected ordinary stack", () => {
  const result = projectArea(input([[-2], [-4]]));
  expect(result.series[0].markers).toEqual([-2, -4]);
  expect(result.series[0].strokes).toEqual([
    [{ rowIndex: 0, value: -2 }, { rowIndex: 1, value: -4 }],
  ]);
  const normalized = projectArea(input([[-2], [-4]], "normalizedArea"));
  expect(normalized.series[0].strokes).toEqual([
    [{ rowIndex: 0, value: -100 }, { rowIndex: 1, value: -100 }],
  ]);
});
