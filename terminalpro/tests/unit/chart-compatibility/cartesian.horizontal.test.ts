import { init } from "echarts";
import { beforeEach, expect, it, vi } from "vitest";
import { translateCartesian } from "../../../src/components/General/Table/Chart/echarts/cartesian";
import { cartesianNavigator } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";
import { sessionFixture } from "../chart-application/applicationSessionFixture";
import { applicationStyle, mappingContext } from "./cartesian.application.fixtures";
import reference from "./fixtures/horizontal-bars.json";
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
    values: Object.fromEntries(reference.series.map((id, i) => [id, row.values[i]])),
  })),
};
function mapped(family: string): any {
  const style = applicationStyle();
  style.application.axes.category.fields.position = "left";
  style.application.axes.number.fields.position = "bottom";
  const result = translateCartesian(snapshot, family, style, mappingContext());
  if (result.status !== "supported") throw new Error(JSON.stringify(result));
  return result.options;
}
it.each([
  "groupedBar",
  "stackedBar",
])("preserves %s raw labels, signed geometry and category order", (family) => {
  const options = mapped(family);
  expect(options.xAxis.type).toBe("value");
  expect(options.yAxis).toMatchObject({
    type: "category",
    inverse: true,
    data: ["0", "1", "2", "3"],
  });
  expect(options.series.map((s: any) => s.data)).toEqual(
    reference.series.map((_, i) => reference.rows.map((r) => r.values[i])),
  );
  expect(options.series[0].label.formatter({ dataIndex: 2 })).toContain("0");
  expect(options.series[0].label.formatter({ dataIndex: 3 })).toBe("");
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({ ...options, animation: false });
    expect(chart.convertToPixel({ yAxisIndex: 0 }, "0")).toBeLessThan(
      chart.convertToPixel({ yAxisIndex: 0 }, "3") as number,
    );
    const expected =
      family === "stackedBar" ? reference.stackedEndpoints : reference.groupedEndpoints;
    const model = (chart as any).getModel();
    reference.series.forEach((_, seriesIndex) => {
      const data = model.getSeriesByIndex(seriesIndex).getData();
      reference.rows.forEach((_, rowIndex) => {
        const endpoints = expected[rowIndex][seriesIndex];
        if (!endpoints) return;
        const layout = data.getItemLayout(rowIndex);
        const start = chart.convertToPixel({ xAxisIndex: 0 }, endpoints[0]) as number;
        const end = chart.convertToPixel({ xAxisIndex: 0 }, endpoints[1]) as number;
        expect(layout.x).toBeCloseTo(start, 5);
        expect(layout.width).toBeCloseTo(end - start, 5);
      });
    });
  } finally {
    chart.dispose();
  }
});
it.each([
  "groupedBar",
  "stackedBar",
])("zooms %s numeric X while retaining rows and the full horizontal overview", (family) => {
  const options: any = cartesianNavigator(
    mapped(family),
    false,
    true,
    sessionFixture({}).inputs.theme,
    { width: 800 },
  );
  expect(options.dataZoom[0]).toMatchObject({ xAxisIndex: [0], filterMode: "none" });
  expect(options.series).toHaveLength(6);
  const chart = init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 800,
    height: 500,
  });
  try {
    chart.setOption({ ...options, animation: false });
    const full = chart.convertToPixel({ xAxisIndex: 1 }, 7);
    const before = chart.convertToPixel({ xAxisIndex: 0 }, 7);
    chart.dispatchAction({
      type: "dataZoom",
      dataZoomId: "openbb-navigator",
      start: 30,
      end: 70,
    });
    expect(chart.convertToPixel({ xAxisIndex: 0 }, 7)).not.toBe(before);
    expect(chart.convertToPixel({ xAxisIndex: 1 }, 7)).toBe(full);
    const model = (chart as any).getModel();
    for (let i = 0; i < 6; i++)
      expect(model.getSeriesByIndex(i).getData().count()).toBe(4);
    expect((chart.getOption() as any).yAxis[1].inverse).toBe(true);
    const expected =
      family === "stackedBar" ? reference.stackedEndpoints : reference.groupedEndpoints;
    reference.series.forEach((_, seriesIndex) => {
      const data = model.getSeriesByIndex(seriesIndex + 3).getData();
      reference.rows.forEach((_, rowIndex) => {
        const endpoints = expected[rowIndex][seriesIndex];
        if (!endpoints) return;
        const layout = data.getItemLayout(rowIndex);
        const start = chart.convertToPixel({ xAxisIndex: 1 }, endpoints[0]) as number;
        const end = chart.convertToPixel({ xAxisIndex: 1 }, endpoints[1]) as number;
        expect(layout.x).toBeCloseTo(start, 5);
        expect(layout.width).toBeCloseTo(end - start, 5);
      });
    });
    expect(chart.renderToSVGString()).not.toMatch(/NaN|Infinity/);
  } finally {
    chart.dispose();
  }
});
it("uses the raw row and stable descriptor identities in horizontal tooltips", () => {
  const options = mapped("stackedBar");
  const tooltip = options.tooltip.formatter([{ dataIndex: 0, seriesId: "Second" }]);
  expect(tooltip).toContain("period:Alpha");
  expect(tooltip).toContain("Second:");
  expect(options.series.map((s: any) => s.id)).toEqual(reference.series);
  expect(options.series[0].label.formatter({ dataIndex: 0 })).toBe(
    mappingContext().display.seriesLabel(7),
  );
  expect(options.yAxis.axisLabel.formatter("0")).toBe("period:Alpha");
  expect(options.xAxis.axisLabel.formatter(-4)).toBe(
    mappingContext().display.numericAxis(-4),
  );
});
