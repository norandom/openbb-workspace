import { beforeEach, expect, it, vi } from "vitest";
import { translateCombo } from "../../../src/components/General/Table/Chart/echarts/combo";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
function fixture(
  types = [
    "stackedArea",
    "stackedArea",
    "groupedColumn",
    "stackedColumn",
    "line",
  ],
) {
  const { application, series, line, ...common } = applicationStyle();
  const { axes, series: effective, ...shared } = application;
  const ids = types.map((_, i) => `s${i}`);
  return {
    snapshot: {
      ...validSnapshotInput,
      columns: ids.map((id) => ({
        id,
        label: "Same",
        role: "number",
        unit: "USD",
        scale: 1,
      })),
      selectedColumnIds: ids,
      rows: [
        [2, 3, 20, -5, 1000],
        [0, null, -8, -10, 500],
      ].map((v, i) => ({
        id: String(i),
        category: "Q",
        values: Object.fromEntries(ids.map((id, j) => [id, v[j] ?? null])),
      })),
    },
    assignments: ids.map((colId, i) => ({ colId, chartType: types[i] })),
    style: {
      common,
      application: shared,
      axes: { category: axes.category, primary: axes.number, secondary: {} },
      geometry: Object.fromEntries(
        ["area", "bar", "line"].map((g) => [
          g,
          { series: structuredClone(effective), overrides: {} },
        ]),
      ),
    },
    context: mappingContext(),
  } as any;
}
function options(input: any) {
  const r = translateCombo(input);
  expect(r.status).toBe("supported");
  if (r.status !== "supported") throw Error(JSON.stringify(r));
  return r.options as any;
}
beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({
      measureText: (s: string) => ({ width: s.length * 6 }),
    } as any),
);
it("combines separate stacks, raw tooltips, shared categories and union extent immutably", () => {
  const f = fixture();
  const before = JSON.stringify(f);
  const o = options(f);
  expect(o.xAxis.type).toBe("category");
  expect(o.xAxis.data).toEqual(["0", "1"]);
  expect(o.series.find((s: any) => s.id === "s1").data[0]).toEqual(["0", 5]);
  expect(o.series.find((s: any) => s.id === "s2").stack).toBeUndefined();
  expect(o.series.find((s: any) => s.id === "s3").stack).toBe(
    "openbb-combo-columns",
  );
  expect(o.series.find((s: any) => s.id === "s4").data[0]).toEqual(["0", 1000]);
  expect(o.yAxis[0].max).toBeGreaterThanOrEqual(1000);
  expect(o.tooltip.formatter([{ seriesId: "s1", dataIndex: 0 }])).toContain(
    "Same: number:3",
  );
  expect(JSON.stringify(f)).toBe(before);
});
it("keeps global palette positions, independent appearance and every area axis binding", () => {
  const f = fixture(["line", "area", "groupedColumn"]);
  f.snapshot.rows[1].values.s1 = 4;
  f.style.geometry.area.series.strokeWidth = 7;
  f.style.geometry.line.series.strokeWidth = 2;
  f.style.geometry.bar.series.strokeWidth = 9;
  f.assignments[1].secondaryAxis = true;
  f.style.axes.secondary.s1 = {
    ...f.style.axes.primary,
    fields: { ...f.style.axes.primary.fields, position: "right" },
  };
  const o = options(f);
  const area = o.series.find((s: any) => s.id === "s1");
  expect(area.itemStyle.color).toBe("rgba(179,59,50,0.6)");
  expect(o.series.find((s: any) => s.id === "s0").lineStyle.width).toBe(2);
  expect(o.series.find((s: any) => s.id === "s2").itemStyle.borderWidth).toBe(
    9,
  );
  expect(
    o.series
      .filter((s: any) => s.id.includes("s1"))
      .every((s: any) => s.yAxisIndex === 1),
  ).toBe(true);
  expect(
    o.series.find((s: any) => s.id.startsWith("openbb-area-stroke-s1"))
      .lineStyle.width,
  ).toBe(7);
  expect(o.grid.right).toBeGreaterThan(f.style.application.padding.right);
});
it("reserves public IDs outside area subsets and reprojects hidden stack members", () => {
  const f = fixture();
  const id = "openbb-area-fill-s0-0";
  f.snapshot.columns[4].id = id;
  f.snapshot.selectedColumnIds[4] = id;
  f.assignments[4].colId = id;
  f.snapshot.rows.forEach((r: any) => {
    r.values[id] = r.values.s4;
    delete r.values.s4;
  });
  const full = options(f);
  expect(new Set(full.series.map((s: any) => s.id)).size).toBe(
    full.series.length,
  );
  f.context.legendSelection = { s0: false };
  const hidden = options(f);
  expect(hidden.series.find((s: any) => s.id === "s1").data[0][1]).toBe(3);
  expect(full.series.find((s: any) => s.id === "s1").data[0][1]).toBe(5);
  expect(hidden.legend.selected.s0).toBe(false);
});
it("returns no partial options for malformed or overflowing geometry", () => {
  expect(translateCombo(null as any).status).toBe("invalid");
  const f = fixture(["stackedColumn", "stackedColumn"]);
  f.snapshot.rows[0].values = { s0: Number.MAX_VALUE, s1: Number.MAX_VALUE };
  const r = translateCombo(f);
  expect(r.status).toBe("invalid");
  expect(r).not.toHaveProperty("options");
});
it.each(["number", "time"])("shares continuous %s coordinates", (type) => {
  const f = fixture();
  f.style.axes.category.fields.type = type;
  f.snapshot.rows.forEach(
    (r: any, i: number) =>
      (r.category = type === "number" ? i * 10 : `2026-10-${10 + i}`),
  );
  const o = options(f);
  const x = type === "number" ? 10 : new Date("2026-10-11").getTime();
  expect(o.series.find((s: any) => s.id === "s4").data[1][0]).toBe(x);
});
it("separates independent areas from area accumulation and signed column stacks", () => {
  const f = fixture(["area", "stackedArea", "stackedArea", "stackedColumn", "stackedColumn"]);
  f.snapshot.rows[0].values = { s0: 2, s1: 3, s2: 20, s3: -5, s4: -10 };
  const o = options(f);
  expect(o.series.find((s: any) => s.id === "s0").data[0][1]).toBe(2);
  expect(o.series.find((s: any) => s.id === "s1").data[0][1]).toBe(3);
  expect(o.series.find((s: any) => s.id === "s2").data[0][1]).toBe(23);
  expect(o.series.find((s: any) => s.id === "s3").stack).toBe(o.series.find((s: any) => s.id === "s4").stack);
  expect(o.series.filter((s: any) => s.id.startsWith("openbb-area-")).every((s: any) => s.stack !== "openbb-combo-columns")).toBe(true);
  expect(o.yAxis[0].min).toBeLessThanOrEqual(-15);
  expect(o.yAxis[0].max).toBeGreaterThanOrEqual(23);
});
it("rejects finite area observations whose derived stack overflows", () => {
  const f = fixture(["stackedArea", "stackedArea"]);
  f.snapshot.rows[0].values = { s0: Number.MAX_VALUE, s1: Number.MAX_VALUE };
  const r = translateCombo(f);
  expect(r.status).toBe("invalid");
  expect(r).not.toHaveProperty("options");
});
