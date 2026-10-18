import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { cartesianNavigator } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";
import { sessionFixture } from "../chart-application/applicationSessionFixture";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import reference from "./fixtures/normalized-bars.json";
import { validSnapshotInput } from "./snapshot.fixtures";

beforeEach(() =>
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    measureText: (value: string) => ({ width: value.length * 6 }),
  } as any),
);
const snapshot = {
  ...validSnapshotInput,
  selectedColumnIds: reference.series,
  columns: reference.series.map((id) => ({ id, label: id, role: "number" as const })),
  rows: reference.rows.map((row, index) => ({
    id: String(index),
    category: row.category,
    values: Object.fromEntries(reference.series.map((id, i) => [id, row.raw[i]])),
  })),
};
function mapped(
  family: string,
  selection?: Record<string, boolean>,
  rows = snapshot.rows,
): any {
  const style = applicationStyle();
  if (family === "normalizedBar") {
    style.application.axes.category.fields.position = "left";
    style.application.axes.number.fields.position = "bottom";
  }
  const result = translateCartesian({ ...snapshot, rows }, family, style, {
    ...mappingContext(),
    legendSelection: selection,
  });
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  return result.options;
}
it.each([
  "normalizedColumn",
  "normalizedBar",
])("normalizes %s signed endpoints and legend membership", (family) => {
  for (const hidden of [false, true]) {
    const options = mapped(family, hidden ? { Second: false } : undefined);
    reference.series.forEach((_, i) =>
      expect(options.series[i].data).toEqual(
        reference.rows.map((r) => {
          const value = ("secondHidden" in r && hidden ? r.secondHidden : r.all)!
            .segments[i];
          return value === null ? null : expect.closeTo(value!, 12);
        }),
      ),
    );
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 500,
    });
    try {
      chart.setOption({ ...options, animation: false });
      const horizontal = family === "normalizedBar";
      reference.series.forEach((_, i) =>
        reference.rows.forEach((row, j) => {
          const ends = ("secondHidden" in row && hidden ? row.secondHidden : row.all)!
            .endpoints[i];
          if (!ends) return;
          const layout = (chart as any)
            .getModel()
            .getSeriesByIndex(i)
            .getData()
            .getItemLayout(j);
          const axis = horizontal ? { xAxisIndex: 0 } : { yAxisIndex: 0 };
          const start = chart.convertToPixel(axis, ends[0]) as number;
          const end = chart.convertToPixel(axis, ends[1]) as number;
          expect(horizontal ? layout.x : layout.y).toBeCloseTo(start, 5);
          expect(horizontal ? layout.width : layout.height).toBeCloseTo(end - start, 5);
        }),
      );
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  }
});
it("keeps raw labels/tooltips, percentage precedence and magnitude crosshair", () => {
  const options = mapped("normalizedColumn");
  expect(options.series[0].label.formatter({ dataIndex: 0 })).toBe(
    mappingContext().display.seriesLabel(7),
  );
  expect(options.tooltip.formatter([{ dataIndex: 0, seriesId: "First" }])).toContain(
    mappingContext().display.tooltipNumber(7),
  );
  expect(options.yAxis.axisLabel.formatter(28.57)).toBe("29%");
  expect(options.yAxis.axisPointer.label.formatter({ value: 28.57 })).toBe(
    String(mappingContext().display.crosshair(28.57)),
  );
});
it.each([
  "normalizedColumn",
  "normalizedBar",
])("keeps %s overview independent and navigation on physical X", (family) => {
  const full = mapped(family);
  const options: any = cartesianNavigator(
    mapped(family, { Second: false }),
    true,
    true,
    sessionFixture({}).inputs.theme,
    { width: 800 },
    full,
  );
  expect(options.series.slice(3).map((s: any) => s.data)).toEqual(
    full.series.map((s: any) => s.data),
  );
  expect(options.dataZoom[0]).toMatchObject({
    xAxisIndex: [0],
    filterMode: family === "normalizedBar" ? "none" : "filter",
  });
  expect(options.xAxis[1].type).toBe(family === "normalizedBar" ? "value" : "category");
});
it("does not manufacture observations for zero, missing or all-hidden categories", () => {
  for (const values of [
    { First: 0, Second: 0, Third: null },
    { First: null, Second: null, Third: null },
  ]) {
    const options = mapped("normalizedColumn", undefined, [
      { id: "empty", category: "empty", values },
    ]);
    expect(options.series.map((s: any) => s.data)).toEqual([[null], [null], [null]]);
  }
  const options = mapped(
    "normalizedColumn",
    Object.fromEntries(reference.series.map((id) => [id, false])),
  );
  expect(options.series.every((s: any) => s.data.every((v: any) => v === null))).toBe(
    true,
  );
});

it.each([
  "normalizedColumn",
  "normalizedBar",
])("retains %s native overview endpoints through physical-X cropping", (family) => {
  const full = mapped(family);
  const options: any = cartesianNavigator(
    mapped(family, { Second: false }),
    true,
    true,
    sessionFixture({}).inputs.theme,
    { width: 800 },
    full,
  );
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({ ...options, animation: false });
    const horizontal = family === "normalizedBar";
    const before = chart.convertToPixel({ xAxisIndex: 1 }, horizontal ? 70 : "0");
    chart.dispatchAction({
      type: "dataZoom",
      dataZoomId: "openbb-navigator",
      start: 20,
      end: 80,
    });
    expect(chart.convertToPixel({ xAxisIndex: 1 }, horizontal ? 70 : "0")).toBe(before);
    reference.series.forEach((_, i) =>
      reference.rows.forEach((row, j) => {
        const ends = row.all.endpoints[i];
        if (!ends) return;
        const data = (chart as any)
          .getModel()
          .getSeriesByIndex(i + 3)
          .getData();
        const layout = data.getItemLayout(j);
        const axis = horizontal ? { xAxisIndex: 1 } : { yAxisIndex: 1 };
        const start = chart.convertToPixel(axis, ends[0]) as number;
        const end = chart.convertToPixel(axis, ends[1]) as number;
        expect(horizontal ? layout.x : layout.y).toBeCloseTo(start, 5);
        expect(horizontal ? layout.width : layout.height).toBeCloseTo(end - start, 5);
      }),
    );
  } finally {
    chart.dispose();
  }
});
it("uses actual signed endpoints for the domain and shows only zero at the empty midpoint", () => {
  const unequal = mapped("normalizedColumn", undefined, snapshot.rows.slice(0, 1));
  expect(unequal.yAxis).toMatchObject({ min: -20, max: 100 });
  const options = mapped("normalizedColumn", undefined, [
    { id: "zero", category: "zero", values: { First: 0, Second: 0, Third: null } },
  ]);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({ ...options, animation: false });
    const axis = (chart as any).getModel().getComponent("yAxis").axis;
    expect(
      axis
        .getViewLabels()
        .map((v: any) => v.formattedLabel)
        .filter(Boolean),
    ).toEqual(["0%"]);
    expect(axis.scale.normalize(0)).toBe(0.5);
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});
it.each([
  "normalizedColumn",
  "normalizedBar",
])("keeps %s finite at extreme observation magnitudes", (family) => {
  const cases = [
    { raw: [1e307, 1e307, null], expected: [50, 50, null], min: 0, max: 100 },
    { raw: [1e308, 1e308, null], expected: [50, 50, null], min: 0, max: 100 },
    { raw: [1e308, 1e308, -1e308], expected: [50, 50, -50], min: -50, max: 100 },
    { raw: [-1e308, -1e308, 1e308], expected: [-50, -50, 50], min: -100, max: 50 },
    {
      raw: [Number.MIN_VALUE, Number.MIN_VALUE, -Number.MIN_VALUE],
      expected: [50, 50, -50],
      min: -50,
      max: 100,
    },
  ];
  for (const { raw, expected, min, max } of cases) {
    const rows = [
      {
        id: "extreme",
        category: "extreme",
        values: Object.fromEntries(reference.series.map((id, i) => [id, raw[i]])),
      },
    ];
    const original = structuredClone(rows);
    const options = mapped(family, undefined, rows);
    expect(options.series.map((s: any) => s.data[0])).toEqual(expected);
    expect(family === "normalizedBar" ? options.xAxis : options.yAxis).toMatchObject({
      min,
      max,
    });
    expect(rows).toEqual(original);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 500,
    });
    try {
      chart.setOption({ ...options, animation: false });
      expected.forEach((value, index) => {
        if (value === null) return;
        const layout = (chart as any)
          .getModel()
          .getSeriesByIndex(index)
          .getData()
          .getItemLayout(0);
        for (const coordinate of [layout.x, layout.y, layout.width, layout.height])
          expect(Number.isFinite(coordinate)).toBe(true);
      });
      expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
    } finally {
      chart.dispose();
    }
  }
});
