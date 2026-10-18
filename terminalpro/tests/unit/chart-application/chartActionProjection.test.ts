import { beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "echarts";
import { projectApplicationSession } from "../../../src/components/General/Table/Chart/application/applicationSessionProjection";
import {
  initialApplicationSession,
  synchronizeApplicationSession,
} from "../../../src/components/General/Table/Chart/application/applicationSessionRuntime";
import { sessionFixture } from "./applicationSessionFixture";
import { retainNavigatorExtent } from "../../../src/components/General/Table/Chart/echarts/cartesianNavigator";

beforeEach(() =>
  vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({ measureText: (v: string) => ({ width: v.length * 6 }) } as any),
);
function project(storage: any = {}, family = "groupedColumn") {
  const context = sessionFixture(storage);
  context.inputs.family = family as any;
  const state = {
    ...initialApplicationSession(storage, context.inputs, 1),
    capture: context.capture,
    viewport: { width: 800, height: 500 },
  };
  const result = projectApplicationSession(storage, context.inputs, state);
  if (result.status !== "ready") throw new Error(JSON.stringify(result));
  return { options: result.value.options as any, context, state };
}
describe("original quick-action drawing effects", () => {
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ])("changes the real native %s plot extent while keeping the whole miniature and raw values", (family) => {
    const { options } = project({ chartMiniChartEnabled: true }, family);
    const chart = init(null, undefined, {
      renderer: "svg",
      ssr: true,
      width: 800,
      height: 500,
    });
    try {
      chart.setOption({ ...options, animation: false });
      const svg = chart.renderToSVGString();
      const full = chart.convertToPixel({ xAxisIndex: 1 }, "1");
      const plotted = chart.convertToPixel({ xAxisIndex: 0 }, "1");
      chart.dispatchAction({
        type: "dataZoom",
        dataZoomId: "openbb-navigator",
        start: 50,
        end: 100,
      });
      expect(chart.convertToPixel({ xAxisIndex: 0 }, "1")).not.toBe(plotted);
      expect(chart.convertToPixel({ xAxisIndex: 1 }, "1")).toBe(full);
      expect(chart.renderToSVGString()).not.toBe(svg);
      const current = chart.getOption() as any;
      expect(current.series[0].data).toEqual(options.series[0].data);
      expect(current.series[2].data).toEqual(options.series[0].data);
      expect(current.dataZoom[0]).toMatchObject({ start: 50, end: 100 });
    } finally {
      chart.dispose();
    }
  });
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ])("renders a %s native navigator with all miniature series and unchanged raw observations", (family) => {
    const ordinary = project({}, family).options;
    const { options } = project({ chartMiniChartEnabled: true }, family);
    expect(options.dataZoom).toMatchObject([
      {
        id: "openbb-navigator",
        type: "slider",
        height: 40,
        minSpan: 0.1,
        showDataShadow: false,
      },
    ]);
    expect(options.grid).toHaveLength(2);
    expect(options.grid[0].bottom - ordinary.grid.bottom).toBe(67);
    expect(options.xAxis[1].axisLabel).toMatchObject({
      show: true,
      fontSize: 10,
      margin: 5,
    });
    expect(options.series).toHaveLength(4);
    expect(options.series.slice(2).map((s: any) => s.data)).toEqual(
      ordinary.series.map((s: any) => s.data),
    );
    expect(options.series.slice(2).map((s: any) => s.id)).toEqual([
      "openbb-mini-revenue",
      "openbb-mini-income",
    ]);
    expect(
      options.series
        .slice(2)
        .every((s: any) => s.xAxisIndex === 1 && s.yAxisIndex === 1 && s.silent),
    ).toBe(true);
    expect(options.series.slice(2).map((s: any) => s.type)).toEqual([
      family === "line" ? "line" : "bar",
      family === "line" ? "line" : "bar",
    ]);
    expect(options.series.slice(2).map((s: any) => s.stack)).toEqual(
      family === "stackedColumn"
        ? ["openbb-mini-total", "openbb-mini-total"]
        : [undefined, undefined],
    );
    expect(options.xAxis[1].data).toEqual(ordinary.xAxis.data);
  });
  it("uses the original 18-pixel plain slider and leaves disabled chart geometry unchanged", () => {
    const ordinary = project().options;
    const { options } = project({ chartNavigatorEnabled: true });
    expect(options.dataZoom[0]).toMatchObject({
      height: 18,
      showDataShadow: false,
      start: 0,
      end: 100,
    });
    expect(options.grid.bottom - ordinary.grid.bottom).toBe(28);
    expect(options.series).toHaveLength(2);
    expect(ordinary).not.toHaveProperty("dataZoom");
  });
  it("advances render identity when root action flags change without recapturing data or saving defaults", () => {
    const { context, state } = project();
    const updated = synchronizeApplicationSession(
      { chartMiniChartEnabled: true },
      context.inputs,
      state,
    );
    expect(updated.local.stamp.renderRevision).toBeGreaterThan(
      state.local.stamp.renderRevision,
    );
    expect(updated.capture).toBe(state.capture);
    expect(updated.local.baseline).toEqual(state.local.baseline);
  });
  it("shades only the excluded native extent and retains original line miniature defaults", () => {
    const { options } = project({ chartMiniChartEnabled: true }, "line");
    const ranged = retainNavigatorExtent(options, {
      dataZoom: [{ id: "openbb-navigator", start: 25, end: 75 }],
    }) as any;
    const children = ranged.graphic[0].children;
    expect(options.dataZoom[0].fillerColor).toBe("transparent");
    expect(children[1].shape.width).toBe(children[0].shape.width / 4);
    expect(children[2].shape.width).toBe(children[0].shape.width / 4);
    expect(children[2].shape.x).toBe(children[0].shape.width * 0.75);
    expect(options.series[2]).toMatchObject({
      showSymbol: false,
      label: { show: false },
      lineStyle: { width: 2, type: "solid" },
    });
    expect(options.series[2].name).not.toBe(options.series[0].name);
  });
  it("colors one bar series by repeated original category and retains custom palette selection", () => {
    const storage = {
      chartBarFillEnabled: true,
      partition: {
        chartModel: { chartType: "groupedColumn" },
        groupedColumn: { cellRange: { columns: ["period", "revenue"] } },
      },
    };
    const { options } = project(storage);
    expect(options.series).toHaveLength(1);
    expect(options.series[0].data.map((d: any) => d.itemStyle.color)).toEqual([
      "#fac858",
      "#fac858",
    ]);
    expect(options.series[0].data.map((d: any) => d.value)).toEqual([100, 120]);
    const context = sessionFixture(storage);
    context.inputs.theme = { ...context.inputs.theme, name: "custom-light" };
    const state = {
      ...initialApplicationSession(storage, context.inputs, 1),
      capture: context.capture,
      viewport: { width: 800, height: 500 },
    };
    const custom = projectApplicationSession(storage, context.inputs, state);
    expect(custom.status).toBe("ready");
    if (custom.status === "ready")
      expect((custom.value.options.series as any)[0].data[0].itemStyle.color).toBe(
        "#123456",
      );
    expect(project({ chartBarFillEnabled: true }).options.series[0].data).toEqual([
      100, 120,
    ]);
  });
});
