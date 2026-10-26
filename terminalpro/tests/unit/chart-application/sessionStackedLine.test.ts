import { beforeEach, expect, it, vi } from "vitest";
import { projectApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionProjection";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { isCartesianFamily } from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";
import {
  applicationStyle,
  mappingContext,
} from "../chart-compatibility/cartesian.application.fixtures";
import { sessionFixture } from "./applicationSessionFixture";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (text: string) => ({ width: text.length * 6 }),
  } as any),
);

function fixture(family: "stackedLine" | "normalizedLine") {
  const storage = {
    chartNavigatorEnabled: true,
    chartMiniChartEnabled: true,
    partition: {
      chartModel: {
        chartType: family,
        chartOptions: { line: { series: { marker: { enabled: false } } } },
      },
    },
  };
  const context = sessionFixture(storage);
  return {
    storage,
    context,
    inputs: { ...context.inputs, family },
    state: {
      local: context.local,
      capture: context.capture,
      viewport: { width: 800, height: 500 },
    },
  };
}
function mapped(
  family: string,
  rows = sessionFixture().capture.rows,
  selection?: Record<string, boolean>,
  mode = "shared",
): any {
  const style = applicationStyle();
  style.application.tooltip.mode = mode as any;
  const result = translateCartesian(
    { ...sessionFixture().capture, rows },
    family,
    style,
    { ...mappingContext(), legendSelection: selection },
  );
  expect(result.status).toBe("supported");
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  return result.options;
}

it.each([
  "stackedLine",
  "normalizedLine",
] as const)("admits %s through the ordinary session with raw storage and full overview", (family) => {
  const f = fixture(family);
  expect(isCartesianFamily(family)).toBe(true);
  const initial = JSON.stringify(f);
  const result = projectApplicationSession(f.storage, f.inputs, f.state);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  const options = result.value.options as any;
  expect(
    options.series.every(
      (series: any) => series.type === "line" && !series.stack && !series.areaStyle,
    ),
  ).toBe(true);
  expect(result.value.model.chartType).toBe(family);
  expect(result.value.snapshot.rows[0].values).toEqual({ revenue: 100, income: 20 });
  expect(result.value.projectLegendSelection).toBeTypeOf("function");
  const hidden = result.value.projectLegendSelection!({ revenue: false }) as any;
  expect(hidden.series[0].data.every((point: any) => point[1] === null)).toBe(true);
  expect(hidden.series[1].data[0][1]).toBe(family === "normalizedLine" ? 100 : 20);
  expect(options.dataZoom[0].id).toBe("openbb-navigator");
  expect(options.grid).toHaveLength(2);
  expect(options.series).toHaveLength(4);
  expect(hidden.series).toHaveLength(4);
  expect(hidden.series.slice(2).map((series: any) => series.data)).toEqual(
    options.series.slice(2).map((series: any) => series.data),
  );
  expect(hidden.series[2].data[0][1]).toBeCloseTo(
    family === "normalizedLine" ? 100 / 1.2 : 100,
  );
  expect(hidden.series[3].data[0][1]).toBe(family === "normalizedLine" ? 100 : 120);
  expect(JSON.stringify(f)).toBe(initial);
});

it("preserves raw financial tooltips and cumulative percentage coordinates", () => {
  const rows = [
    {
      id: "quarter",
      category: "FY2025 Q1",
      values: { revenue: 66025000000, income: 58275000000 },
    },
  ];
  const options = mapped("normalizedLine", rows);
  expect(options.series[0].data[0][1]).toBeCloseTo((66025 / 124300) * 100, 10);
  expect(options.series[1].data[0][1]).toBe(100);
  expect(options.yAxis.axisLabel.formatter(60)).toBe("60%");
  const tooltip = options.tooltip.formatter([{ dataIndex: 0, seriesId: "revenue" }]);
  expect(tooltip).toContain(mappingContext().display.tooltipNumber(66025000000));
  expect(tooltip).toContain(mappingContext().display.tooltipNumber(58275000000));
});

it.each([
  "shared",
  "single",
  "compact",
])("filters hidden, missing and zero-denominator hits in %s tooltips", (mode) => {
  const missing = [
    { id: "missing", category: "Missing", values: { revenue: null, income: 20 } },
  ];
  const tooltip = mapped("normalizedLine", missing, undefined, mode).tooltip.formatter([
    { dataIndex: 0, seriesId: "income" },
  ]);
  expect(tooltip).toContain("Income");
  expect(tooltip).not.toContain("Revenue");
  const zeros = [{ id: "zero", category: "Zero", values: { revenue: 0, income: 0 } }];
  expect(
    mapped("normalizedLine", zeros, undefined, mode).tooltip.formatter([
      { dataIndex: 0, seriesId: "income" },
    ]),
  ).toBe("");
  expect(
    mapped("normalizedLine", undefined, { revenue: false }, mode).tooltip.formatter([
      { dataIndex: 0, seriesId: "income" },
    ]),
  ).not.toContain("Revenue");
});

it("reports numerical overflow distinctly and recovers on corrected data", () => {
  const context = sessionFixture();
  const snapshot = {
    ...context.capture,
    rows: [
      {
        id: "large",
        category: "Large",
        values: { revenue: Number.MAX_VALUE, income: Number.MAX_VALUE },
      },
    ],
  };
  const result = translateCartesian(
    snapshot,
    "stackedLine",
    applicationStyle(),
    mappingContext(),
  );
  expect(result.status).toBe("invalid");
  if (result.status === "invalid")
    expect(result.diagnostics[0].code).toBe("line-stack-overflow");
  expect(mapped("stackedLine").series).toHaveLength(2);
});

it("preserves the financial overflow diagnosis when hiding a cancelling middle series", () => {
  const f = fixture("stackedLine");
  const extra = { id: "third", label: "Third", role: "number" as const };
  const range = {
    ...f.inputs.range,
    columnIds: ["period", "revenue", "income", "third"],
  };
  const inputs = { ...f.inputs, columns: [...f.inputs.columns, extra], range };
  const state = {
    ...f.state,
    local: { ...f.state.local, range },
    capture: {
      ...f.state.capture,
      columns: [...f.state.capture.columns, extra],
      selectedColumnIds: range.columnIds,
      rows: [
        {
          id: "large",
          category: "Large",
          values: {
            revenue: Number.MAX_VALUE,
            income: -Number.MAX_VALUE,
            third: Number.MAX_VALUE,
          },
        },
      ],
    },
  };
  const result = projectApplicationSession(f.storage, inputs, state);
  expect(result.status).toBe("ready");
  if (result.status !== "ready") throw Error(JSON.stringify(result));
  expect(() => result.value.projectLegendSelection!({ income: false })).toThrow(
    /line-stack-overflow.*cumulative line amount/i,
  );
});
