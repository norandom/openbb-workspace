import { describe, expect, it } from "vitest";
import type { AppearanceInput } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import { resolveApplicationAppearance } from "../../../src/components/General/Table/Chart/application/effectiveAppearance";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K];
};
function input(
  family: AppearanceInput["family"] = "groupedColumn",
): Mutable<AppearanceInput> {
  return {
    baseline: { stateAddress: "widget", chartType: family, model: {}, options: {} },
    generated: {},
    family,
    precision: 0,
    seriesIds: ["revenue", "earnings"],
    theme: {
      name: "openbb-light",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#000000",
        chartBackgroundColor: "#ffffff",
      },
      palette: { fills: ["#123456", "#abcdef"], strokes: ["#112233", "#445566"] },
      overrides: {
        common: {
          title: { fontSize: 12 },
          legend: {
            position: "top",
            spacing: 20,
            item: {
              paddingX: 32,
              paddingY: 8,
              marker: { size: 11, padding: 5 },
              label: { color: "#000", fontSize: 11 },
            },
          },
        },
        line: { series: { marker: { enabled: false }, connectMissingData: true } },
      },
    },
    axisRuntime: {
      categoryAxisType: "category",
      axes: [
        {
          id: "category",
          direction: "x",
          type: "category",
          position: "bottom",
          options: {},
        },
        { id: "number", direction: "y", type: "number", position: "left", options: {} },
      ],
    },
  };
}
function resolve(value: AppearanceInput) {
  const result = resolveApplicationAppearance(value);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}

describe("source-backed application appearance", () => {
  it.each([
    "groupedColumn",
    "stackedColumn",
    "line",
  ] as const)("resolves full %s defaults without persisting defaults", (family) => {
    const candidate = input(family);
    const before = structuredClone(candidate);
    const result = resolve(candidate);
    const appearance = result.application;
    expect(appearance.title).toEqual({
      enabled: false,
      text: "Title",
      font: "Verdana, sans-serif",
      weight: "predefined",
      fontWeight: 400,
      fontStyle: undefined,
      size: 12,
      color: "#000000",
      spacing: 20,
    });
    expect(appearance.subtitle).toMatchObject({
      enabled: false,
      text: "Subtitle",
      color: "#616161",
      size: 13,
    });
    expect(appearance.legend).toMatchObject({
      enabled: true,
      position: "top",
      spacing: 20,
      size: 11,
      markerSize: 11,
      markerStroke: 0,
      itemSpacing: 5,
      horizontalSpacing: 32,
      verticalSpacing: 8,
    });
    expect(appearance.padding).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
    expect(appearance.axes.category).toMatchObject({
      lineEnabled: true,
      fields: { type: "category", position: "bottom", color: "#acacac", thickness: 1 },
      grid: { enabled: false, color: "#e6e6e6", thickness: 1, lineDash: 0 },
      ticks: { enabled: false, width: 1, length: 6 },
      labels: { autoRotate: true, rotation: undefined, padding: 11 },
    });
    expect(appearance.axes.number).toMatchObject({
      lineEnabled: false,
      grid: { enabled: true },
      title: { enabled: false, text: "Axis Title", spacing: 25, size: 13 },
    });
    expect(appearance.series).toMatchObject({
      strokeWidth: family === "line" ? 2 : 0,
      strokeOpacity: 1,
      fillOpacity: 1,
      lineDash: [0],
      shadow: { enabled: false, color: "#00000080", blur: 5, xOffset: 3, yOffset: 3 },
      labels: {
        enabled: false,
        size: 12,
        color: family === "line" ? "#000000" : "#ffffff",
      },
      markers: { enabled: false, shape: "circle", size: 7, strokeWidth: 0 },
      connectMissingData: family === "line",
    });
    expect(appearance.tooltip).toEqual({ enabled: true, mode: "shared" });
    expect(result.series.revenue).toMatchObject({
      fill: "#123456",
      stroke: family === "line" ? "#123456" : "#112233",
      markerFill: "#123456",
      markerStroke: "#112233",
    });
    expect(result.series.earnings.fill).toBe("#abcdef");
    expect(result.precision).toBe(0);
    expect(candidate).toEqual(before);
  });

  it("preserves every admitted saved value, disabled values and paired typography", () => {
    const candidate = input("line");
    candidate.baseline.options.line = {
      title: {
        enabled: false,
        text: "Retained",
        fontFamily: "Courier New",
        fontSize: 0,
        fontWeight: 600,
        fontStyle: "oblique",
        color: "red",
        spacing: 0,
      },
      subtitle: {
        enabled: true,
        text: "Detail",
        fontWeight: "bold",
        fontStyle: "italic",
      },
      legend: {
        enabled: false,
        position: "left",
        spacing: 0,
        item: {
          label: {
            fontFamily: "Times",
            fontSize: 0,
            fontWeight: "bold",
            color: "blue",
          },
          marker: { size: 0, strokeWidth: 0, padding: 0 },
          paddingX: 0,
          paddingY: 0,
        },
      },
      padding: { top: 0, right: 1, bottom: 2, left: 3 },
      background: { visible: false, fill: "transparent" },
      tooltip: { enabled: false, mode: "single" },
      series: {
        strokeWidth: 0,
        strokeOpacity: 0,
        fillOpacity: 0,
        lineDash: [3, 2],
        connectMissingData: false,
        shadow: { enabled: false, color: "red", blur: 0, xOffset: -2, yOffset: 0 },
        label: {
          enabled: false,
          fontFamily: "Times",
          fontWeight: "bold",
          fontStyle: "italic",
          fontSize: 0,
          color: "pink",
        },
        marker: { enabled: false, shape: "diamond", size: 0, strokeWidth: 0 },
      },
    };
    const result = resolve(candidate);
    expect(result.application.title).toMatchObject({
      enabled: false,
      text: "Retained",
      font: "Courier New",
      size: 0,
      weight: "predefined",
      fontWeight: 600,
      fontStyle: "oblique",
      spacing: 0,
    });
    expect(result.application.subtitle.weight).toBe("boldItalic");
    expect(result.application.legend).toMatchObject({
      enabled: false,
      font: "Times",
      weight: "bold",
      size: 0,
      markerSize: 0,
      markerStroke: 0,
      itemSpacing: 0,
      horizontalSpacing: 0,
      verticalSpacing: 0,
    });
    expect(result.application.series).toMatchObject({
      strokeWidth: 0,
      strokeOpacity: 0,
      fillOpacity: 0,
      lineDash: [3, 2],
      connectMissingData: false,
      markers: { enabled: false, shape: "diamond", size: 0 },
      shadow: { xOffset: -2, yOffset: 0 },
      labels: { enabled: false, weight: "boldItalic", size: 0 },
    });
    expect(result.application.background).toEqual({
      visible: false,
      fill: "transparent",
    });
    expect(result.application.tooltip).toEqual({ enabled: false, mode: "single" });
  });

  it("replaces saved common with generated common, then applies selected family over theme", () => {
    const candidate = input();
    candidate.baseline.options = {
      common: { title: { text: "discard" } },
      line: { title: { text: "inactive" } },
      bar: { title: { text: "saved" } },
    };
    candidate.generated = {
      common: { title: { text: "generated", enabled: true } },
      bar: { title: { color: "green" } },
    };
    expect(resolve(candidate).application.title).toMatchObject({
      text: "saved",
      enabled: true,
      color: "green",
      size: 12,
    });
  });

  it("uses original per-leaf bottom/top read order independent of current position", () => {
    const candidate = input();
    candidate.axisRuntime.axes[0] = {
      id: "category",
      direction: "x",
      type: "time",
      position: "top",
      options: { label: { format: "%Y", rotation: 22 } },
    };
    candidate.baseline.options.bar = {
      axes: {
        time: {
          label: { color: "green" },
          bottom: {
            line: { width: 0, enabled: false },
            label: { fontFamily: "Times", rotation: 0 },
            gridLine: {
              style: [
                { stroke: "red", lineDash: [2, 1] },
                { stroke: "blue", lineDash: [4] },
              ],
            },
          },
          top: {
            line: { width: 9 },
            label: { color: "pink", rotation: 33 },
            title: { text: "Upper" },
          },
        },
      },
    };
    const axis = resolve(candidate).application.axes.category;
    expect(axis.fields).toMatchObject({
      type: "time",
      position: "top",
      timeFormat: "%Y",
      thickness: 0,
    });
    expect(axis.lineEnabled).toBe(false);
    expect(axis.title.text).toBe("Upper");
    expect(axis.labels).toMatchObject({ font: "Times", color: "pink", rotation: 22 });
    expect(axis.gridStyles).toEqual([
      { stroke: "red", lineDash: [2, 1] },
      { stroke: "blue", lineDash: [4] },
    ]);
  });

  it("consumes materialized custom params and keeps selected palette separate", () => {
    const candidate = input();
    candidate.theme.name = "custom-dark";
    candidate.theme.mode = "dark";
    candidate.theme.colors = {
      base: "ag-default-dark",
      foregroundColor: "white",
      backgroundColor: "#000",
      textColor: "rgb(255, 0, 0)",
      chartBackgroundColor: "#000000",
    };
    candidate.theme.overrides = {
      common: {
        padding: { top: 7 },
        title: { fontFamily: "Monaco", fontSize: 19, fontWeight: 500 },
        axes: {
          category: {
            line: { stroke: "orange" },
            gridLine: { style: [{ stroke: "purple" }] },
          },
        },
      },
    };
    const appearance = resolve(candidate).application;
    expect(appearance.title).toMatchObject({
      font: "Monaco",
      size: 19,
      fontWeight: 500,
    });
    expect(appearance.subtitle.color).toBe("#6e0000");
    expect(appearance.axes.category.fields.color).toBe("orange");
    expect(appearance.axes.category.grid.color).toBe("purple");
    expect(appearance.padding.top).toBe(7);
    expect(appearance.palette).toEqual(candidate.theme.palette);
  });

  it.each([
    0, 1, 2, 3, 4,
  ])("resolves dynamic legend/tooltip defaults for %i series", (count) => {
    const candidate = input();
    candidate.seriesIds = Array.from({ length: count }, (_, index) => `id-${index}`);
    expect(resolve(candidate).application.legend.enabled).toBe(count > 1);
    expect(resolve(candidate).application.tooltip.mode).toBe(
      count > 1 && count < 4 ? "shared" : "single",
    );
  });

  it("rejects concrete missing inputs rather than supplying application fallbacks", () => {
    const candidate = input();
    expect(resolveApplicationAppearance({ ...candidate, precision: -1 }).valid).toBe(
      false,
    );
    expect(
      resolveApplicationAppearance({
        ...candidate,
        seriesIds: ["duplicate", "duplicate"],
      }).valid,
    ).toBe(false);
    expect(
      resolveApplicationAppearance({
        ...candidate,
        axisRuntime: { axes: [], categoryAxisType: undefined },
      }).valid,
    ).toBe(false);
    candidate.theme.palette = { fills: [], strokes: [] };
    expect(resolveApplicationAppearance(candidate).valid).toBe(false);
  });

  it("resolves source conditional stroke defaults and partial retained grid styles", () => {
    const candidate = input();
    candidate.baseline.options.bar = {
      series: { stroke: "red" },
      axes: { category: { bottom: { gridLine: { style: [{ lineDash: [8] }] } } } },
    };
    expect(resolve(candidate).application.series.strokeWidth).toBe(2);
    expect(resolve(candidate).application.axes.category.gridStyles).toEqual([
      { stroke: "#e6e6e6", lineDash: [8] },
    ]);
    const line = input("line");
    line.baseline.options.line = { series: { marker: { stroke: "pink" } } };
    expect(resolve(line).application.series.markers.strokeWidth).toBe(1);
  });

  it("keeps explicit theme values above recomputed conditional defaults", () => {
    const candidate = input();
    candidate.baseline.options.bar = {
      series: { stroke: "red" },
      subtitle: { enabled: true },
    };
    expect(resolve(candidate).application.title.spacing).toBe(10);
    expect(resolve(candidate).application.series.strokeWidth).toBe(2);
    candidate.theme.overrides.bar = {
      title: { spacing: 20 },
      series: { strokeWidth: 0 },
    };
    expect(resolve(candidate).application.title.spacing).toBe(20);
    expect(resolve(candidate).application.series.strokeWidth).toBe(0);
  });

  it("separates the unset legend control from the inherited drawn outline", () => {
    const bar = input();
    bar.baseline.options.bar = { series: { stroke: "red", strokeWidth: 5 } };
    expect(resolve(bar).application.legend.markerStroke).toBe(0);
    expect(resolve(bar).application.legendMarkerStrokeWidth).toBe(2);
    bar.theme.overrides.bar = { legend: { item: { marker: { strokeWidth: 0 } } } };
    expect(resolve(bar).application.legendMarkerStrokeWidth).toBe(0);
    const line = input("line");
    line.baseline.options.line = { series: { marker: { stroke: "red" } } };
    expect(resolve(line).application.legend.markerStroke).toBe(0);
    expect(resolve(line).application.legendMarkerStrokeWidth).toBe(1);
  });

  it("keeps complete independent axes and retained disabled manual rotation", () => {
    const candidate = input();
    candidate.baseline.options.bar = {
      axes: {
        category: {
          bottom: {
            title: {
              enabled: false,
              text: "Dates",
              fontFamily: "Monaco",
              fontWeight: "bold",
              fontStyle: "italic",
              fontSize: 18,
              color: "red",
              spacing: 2,
            },
            line: { stroke: "blue", width: 3, enabled: true },
            label: {
              fontFamily: "Times",
              fontWeight: "bold",
              fontStyle: "italic",
              fontSize: 17,
              color: "green",
              spacing: 0,
              autoRotate: false,
              rotation: -12,
            },
            tick: { enabled: false, stroke: "purple", width: 0, size: 0 },
            gridLine: {
              enabled: false,
              width: 0,
              style: [{ stroke: "pink", lineDash: [0] }],
            },
          },
        },
        number: { left: { title: { text: "Value" }, label: { rotation: 14 } } },
      },
    };
    const axes = resolve(candidate).application.axes;
    expect(axes.category.title).toMatchObject({
      enabled: false,
      text: "Dates",
      font: "Monaco",
      weight: "boldItalic",
      size: 18,
      spacing: 2,
    });
    expect(axes.category.labels).toMatchObject({
      font: "Times",
      weight: "boldItalic",
      size: 17,
      padding: 0,
      autoRotate: false,
      rotation: -12,
    });
    expect(axes.category.ticks).toEqual({
      enabled: false,
      color: "purple",
      width: 0,
      length: 0,
    });
    expect(axes.category.grid).toEqual({
      enabled: false,
      color: "pink",
      thickness: 0,
      lineDash: 0,
    });
    expect(axes.number.title.text).toBe("Value");
    expect(axes.number.labels.rotation).toBe(14);
    candidate.axisRuntime.axes[0].options = {
      label: { rotation: undefined, autoRotate: true },
    };
    expect(resolve(candidate).application.axes.category.labels).toMatchObject({
      rotation: undefined,
      autoRotate: true,
    });
  });

  it("applies theme common fields over family stock defaults before saved overrides", () => {
    const candidate = input("line");
    candidate.theme.overrides.common = {
      series: { strokeWidth: 9, marker: { enabled: true } },
    };
    candidate.theme.overrides.line = {};
    expect(resolve(candidate).application.series).toMatchObject({
      strokeWidth: 9,
      markers: { enabled: true },
    });
  });

  it("derives alpha colors without replacing them with stock colors", () => {
    const candidate = input();
    candidate.theme.colors.textColor = "rgba(255, 0, 0, 0.5)";
    candidate.theme.colors.chartBackgroundColor = "rgba(0, 0, 0, 0.5)";
    expect(resolve(candidate).application.subtitle.color).toBe("rgba(158, 0, 0, 0.5)");
    candidate.theme.colors.textColor = "invalid-color";
    expect(resolveApplicationAppearance(candidate).valid).toBe(false);
  });
});
