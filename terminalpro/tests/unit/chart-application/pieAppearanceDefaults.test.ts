import { expect, it } from "vitest";
import { resolvePieAppearance } from "../../../src/components/General/Table/Chart/application/pieAppearance";
import { selectPieSession } from "../../../src/components/General/Table/Chart/application/pieSessionSelection";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import type { PieChartType } from "../../../src/components/General/Table/Chart/compatibility/pieAssignments";
import { sessionFixture } from "./applicationSessionFixture";

function context(family: PieChartType = "donut"): ApplicationSessionContext<PieChartType> {
  const source = sessionFixture();
  return { ...source, inputs: { ...source.inputs, family }, local: { ...source.local,
    baseline: { ...source.local.baseline, chartType: family, model: { ...source.local.baseline.model, chartType: family } } } };
}
function appearance(assignmentCount = 2, family: PieChartType = "donut") {
  const source = context(family);
  return { ...source.inputs, baseline: source.local.baseline, seriesIds: ["revenue", "income"], assignmentCount };
}
it.each([0, 1, 2])("defaults the legend from %i effective assignments without writing saved options", count => {
  const input = appearance(count);
  const before = JSON.stringify(input);
  expect(resolvePieAppearance(input).application.legend.enabled).toBe(count > 1);
  expect(JSON.stringify(input)).toBe(before);
});
it.each([-1, 0.5, NaN, Infinity, undefined])("rejects invalid assignment count %s", count => {
  expect(() => resolvePieAppearance({ ...appearance(), assignmentCount: count } as any)).toThrow();
});
it.each(["pie", "donut", "doughnut"] as const)("uses actual %s assignments for empty, one and two setup fields", family => {
  for (const ids of [["period"], ["period", "revenue"], ["period", "revenue", "income"]]) {
    const initial = context(family);
    const range = { columnIds: ids, originalRange: { columns: ids } };
    const source = { ...initial, inputs: { ...initial.inputs, range }, local: { ...initial.local, range } };
    const selected = selectPieSession({}, source);
    expect(selected.assignment.assignments).toHaveLength(family === "pie" ? Math.min(ids.length - 1, 1) : ids.length - 1);
    expect(selected.pie.application.legend.enabled).toBe(selected.assignment.assignments.length > 1);
  }
});
it.each([0, 1, 2])("uses %i actual transposed donut rings rather than two selected numeric fields", rows => {
  const initial = context();
  const source = { ...initial, local: { ...initial.local, baseline: { ...initial.local.baseline,
    model: { ...initial.local.baseline.model, switchCategorySeries: true } } },
    capture: { ...initial.capture, rows: initial.capture.rows.slice(0, rows) } };
  const selected = selectPieSession({}, source);
  expect(selected.assignment.assignments).toHaveLength(rows);
  expect(selected.pie.application.legend.enabled).toBe(rows > 1);
});
it.each([true, false])("keeps explicit legend enabled=%s above assignment fallback at each layer", enabled => {
  for (const layer of ["common", "family", "generated", "saved"] as const) {
    const input = appearance(enabled ? 1 : 2, "doughnut");
    if (layer === "common") input.theme = { ...input.theme, overrides: { common: { legend: { enabled } } } };
    if (layer === "family") input.theme = { ...input.theme, overrides: { donut: { legend: { enabled } } } };
    if (layer === "generated") input.generated = { common: { legend: { enabled } } };
    if (layer === "saved") input.baseline = { ...input.baseline, options: { donut: { legend: { enabled } } } };
    expect(resolvePieAppearance(input).application.legend.enabled).toBe(enabled);
  }
});
it("retains original theme legend bounds/shape and source series-title defaults", () => {
  const input = appearance();
  input.theme = { ...input.theme, overrides: { common: { legend: { maxHeight: 50, item: { marker: { shape: "square" } } } } } };
  const result = resolvePieAppearance(input).style;
  expect(result.legendLayout).toEqual({ maxHeight: 50, markerShape: "square" });
  expect(result.series.title).toEqual({ enabled: true, font: "Verdana, sans-serif", size: 14,
    fontWeight: 400, fontStyle: undefined, weight: "predefined", color: "#616161", spacing: 5 });
  expect(resolvePieAppearance(appearance()).style.legendLayout).toEqual({ markerShape: "square" });
});
it("composes retained legend and title values with saved family precedence and detached output", () => {
  const input = appearance(1, "doughnut");
  input.theme = { ...input.theme, overrides: {
    common: { legend: { maxHeight: 50, maxWidth: 450, item: { marker: { shape: "square" } } }, series: { title: { fontSize: 16 } } },
    donut: { legend: { maxHeight: 60 }, series: { title: { color: "purple" } } },
  } };
  input.generated = { common: { legend: { maxWidth: 400 }, series: { title: { fontSize: 18 } } } };
  input.baseline = { ...input.baseline, options: { donut: {
    legend: { maxHeight: 0, item: { marker: { shape: "diamond" } } },
    series: { title: { enabled: false, fontFamily: "Saved Face", fontSize: 22, fontWeight: 650, fontStyle: "oblique", spacing: 9 } },
  } } };
  const before = JSON.stringify(input);
  const result = resolvePieAppearance(input).style;
  expect(result.legendLayout).toEqual({ maxHeight: 0, maxWidth: 400, markerShape: "diamond" });
  expect(result.series.title).toMatchObject({ enabled: false, font: "Saved Face", size: 22, color: "purple", fontWeight: 650, fontStyle: "oblique", spacing: 9 });
  expect(result.series.title).not.toHaveProperty("text");
  (result.legendLayout as any).maxHeight = 99;
  expect(JSON.stringify(input)).toBe(before);
});
it("uses the source title mix of 38 percent toward chart background in either base theme", () => {
  const input = appearance();
  input.theme = { ...input.theme, mode: "dark", colors: { ...input.theme.colors, base: "ag-default-dark", textColor: "#ffffff", chartBackgroundColor: "#000000" } };
  expect(resolvePieAppearance(input).style.series.title.color).toBe("#9e9e9e");
});
it.each([
  { legend: { maxHeight: -1 } }, { legend: { maxWidth: Infinity } },
  { legend: { item: { marker: { shape: 5 } } } }, { series: { title: { spacing: NaN } } },
])("rejects malformed retained appearance %j", overrides => {
  const input = appearance();
  input.theme = { ...input.theme, overrides: { donut: overrides } };
  expect(() => resolvePieAppearance(input)).toThrow();
});
