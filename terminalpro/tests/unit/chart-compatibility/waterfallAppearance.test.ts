import { describe, expect, it } from "vitest";
import { resolveWaterfallAppearance } from "../../../src/components/General/Table/Chart/application/waterfallAppearance";
import type { WaterfallAppearanceInput } from "../../../src/components/General/Table/Chart/application/waterfallTypes";

function waterfallInput(): WaterfallAppearanceInput {
  return {
    baseline: { stateAddress: "a", chartType: "waterfall", model: {}, options: {} },
    generated: {},
    seriesIds: ["delta"],
    precision: 2,
    theme: {
      name: "selected",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#fafafa",
      },
      overrides: {},
      palette: { fills: ["#111111", "#222222", "#00ff00"], strokes: ["#333333"] },
    },
    paint: {
      positive: { fill: "#123456", stroke: "#234567" },
      negative: { fill: "#abcdef", stroke: "#bcdef0" },
      total: { fill: "#888888", stroke: "#777777" },
      connectorStroke: "#999999",
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
function resolvedWaterfall(input = waterfallInput()) {
  const result = resolveWaterfallAppearance(input);
  if (result.status !== "resolved") throw Error(JSON.stringify(result));
  return result.value;
}
describe("Waterfall appearance", () => {
  it("uses explicit named paint and source defaults, without bar inheritance", () => {
    const source = waterfallInput();
    const value = resolvedWaterfall({
      ...source,
      generated: {
        bar: {
          series: { item: { positive: { fill: "#ff0000" } }, direction: "horizontal" },
        },
      },
    });
    expect(value.series.direction).toBe("vertical");
    expect(value.series.item.positive).toMatchObject({
      name: "Positive",
      fill: "#123456",
      stroke: "#234567",
      strokeWidth: 0,
      fillOpacity: 1,
      label: { enabled: false, placement: "inside-center", spacing: 0 },
    });
    expect(value.series.item.total.fill).toBe("#888888");
    expect(value.series.line).toMatchObject({
      enabled: true,
      stroke: "#999999",
      strokeWidth: 2,
    });
    expect(value.application.legend.enabled).toBe(true);
  });
  it("collapses common and family scopes before the family wins; saved leaves beat generated", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      theme: {
        ...input.theme,
        overrides: {
          common: { series: { item: { positive: { fillOpacity: 0.1 } } } },
          waterfall: {
            series: { item: { positive: { fillOpacity: 0.4, strokeOpacity: 0.3 } } },
          },
        },
      },
      generated: {
        common: {
          series: { item: { positive: { fillOpacity: 0.2, strokeOpacity: 0.2 } } },
        },
        waterfall: { series: { item: { positive: { fillOpacity: 0.5 } } } },
      },
      baseline: {
        ...input.baseline,
        options: {
          waterfall: { series: { item: { positive: { fillOpacity: 0.6 } } } },
        },
      },
    });
    expect(value.series.item.positive.fillOpacity).toBe(0.6);
    expect(value.series.item.positive.strokeOpacity).toBe(0.3);
  });
  it("resolves saved total/labels/tooltip/connector independently and leaves input untouched", () => {
    const input = waterfallInput();
    const source = {
      ...input,
      baseline: {
        ...input.baseline,
        options: {
          waterfall: {
            series: {
              tooltip: { enabled: false },
              line: { enabled: false, strokeWidth: 6, lineDash: [2, 3] },
              totals: [{ index: 0 }],
              item: {
                positive: {
                  stroke: "#112233",
                  label: {
                    enabled: true,
                    fontWeight: "bold",
                    fontStyle: "italic",
                    placement: "outside-end",
                    spacing: 9,
                  },
                },
                total: { name: "Saved total", strokeWidth: 8 },
              },
            },
          },
        },
      },
    };
    const before = structuredClone(source);
    const value = resolvedWaterfall(source);
    expect(value.series.tooltipEnabled).toBe(false);
    expect(value.application.tooltip.enabled).toBe(true);
    expect(value.series.line.lineDash).toEqual([2, 3]);
    expect(value.series.item.positive).toMatchObject({
      strokeWidth: 2,
      label: {
        fontWeight: "bold",
        fontStyle: "italic",
        weight: "boldItalic",
        placement: "outside-end",
        spacing: 9,
      },
    });
    expect(value.series.item.total).toMatchObject({
      name: "Saved total",
      strokeWidth: 8,
    });
    expect(source).toEqual(before);
  });
  it("retains concrete axis options while direction rotates their physical roles", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      baseline: {
        ...input.baseline,
        options: { waterfall: { series: { direction: "horizontal" } } },
      },
      axisRuntime: {
        ...input.axisRuntime,
        axes: input.axisRuntime.axes.map((axis) => ({
          ...axis,
          options: { label: { rotation: 17 }, line: { width: 4 } },
        })),
      },
    });
    expect(
      value.axisRuntime.axes.map((axis) => [axis.id, axis.direction, axis.position]),
    ).toEqual([
      ["category", "y", "left"],
      ["number", "x", "bottom"],
    ]);
    expect(value.application.axes.category.labels.rotation).toBe(17);
    expect(value.application.axes.number.fields.thickness).toBe(4);
  });
  it.each([
    { fillOpacity: 2 },
    { strokeWidth: -1 },
    { lineDash: [Number.NaN] },
    { label: { spacing: -1 } },
  ])("rejects malformed item settings %j", (item) => {
    const input = waterfallInput();
    expect(
      resolveWaterfallAppearance({
        ...input,
        generated: { waterfall: { series: { item: { negative: item } } } },
      }).status,
    ).toBe("invalid");
  });
  it("rejects unsupported paint rather than inventing a palette fallback", () => {
    const input = waterfallInput();
    expect(
      resolveWaterfallAppearance({
        ...input,
        generated: {
          waterfall: { series: { item: { positive: { fill: { type: "gradient" } } } } },
        },
      }).status,
    ).toBe("unsupported");
    expect(
      resolveWaterfallAppearance({
        ...input,
        paint: { ...input.paint, connectorStroke: "invalid-color" },
      }).status,
    ).toBe("invalid");
  });
  it("keeps selected dark paint and supplied axis positions rather than default palette slots", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      theme: {
        ...input.theme,
        mode: "dark",
        colors: {
          ...input.theme.colors,
          base: "ag-default-dark",
          textColor: "#eeeeee",
        },
      },
      generated: {
        waterfall: {
          axes: { category: { position: "top" }, number: { position: "right" } },
          series: { item: { negative: { name: "Outflow" } } },
        },
      },
    });
    expect(value.axisRuntime.axes.map((axis) => axis.position)).toEqual([
      "top",
      "right",
    ]);
    expect(value.series.item.negative.name).toBe("Outflow");
    expect(value.series.item.negative.strokeWidth).toBe(0);
    expect(value.series.item.negative.label.color).toBe("#eeeeee");
    expect(value.series.item.total.stroke).toBe("#777777");
  });
  it("uses explicit item stroke defaults per sign and honors a saved zero width", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      generated: {
        waterfall: {
          series: {
            item: {
              positive: { stroke: "#aabbcc", strokeWidth: 0 },
              negative: { stroke: "#112233" },
            },
          },
        },
      },
    });
    expect(value.series.item.positive.strokeWidth).toBe(0);
    expect(value.series.item.negative.strokeWidth).toBe(2);
    expect(value.series.item.total.strokeWidth).toBe(0);
    expect(value.series.line.strokeWidth).toBe(2);
  });
  it("replaces theme dash arrays while retaining original generated/saved array composition", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      theme: {
        ...input.theme,
        overrides: {
          waterfall: { series: { item: { positive: { lineDash: [6, 7, 8] } } } },
        },
      },
      generated: { waterfall: { series: { item: { positive: { lineDash: [2] } } } } },
    });
    expect(value.series.item.positive.lineDash).toEqual([2]);
  });
  it("keeps chart tooltip settings independent of series enable and explicit legend visibility", () => {
    const input = waterfallInput();
    const value = resolvedWaterfall({
      ...input,
      legendEnabled: false,
      generated: {
        common: { tooltip: { enabled: false } },
        waterfall: { series: { tooltip: { enabled: true } } },
      },
    });
    expect(value.application.tooltip.enabled).toBe(false);
    expect(value.series.tooltipEnabled).toBe(true);
    expect(value.application.legend.enabled).toBe(false);
  });
  it.each([
    -1,
    1.5,
    21,
    Number.POSITIVE_INFINITY,
  ])("rejects precision %s", (precision) => {
    expect(resolveWaterfallAppearance({ ...waterfallInput(), precision }).status).toBe(
      "invalid",
    );
  });
  it("rejects invalid concrete axes and duplicate field identities", () => {
    const input = waterfallInput();
    expect(
      resolveWaterfallAppearance({
        ...input,
        axisRuntime: { axes: [], categoryAxisType: "category" },
      }).status,
    ).toBe("invalid");
    expect(
      resolveWaterfallAppearance({ ...input, seriesIds: ["delta", "delta"] }).status,
    ).toBe("invalid");
  });
});
