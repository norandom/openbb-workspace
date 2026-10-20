import { beforeEach, expect, it, vi } from "vitest";
import { resolveXyAssignments } from "../../../src/components/General/Table/Chart/compatibility/xyAssignments";
import { translateXy } from "../../../src/components/General/Table/Chart/echarts/xy";
import { xyInput } from "./xy.fixtures";
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as any),
);
it("rejects nonfinite derived layout without partial options", () => {
  const input: any = xyInput();
  input.style.application.padding.top = Number.MAX_VALUE;
  input.style.application.title.spacing = Number.MAX_VALUE;
  expect(translateXy(input).status).toBe("invalid");
});
function mapped(input: any = xyInput()): any {
  const result = translateXy(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result.options;
}
it("projects raw numeric observations and signed linear bubble diameters", () => {
  const input = xyInput();
  const result = translateXy(input);
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  const series = (result.options.series as any[])[0];
  expect(series.data.map((d: any) => d.value)).toEqual([
    [1, 10],
    [2, 20],
    [3, 30],
  ]);
  expect(series.data.map((d: any) => d.diameter)).toEqual([9, 19.5, 30]);
  expect(series.data[0].metadata.rowId).toBe("r0");
});
it("uses sizes on omitted coordinate rows and minimum for absent/null sizes", () => {
  const input: any = xyInput();
  input.snapshot.rows = [
    { id: "missing", category: "a", values: { x: null, y: 1, s: -10 } },
    { id: "a", category: "a", values: { x: 2, y: 5, s: 0 } },
    { id: "b", category: "a", values: { x: 2, y: 5, s: null } },
    { id: "c", category: "a", values: { x: 2, y: 5 } },
    { id: "d", category: "a", values: { x: 2, y: null, s: 10 } },
  ];
  const data = mapped(input).series[0].data;
  expect(data.map((d: any) => d.diameter)).toEqual([19.5, 9, 9]);
  expect(data.map((d: any) => d.metadata.rowIndex)).toEqual([1, 2, 3]);
});
it.each([0, -5, 8])("uses equal size domain midpoint for %s", (size) => {
  const input: any = xyInput();
  input.snapshot.rows.forEach((r: any) => (r.values.s = size));
  expect(mapped(input).series[0].data.map((d: any) => d.diameter)).toEqual([
    19.5, 19.5, 19.5,
  ]);
});
it("handles opposite extreme finite size endpoints and reversed diameters", () => {
  const input: any = xyInput();
  input.snapshot.rows.forEach(
    (r: any, i: number) =>
      (r.values.s = [-Number.MAX_VALUE, 0, Number.MAX_VALUE][i]),
  );
  input.style.series.markers.size = 30;
  input.style.maxSize = 0;
  expect(mapped(input).series[0].data.map((d: any) => d.diameter)).toEqual([
    30, 15, 0,
  ]);
});
it.each(["scatter", "bubble"])(
  "preserves X1 grouping modes for %s, trailing fields and raw identity",
  (chartType) => {
    for (const paired of [true, false]) {
      const input: any = xyInput();
      input.chartType = chartType;
      const ids = ["x", "y", "s", "a", "b", "c", "d"];
      input.snapshot.columns = [
        input.snapshot.columns[0],
        ...ids.map((id) => ({ id, label: "same", role: "number" })),
      ];
      input.snapshot.selectedColumnIds = ["period", ...ids];
      input.snapshot.rows.forEach((r: any) =>
        Object.assign(r.values, { a: 3, b: 4, c: 5, d: 6 }),
      );
      const assignment = resolveXyAssignments({
        chartType,
        paired,
        valueColumns: ids.map((colId) => ({ colId, selected: true })),
      });
      if (assignment.status !== "resolved") throw Error();
      input.assignments = assignment.assignments;
      const before = JSON.stringify(input);
      const options = mapped(input);
      expect(options.series).toHaveLength(assignment.assignments.length);
      expect(new Set(options.series.map((s: any) => s.id)).size).toBe(
        options.series.length,
      );
      expect(options.series.map((s: any) => s.name)).toEqual(
        assignment.assignments.map((a) => a.yColId),
      );
      expect(JSON.stringify(input)).toBe(before);
    }
  },
);
it("cycles fill/stroke palettes independently and honors all override precedence", () => {
  const input: any = xyInput();
  input.style.series.fillOpacity = 1;
  input.style.series.strokeOpacity = 1;
  input.style.application.palette = {
    fills: ["red"],
    strokes: ["blue", "green"],
  };
  input.assignments.push({ xColId: "x", yColId: "s", sizeColId: "y" });
  let options = mapped(input);
  expect(options.series[1].itemStyle).toMatchObject({
    color: "red",
    borderColor: "green",
    borderWidth: 2,
  });
  for (const o of [
    { color: "black" },
    { color: "black", fill: "yellow", stroke: "orange", strokeWidth: 4 },
    {
      color: "black",
      fill: "yellow",
      stroke: "orange",
      markerFill: "pink",
      markerStroke: "purple",
      markerStrokeWidth: 7,
    },
  ]) {
    input.style.overrides = { y: o };
    const s = mapped(input).series[0];
    expect(s.itemStyle.color).toBe(
      (o as any).markerFill ?? (o as any).fill ?? o.color,
    );
    expect(s.itemStyle.borderColor).toBe(
      (o as any).markerStroke ?? (o as any).stroke ?? o.color,
    );
    expect(s.itemStyle.borderWidth).toBe(
      (o as any).markerStrokeWidth ?? (o as any).strokeWidth ?? 2,
    );
  }
  input.style.overrides = { y: { lineWidth: 300 } };
  input.style.series.strokeWidth = 100;
  expect(mapped(input).series[0].itemStyle.borderWidth).toBe(2);
  input.context.legendSelection = { y: false };
  options = mapped(input);
  expect(options.series[0].name).toBe("s");
  expect(options.series[0].itemStyle.borderColor).toBe("green");
});
it("keeps domains per series and invariant under legend filtering", () => {
  const input: any = xyInput();
  input.snapshot.rows.forEach(
    (r: any, i: number) => (r.values.y = [100, 200, 500][i]),
  );
  input.assignments.push({ xColId: "x", yColId: "s", sizeColId: "y" });
  const before = mapped(input).series[1].data.map((d: any) => d.diameter);
  expect(before).toEqual([9, 14.25, 30]);
  expect(mapped(input).series[0].data.map((d: any) => d.diameter)).toEqual([
    9, 19.5, 30,
  ]);
  input.context.legendSelection = { y: false };
  expect(mapped(input).series[0].data.map((d: any) => d.diameter)).toEqual(
    before,
  );
});
it.each(["circle", "square", "cross", "diamond", "plus", "triangle", "heart"])(
  "supports marker %s in both families",
  (shape) => {
    for (const chartType of ["scatter", "bubble"]) {
      const input: any = xyInput();
      input.chartType = chartType;
      input.style.series.markers.shape = shape;
      if (chartType === "scatter") delete input.assignments[0].sizeColId;
      const s = mapped(input).series[0];
      expect(s.symbol).not.toContain("undefined");
      expect(s.symbolSize(null, { data: s.data[0] })).toBeTruthy();
      input.style.series.markers.enabled = false;
      const hidden = mapped(input).series[0];
      expect(hidden.symbolSize(null, { data: hidden.data[0] })).toBe(0);
      expect(hidden.data).toHaveLength(3);
    }
  },
);
it("formats item tooltip from raw datum identities and explicit category/y label mode", () => {
  const input: any = xyInput();
  input.snapshot.columns[1].label = "<X>";
  input.snapshot.rows[0].category = "<same>";
  const options = mapped(input),
    s = options.series[0];
  expect(options.tooltip.trigger).toBe("item");
  expect(options.tooltip.formatter({ data: s.data[0], dataIndex: 2 })).toBe(
    "period:&lt;same&gt;<br/>y: number:10<br/>&lt;X&gt;: number:1<br/>s: number:-1",
  );
  expect(s.label.formatter({ data: s.data[0] })).toBe("label:<same>");
  input.context.labels = "y";
  const y = mapped(input).series[0];
  expect(y.label.formatter({ data: y.data[0] })).toBe("label:10");
});
it.each([
  [2, 10, -3],
  [-8, -2, -5],
  [4, 4, 4],
])(
  "sorts tooltip raw values descending stably without deduplicating labels (%s,%s,%s)",
  (x, y, size) => {
    const input: any = xyInput();
    input.snapshot.rows[0].values = { x, y, s: size };
    input.snapshot.columns
      .slice(1)
      .forEach((c: any) => (c.label = "duplicate"));
    const options = mapped(input);
    const text = options.tooltip.formatter({ data: options.series[0].data[0] });
    const expected = [x, y, size]
      .sort((a, b) => b - a)
      .map((v) => `duplicate: number:${v}`);
    expect(text.split("<br/>").slice(1)).toEqual(expected);
    input.snapshot.columns[1].label = "X";
    input.snapshot.columns[2].label = "Y";
    input.snapshot.columns[3].label = "Size";
    const unique = mapped(input);
    const rows = unique.tooltip
      .formatter({ data: unique.series[0].data[0] })
      .split("<br/>")
      .slice(1);
    if (x === y && y === size)
      expect(rows).toEqual(["X: number:4", "Y: number:4", "Size: number:4"]);
  },
);
it("supports empty assignments/rows and preserves unknown fields", () => {
  const input: any = xyInput();
  input.assignments = [];
  expect(mapped(input).series).toEqual([]);
  input.assignments = [{ xColId: "x", yColId: "y", sizeColId: "s" }];
  input.snapshot.rows = [];
  input.style.extra = true;
  input.style.series.extra = { a: 1 };
  expect(mapped(input).series[0].data).toEqual([]);
});
it.each(["x", "y"])("rejects invalid bounds independently on %s", (axis) => {
  for (const bounds of [
    { min: 1, max: 1 },
    { min: 2, max: 1 },
    { min: NaN },
    { max: Infinity },
    { min: "2" },
  ]) {
    const input: any = xyInput();
    Object.assign(input.style.axes[axis], bounds);
    expect(translateXy(input).status).toBe("invalid");
  }
});
it("classifies malformed supplied fields separately from supported vocabulary", () => {
  for (const mutate of [
    (i: any) => (i.style.series.markers.size = -1),
    (i: any) => (i.style.maxSize = Infinity),
    (i: any) => (i.style.series.strokeWidth = -1),
    (i: any) => (i.style.series.connectMissingData = 1),
    (i: any) => (i.style.overrides = { y: { lineWidth: NaN } }),
    (i: any) => (i.style.series.fillOpacity = 2),
    (i: any) => (i.style.application.palette.fills = []),
    (i: any) => (i.style.axes.x.appearance.labels = null),
    (i: any) => (i.assignments[0].yColId = "x"),
    (i: any) => (i.snapshot.rows[0].values.x = NaN),
    (i: any) => (i.context.labels = "inferred"),
    (i: any) => (i.style.series.markers.shape = 3),
  ]) {
    const input: any = xyInput();
    mutate(input);
    expect(translateXy(input).status).toBe("invalid");
  }
  for (const mutate of [
    (i: any) => (i.style.series.markers.shape = "star"),
    (i: any) => (i.style.axes.y.appearance.fields.type = "log"),
  ]) {
    const input: any = xyInput();
    mutate(input);
    expect(translateXy(input).status).toBe("unsupported");
  }
});
