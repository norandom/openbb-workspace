import { beforeEach, expect, it, vi } from "vitest";
import * as summary from "../../../src/components/General/Table/Chart/compatibility/boxSummary";
import { translateBoxPlot } from "../../../src/components/General/Table/Chart/echarts/boxPlot";
import type { BoxPlotMappingInput } from "../../../src/components/General/Table/Chart/echarts/boxPlotTypes";
import { histogramInput } from "./histogram.fixtures";

type Previous = [0, 0, 1, 2, 3, 4, 5, 6];
type Mutable<T, D extends number = 6> = D extends 0
  ? T
  : T extends (...args: never[]) => unknown
    ? T
    : { -readonly [K in keyof T]: Mutable<T[K], Previous[D]> };
function input(): Mutable<BoxPlotMappingInput> {
  const h = histogramInput([1, 3, null, 5, 7]);
  h.style.axes.x.appearance.fields.type = "category";
  const stroke = {
    stroke: "#123456",
    strokeWidth: 2,
    strokeOpacity: 0.7,
    lineDash: [3, 1],
    lineDashOffset: 1,
  };
  return {
    snapshot: h.snapshot,
    style: {
      common: h.style.common,
      application: h.style.application,
      direction: "vertical",
      axes: { category: h.style.axes.x.appearance, number: h.style.axes.y },
      band: { paddingInner: 0.3, paddingOuter: 0.15, groupPaddingInner: 0.2 },
      fields: Object.fromEntries(
        ["amount", "other"].map((id) => [
          id,
          {
            ...stroke,
            fill: "#145da0",
            fillOpacity: 0.4,
            whisker: { ...stroke },
            cap: { lengthRatio: 0.5 },
          },
        ]),
      ),
    },
    context: { ...h.context },
  };
}
function supported(i = input()) {
  const result = translateBoxPlot(i);
  if (result.status !== "supported") throw Error(JSON.stringify(result));
  return result;
}
beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (s: string) => ({ width: s.length * 6 }),
  } as unknown as CanvasRenderingContext2D),
);

it("projects ordered typed categories and raw selected measures exactly once per group/field", () => {
  const i = input();
  i.snapshot.rows.forEach((row, n) => {
    row.category = [1, "1", "", 1, "1"][n];
  });
  i.snapshot.columns[1].label = i.snapshot.columns[2].label = "<Revenue & USD>";
  i.snapshot.rows[0].values.amount = 1e9;
  i.snapshot.rows[1].values.amount = -3;
  const calculate = vi.spyOn(summary, "calculateBoxSummary");
  const r = supported(i);
  expect(r.projection.groups.map((g) => [g.slot, g.category, g.rowIds])).toEqual([
    [0, 1, ["r0", "r3"]],
    [1, "1", ["r1", "r4"]],
    [2, "", ["r2"]],
  ]);
  expect(r.projection.fields.map((f) => [f.descriptor.id, f.paletteIndex])).toEqual([
    ["amount", 0],
    ["other", 1],
  ]);
  expect(r.projection.fields[0].data[0]).toMatchObject({
    count: 2,
    sourceRowIds: ["r0", "r3"],
    summary: { min: 5, max: 1e9 },
  });
  expect(r.projection.fields[0].data[2]).toMatchObject({
    count: 0,
    summary: null,
    sourceRowIds: [],
  });
  expect(r.projection.fields[0].data[1].summary).toEqual({
    min: -3,
    q1: -0.5,
    median: 2,
    q3: 4.5,
    max: 7,
  });
  expect(calculate).toHaveBeenCalledTimes(6);
  calculate.mockRestore();
});
it("copies frozen inputs and retains stable IDs, metadata and raw tooltip values", () => {
  const i = input();
  const freeze = (v: unknown): void => {
    if (v && typeof v === "object") {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
  };
  freeze(i);
  const r = supported(i);
  expect(r.projection.fields[0].descriptor).not.toBe(i.snapshot.columns[2]);
  expect(r.options.series).toMatchObject([
    {
      id: "amount",
      name: "amount",
      type: "custom",
      encode: { x: 0, y: [1, 2, 3, 4, 5] },
    },
    { id: "other" },
  ]);
  const t = r.options.tooltip as {
    formatter: (p: unknown) => string;
    trigger: string;
    axisPointer: { axis: string };
  };
  expect(t.trigger).toBe("axis");
  expect(t.axisPointer.axis).toBe("x");
  expect(t.formatter({ axisValue: 0 })).toContain("Revenue &lt;USD&gt;");
  expect(t.formatter({ axisValue: 0 })).toContain("Median: number:4");
  expect(t.formatter({ axisValue: 0 })).not.toContain("sourceRowIds");
});
it("preserves equal, empty and bounded semantic domains without inventing observations", () => {
  const i = input();
  i.context.legendSelection = { other: false };
  i.snapshot.rows.forEach((r) => {
    r.values.amount = 5.5;
  });
  expect(supported(i).domain).toEqual({ value: [5.5, 5.5], empty: false });
  expect(supported(i).options.yAxis).toMatchObject({
    min: 5,
    max: 6,
    axisLabel: { customValues: [5, 5.2, 5.4, 5.6, 5.8, 6] },
  });
  i.style.axes.number.min = 6;
  expect(supported(i).domain).toEqual({ value: [], empty: true });
  i.style.axes.number.max = 8;
  expect(supported(i).domain).toEqual({ value: [6, 8], empty: false });
  i.snapshot.rows = [];
  expect(supported(i).domain.value).toEqual([6, 8]);
  delete i.style.axes.number.min;
  expect(supported(i).domain.empty).toBe(true);
  i.snapshot.selectedColumnIds = ["period"];
  i.style.fields = {};
  delete i.context.legendSelection;
  expect(supported(i).projection.fields).toEqual([]);
});
it("atomically rejects getters, sparse arrays, malformed styles, unknown IDs and callback failures", () => {
  const cases: ((i: Mutable<BoxPlotMappingInput>) => void)[] = [
    (i) => {
      Object.defineProperty(i.style, "direction", {
        get: () => {
          throw Error("getter");
        },
      });
    },
    (i) => {
      delete i.style.fields.amount.lineDash[0];
    },
    (i) => {
      i.style.fields.amount.whisker.strokeWidth = -1;
    },
    (i) => {
      i.style.fields.extra = i.style.fields.amount;
    },
    (i) => {
      i.context.legendSelection = { "Revenue <USD>": false };
    },
    (i) => {
      i.context.viewport.width = 0;
    },
    (i) => {
      i.style.axes.number.min = 10;
      i.style.axes.number.max = 9;
    },
    (i) => {
      i.context.display.tooltipNumber = () => {
        throw Error("callback");
      };
    },
    (i) => {
      i.context.display.numericAxis = () => Number.NaN;
    },
    (i) => {
      i.context.display.tooltipNumber = () => {
        throw new Proxy(
          {},
          {
            has() {
              throw Error("uninspectable thrown value");
            },
          },
        );
      };
    },
  ];
  for (const mutate of cases) {
    const i = input();
    mutate(i);
    const r = translateBoxPlot(i);
    expect(r.status).toBe("invalid");
    expect(r).not.toHaveProperty("options");
  }
  const i = input();
  i.style.axes.category.fields.type = "time";
  expect(translateBoxPlot(i).status).toBe("unsupported");
  i.style.axes.category.fields.type = "category";
  i.style.axes.category.fields.position = "left";
  expect(translateBoxPlot(i).status).toBe("unsupported");
  const mode = input();
  Object.assign(mode.style.application.tooltip, { mode: "unknown" });
  expect(translateBoxPlot(mode).status).toBe("unsupported");
});
it("rejects finite leaves with unrepresentable spans, normalization or geometry arithmetic", () => {
  const i = input();
  i.context.legendSelection = { other: false };
  i.style.axes.number.min = -Number.MAX_VALUE;
  i.style.axes.number.max = Number.MAX_VALUE;
  expect(translateBoxPlot(i).status).toBe("invalid");
  i.style.axes.number.min = 0;
  i.style.axes.number.max = Number.MIN_VALUE;
  expect(translateBoxPlot(i).status).toBe("invalid");
  delete i.style.axes.number.min;
  delete i.style.axes.number.max;
  i.style.fields.amount.strokeWidth = Number.MAX_VALUE;
  expect(translateBoxPlot(i).status).toBe("invalid");
});
it("keeps hidden fields and null groups and supports tooltip modes and all-hidden recovery", () => {
  const i = input();
  i.context.legendSelection = { amount: false, other: false };
  expect(supported(i).projection.fields.map((f) => f.enabled)).toEqual([false, false]);
  expect(supported(i).domain.empty).toBe(true);
  i.context.legendSelection.amount = true;
  i.style.application.tooltip.mode = "compact";
  const r = supported(i);
  const t = r.options.tooltip as { formatter: (v: unknown) => string; trigger: string };
  const data = (r.options.series as { data: unknown[] }[])[0].data[0];
  expect(t.trigger).toBe("item");
  expect(t.formatter({ data })).not.toContain("period:same");
  i.style.application.tooltip.mode = "single";
  expect((supported(i).options.tooltip as typeof t).formatter({ data })).toContain(
    "period:same",
  );
});

it("honors configured main visibility with transient legend precedence", () => {
  const i = input();
  i.style.fields.amount.visible = false;
  const hidden = supported(i);
  expect(hidden.projection.fields.map((f) => f.enabled)).toEqual([false, true]);
  expect(hidden.options.legend).toMatchObject({
    selected: { amount: false, other: true },
  });
  const shown = supported({
    ...i,
    context: { ...i.context, legendSelection: { amount: true, other: false } },
  });
  expect(shown.projection.fields.map((f) => f.enabled)).toEqual([true, false]);
  expect(shown.projection.fields[0].data).toEqual(hidden.projection.fields[0].data);
});
it.each([
  "visible",
  "showInMiniChart",
] as const)("rejects malformed configured %s before rendering", (field) => {
  const i = input();
  (i.style.fields.amount as any)[field] = "false";
  expect(translateBoxPlot(i).status).toBe("invalid");
});
