import { beforeEach, expect, it, vi } from "vitest";
import { admitCombo } from "../../../src/components/General/Table/Chart/echarts/comboAdmission";
import { comboAxes } from "../../../src/components/General/Table/Chart/echarts/comboAxes";
import {
  applicationStyle,
  mappingContext,
} from "./cartesian.application.fixtures";
import { validSnapshotInput } from "./snapshot.fixtures";
function comboFixture() {
  const { application, series, line, ...common } = applicationStyle();
  const { axes, series: effective, ...shared } = application;
  return {
    snapshot: {
      ...validSnapshotInput,
      columns: [
        { id: "a", label: "A", role: "number" as const, unit: "USD", scale: 1 },
        {
          id: "b",
          label: "B",
          role: "number" as const,
          unit: "USD/share",
          scale: 1,
        },
      ],
      selectedColumnIds: ["a", "b"],
      rows: [{ id: "r", category: "Q", values: { a: 1000, b: 2 } }],
    },
    assignments: [
      { colId: "a", chartType: "stackedArea" as const },
      { colId: "b", chartType: "line" as const, secondaryAxis: true },
    ],
    style: {
      common,
      application: shared,
      axes: {
        category: axes.category,
        primary: axes.number,
        secondary: {
          b: {
            ...axes.number,
            fields: { ...axes.number.fields, position: "right" as const },
          },
        },
      },
      geometry: {
        area: { series: effective, overrides: {} },
        line: { series: effective, overrides: {} },
      },
    },
    context: mappingContext(),
  };
}

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as any),
);
function axes(input: any) {
  const result = admitCombo(input);
  if (result.status !== "admitted") throw Error(JSON.stringify(result));
  return comboAxes(result.plan);
}
it("shares ordinal row coordinates and independent extents", () => {
  const input = comboFixture();
  input.snapshot.rows.push({ id: "s", category: "Q", values: { a: 5, b: 7 } });
  const r = axes(input);
  expect(r.coordinates).toEqual(["0", "1"]);
  expect(r.xAxis.type).toBe("category");
  expect(r.yAxis[0].max).toBeGreaterThanOrEqual(1000);
  expect(r.yAxis[1].max).toBeGreaterThanOrEqual(7);
  expect(r.rightMargin).toBeGreaterThan(0);
});
it("unions a large primary line with smaller area geometry", () => {
  const input: any = comboFixture();
  input.assignments[1].secondaryAxis = false;
  input.snapshot.columns[1].unit = "USD";
  input.snapshot.rows[0].values = { a: 2, b: 1000 };
  const r = axes(input);
  expect(r.yAxis).toHaveLength(1);
  expect(r.yAxis[0].max).toBeGreaterThanOrEqual(1000);
});
it("keeps distinct all-secondary axes and stable indexes when hidden", () => {
  const input: any = comboFixture();
  input.assignments[0] = { colId: "a", chartType: "area", secondaryAxis: true };
  input.style.axes.secondary.a = input.style.axes.secondary.b;
  delete input.style.axes.primary;
  input.context.legendSelection = { a: false };
  const r = axes(input);
  expect(r.yAxis).toHaveLength(2);
  expect(r.yAxis.map((a: any) => a.position)).toEqual(["right", "right"]);
  expect(r.yAxis[1].offset).toBeGreaterThan(0);
});
it("rejects malformed continuous categories", () => {
  const input: any = comboFixture();
  input.style.axes.category.fields.type = "number";
  expect(admitCombo(input).status).toBe("invalid");
});
it("honors top and numeric side edits with independent offsets", () => {
  const input: any = comboFixture();
  input.style.axes.category.fields.position = "top";
  input.style.axes.primary.fields.position = "right";
  const r = axes(input);
  expect(r.xAxis.position).toBe("top");
  expect(r.yAxis[1].offset).toBeGreaterThan(0);
  expect(r.leftMargin).toBe(0);
});
it("keeps signed column extrema and ignores hidden geometry", () => {
  const input: any = comboFixture();
  input.assignments = [
    { colId: "a", chartType: "stackedColumn" },
    { colId: "b", chartType: "stackedColumn" },
  ];
  input.style.geometry.bar = input.style.geometry.line;
  input.snapshot.columns[1].unit = "USD";
  input.snapshot.rows[0].values = { a: -8, b: -12 };
  let r = axes(input);
  expect(r.yAxis[0].min).toBeLessThanOrEqual(-20);
  input.context.legendSelection = { b: false };
  r = axes(input);
  expect(r.yAxis[0].min).toBeGreaterThan(-20);
  expect(r.yAxis[0].min).toBeLessThanOrEqual(-8);
});
it("rejects overflowing derived stacks rather than projecting infinity", () => {
  const input: any = comboFixture();
  input.assignments = [
    { colId: "a", chartType: "stackedColumn" },
    { colId: "b", chartType: "stackedColumn" },
  ];
  input.style.geometry.bar = input.style.geometry.line;
  input.snapshot.columns[1].unit = "USD";
  input.snapshot.rows[0].values = { a: Number.MAX_VALUE, b: Number.MAX_VALUE };
  expect(() => axes(input)).toThrow(/Nonfinite/);
});
it("allocates primary then multiple secondary axes in selected order", () => {
  const input: any = comboFixture();
  input.snapshot.columns.push({
    id: "c",
    label: "C",
    role: "number",
    unit: "ratio",
    scale: 1,
  });
  input.snapshot.selectedColumnIds = ["c", "a", "b"];
  input.snapshot.rows[0].values.c = 0.25;
  input.assignments.push({
    colId: "c",
    chartType: "line",
    secondaryAxis: true,
  });
  input.style.axes.secondary.c = input.style.axes.secondary.b;
  const admitted = admitCombo(input);
  expect(admitted.status).toBe("admitted");
  if (admitted.status !== "admitted") return;
  expect(
    admitted.plan.selected.map((s) => [
      s.column.id,
      s.paletteIndex,
      s.yAxisIndex,
    ]),
  ).toEqual([
    ["c", 0, 1],
    ["a", 1, 0],
    ["b", 2, 2],
  ]);
  const r = comboAxes(admitted.plan);
  expect(r.yAxis).toHaveLength(3);
  expect(r.yAxis[2].offset).toBeGreaterThan(0);
  input.context.legendSelection = { c: false };
  const hidden = admitCombo(input);
  expect(
    hidden.status === "admitted" &&
      hidden.plan.selected.map((s) => s.yAxisIndex),
  ).toEqual([1, 0, 2]);
});
it.each(["left", "right"])(
  "measures rounded ticks and rotated labels on multiple %s axes",
  (position) => {
    const input: any = comboFixture();
    input.assignments[0] = {
      colId: "a",
      chartType: "area",
      secondaryAxis: true,
    };
    input.style.axes.secondary.a = structuredClone(
      input.style.axes.secondary.b,
    );
    input.style.axes.secondary.a.fields.position = position;
    input.style.axes.secondary.b.fields.position = position;
    input.style.axes.secondary.a.labels.rotation = 60;
    input.style.axes.secondary.a.labels.size = 20;
    input.snapshot.rows[0].values.a = 999;
    input.context.display = {
      ...input.context.display,
      numericAxis: (v: number) => (v >= 1000 ? "X".repeat(100) : String(v)),
    };
    const r = axes(input);
    expect(r.yAxis[0].max).toBe(1000);
    expect(r.yAxis[1].offset).toBeGreaterThanOrEqual(300);
    expect(
      position === "left" ? r.leftMargin : r.rightMargin,
    ).toBeGreaterThanOrEqual(300);
  },
);
it("retains same-unit secondary axes and zero/null observations", () => {
  const input: any = comboFixture();
  input.assignments[0] = { colId: "a", chartType: "area", secondaryAxis: true };
  input.style.axes.secondary.a = input.style.axes.secondary.b;
  input.snapshot.columns[1].unit = "USD";
  input.snapshot.rows[0].values = { a: 0, b: null };
  const before = JSON.stringify(input.snapshot);
  const r = axes(input);
  expect(r.yAxis).toHaveLength(2);
  expect(r.yAxis[0].min).toBe(0);
  expect(r.yAxis[1].max).toBe(0);
  expect(JSON.stringify(input.snapshot)).toBe(before);
});
