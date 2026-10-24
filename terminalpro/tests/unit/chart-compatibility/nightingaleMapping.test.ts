import { beforeEach, expect, it, vi } from "vitest";
import { input, options } from "./nightingale.fixtures";
import { nightingaleData } from "../../../src/components/General/Table/Chart/echarts/nightingaleData";

it("keeps the outer circle and numeric ticks on the top ray with axis styling", () => {
  const i = input();
  i.style.polarAxis.innerRadiusRatio = 0.2;
  const o = options(i);
  expect(o.angleAxis.axisLine.lineStyle).toEqual({ color: "#777777", width: 2 });
  expect(o.angleAxis.splitLine.show).toBe(false);
  expect(o.radiusAxis.axisLine.show).toBe(false);
  expect(o.radiusAxis.splitLine.show).toBe(false);
  expect(o.radiusAxis.axisLabel.show).toBe(false);
  const labels = o.graphic.slice(i.snapshot.rows.length);
  expect(labels.length).toBeGreaterThan(1);
  const [cx, cy] = o.polar.center;
  const [inner, outer] = o.polar.radius;
  expect(inner).toBeCloseTo(outer * 0.2);
  for (const label of labels) {
    const ratio =
      (Number(label.style.text) - o.radiusAxis.min) /
      (o.radiusAxis.max - o.radiusAxis.min);
    expect(label.x).toBe(cx - 10);
    expect(label.y).toBeCloseTo(cy - inner - ratio * (outer - inner));
    expect(label.style.fill).toBe(i.style.polarAxis.labels.color);
    expect(label.style.fontSize).toBe(i.style.polarAxis.labels.size);
  }
  expect(o.graphic[0].y).toBe(cy - outer - 22);
});
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as CanvasRenderingContext2D),
);
it("normalizes signed totals separately and retains valid neighbors of a missing point", () => {
  const i = input("normalized");
  const d = nightingaleData(i);
  expect(d.series[0].values).toEqual([10, -5, 0, null, 20, 30]);
  expect(d.series[0].scaled[1]).toBe(-50);
  expect(d.series[1].scaled[1]).toBe(100);
  expect(d.series[0].scaled[3]).toBeNull();
  expect(options(i).series[0].data).toHaveLength(5);
  expect(options(i).series[1].data).toHaveLength(6);
});
it("preserves duplicate category identity, ordering, zero and raw label/tooltip values", () => {
  const o = options(input("normalized"));
  expect(new Set(o.angleAxis.data).size).toBe(6);
  expect(o.series[0].data[2].rawValue).toBe(0);
  expect(
    o.tooltip.formatter({ data: o.series[0].data[1], seriesId: "primary" }),
  ).toContain("number:-5");
  expect(o.graphic.some((label: any) => label.style.text === "100")).toBe(true);
});
it("recomputes visible signed domains and normalization, including empty and zero inputs", () => {
  const i = input("normalized");
  const hidden = {
    ...i,
    context: { ...i.context, legendSelection: { secondary: false } },
  };
  expect(nightingaleData(hidden).series[0].scaled[1]).toBe(-100);
  expect(
    options({
      ...i,
      context: { ...i.context, legendSelection: { primary: false, secondary: false } },
    }).radiusAxis.min,
  ).toBe(0);
  expect(
    options({ ...i, snapshot: { ...i.snapshot, rows: [] } }).series[0].data,
  ).toEqual([]);
  const zero = {
    ...i,
    snapshot: {
      ...i.snapshot,
      rows: i.snapshot.rows.map((r) => ({
        ...r,
        values: { primary: 0, secondary: null },
      })),
    },
  };
  expect(nightingaleData(zero).series[0].scaled).toEqual([0, 0, 0, 0, 0, 0]);
  expect(options(zero).series[1].data).toEqual([]);
});
it("uses maximum signed extent rather than absolute sum and ignores nonfinite observations", () => {
  const i = input("normalized");
  const signed = {
    ...i,
    snapshot: {
      ...i.snapshot,
      rows: [
        { id: "s", category: "S", values: { primary: -20, secondary: -10 } },
        { id: "m", category: "M", values: { primary: Number.NaN, secondary: 5 } },
      ],
    },
  };
  const d = nightingaleData(signed);
  expect(d.extent).toEqual([-100, 100]);
  expect(d.series[0].scaled[0]).toBeCloseTo(-200 / 3);
  expect(d.series[1].scaled[0]).toBeCloseTo(-100 / 3);
  expect(d.series[0].values[1]).toBeNull();
  expect(options(signed).series[0].data).toHaveLength(1);
  expect(nightingaleData({ ...signed, groupType: "stacked" }).extent).toEqual([-30, 5]);
  expect(nightingaleData({ ...signed, groupType: "grouped" }).extent).toEqual([-20, 5]);
});
it("retains selected fiscal USD amounts without multiplying source scale metadata", () => {
  const i = input();
  const selected = {
    ...i,
    snapshot: {
      ...i.snapshot,
      columns: i.snapshot.columns.map((c) => ({ ...c, scale: 1000000 })),
      rows: [
        {
          id: "q1",
          category: "FY2025 Q1",
          values: { primary: 66025000000, secondary: 58275000000 },
        },
      ],
    },
  };
  expect(nightingaleData(selected).extent).toEqual([0, 124300000000]);
  const o = options({ ...selected, groupType: "normalized" });
  expect(o.series[0].data[0].rawValue).toBe(66025000000);
  expect(o.series[0].label.formatter({ data: o.series[0].data[0] })).toBe(
    "label:66025000000",
  );
});

it("assignment selection keeps order and rejects duplicate IDs or another family", async () => {
  const { resolveNightingaleAssignments: resolve } = await import(
    "../../../src/components/General/Table/Chart/compatibility/nightingaleAssignments"
  );
  const values = [
    { colId: "secondary", selected: true },
    { colId: "primary", selected: true },
  ];
  const result = resolve({ chartType: "nightingale", valueColumns: values });
  expect(result.status).toBe("resolved");
  if (result.status === "resolved")
    expect(result.assignments).toEqual([{ colId: "secondary" }, { colId: "primary" }]);
  expect(resolve({ chartType: "radarLine", valueColumns: values }).status).toBe(
    "invalid",
  );
  expect(
    resolve({ chartType: "nightingale", valueColumns: [values[0], values[0]] }).status,
  ).toBe("invalid");
});
