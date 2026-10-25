import merge from "lodash.merge";
import { describe, expect, it } from "vitest";
import { resolveHeatmapAppearance } from "../../../src/components/General/Table/Chart/application/heatmapAppearance";
import {
  mapHeatmapEditorIntent,
  projectHeatmapEditorState,
} from "../../../src/components/General/Table/Chart/application/heatmapEditor";
import type { HeatmapAppearanceInput } from "../../../src/components/General/Table/Chart/application/heatmapTypes";
import { heatmapThemePaint } from "../../../src/components/General/Table/Chart/caller/heatmapThemePaint";

const input = () =>
  ({
    baseline: { stateAddress: "a", chartType: "heatmap", model: {}, options: {} },
    generated: {},
    precision: 2,
    theme: {
      name: "selected",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#123456"], strokes: ["#654321"] },
    },
    themePaint: heatmapThemePaint({}, false),
  }) satisfies HeatmapAppearanceInput;
function resolve(source = input()) {
  const result = resolveHeatmapAppearance(source);
  if (result.valid === false) throw Error(result.error);
  return result.value;
}
describe("Heatmap controls and appearance", () => {
  it.each([
    { series: { colorRange: ["invalid", "#ffffff"] } },
    { series: { colorRange: [] } },
    { series: { stroke: "invalid" } },
    { series: { strokeOpacity: 2 } },
    { series: { itemPadding: -1 } },
    { gradientLegend: { position: "center" } },
  ])("rejects malformed effective appearance %j", (heatmap) => {
    const source = input();
    source.baseline.options = { heatmap };
    expect(resolveHeatmapAppearance(source).valid).toBe(false);
  });
  it("rejects empty palette arrays and preserves a single repeated custom fill", () => {
    expect(() => heatmapThemePaint({ fills: [] }, false)).toThrow();
    expect(() => heatmapThemePaint({ strokes: [] }, true)).toThrow();
    expect(() => heatmapThemePaint({ divergingColors: [] }, false)).toThrow();
    expect(heatmapThemePaint({ up: { fill: "#abcdef" } }, false).colorRange).toEqual([
      "#5090dc",
      "#ffa03a",
    ]);
    const value = resolve();
    expect(value.series.label.minimumFontSize).toBe(value.series.label.size);
    expect(value.series.label.wrapping).toBe("on-space");
  });
  it("honors theme and saved family precedence without filling storage with defaults", () => {
    const source = input();
    source.theme.overrides = {
      common: { series: { strokeOpacity: 0.2 } },
      heatmap: {
        series: { strokeOpacity: 0.4, colorRange: ["#111111", "#222222", "#333333"] },
      },
    };
    source.generated = {
      common: { series: { strokeOpacity: 0.3 } },
      heatmap: { series: { strokeOpacity: 0.5, colorRange: ["#444444", "#555555"] } },
    };
    source.baseline.options = {
      unknown: { retained: 19 },
      bar: { series: { strokeWidth: 9 } },
      heatmap: { series: { strokeOpacity: 0.7 } },
    };
    const before = structuredClone(source);
    const style = resolve(source);
    expect(style.series.strokeOpacity).toBe(0.7);
    expect(style.colorRange).toEqual(["#444444", "#555555"]);
    const result = mapHeatmapEditorIntent(
      { style, baseline: source.baseline },
      { panel: "gradientLegend", edit: { field: "reverseOrder", value: true } },
    );
    expect(result.valid).toBe(true);
    if (result.valid)
      expect(merge({}, source.baseline.options, result.value.eventOptions)).toEqual({
        ...before.baseline.options,
        heatmap: {
          series: { strokeOpacity: 0.7 },
          gradientLegend: { reverseOrder: true },
        },
      });
    expect(source).toEqual(before);
  });
  it("uses the resolved theme background independently from saved background and explicit outlines", () => {
    const source = input();
    source.themePaint = heatmapThemePaint({}, true, "#151518");
    source.baseline.options = { heatmap: { background: { fill: "#abcdef" } } };
    expect(resolve(source).series.stroke).toBe("#151518");
    source.baseline.options = { heatmap: { series: { stroke: "#123456" } } };
    expect(resolve(source).series).toMatchObject({ stroke: "#123456", strokeWidth: 2 });
    source.baseline.options = {
      heatmap: { series: { stroke: "#123456", strokeWidth: 0 } },
    };
    expect(resolve(source).series.strokeWidth).toBe(0);
    expect(heatmapThemePaint({ strokes: ["#abcdef"] }, false)).toMatchObject({
      colorRange: ["#5090dc", "#ffa03a"],
      stroke: "#abcdef",
    });
    expect(
      heatmapThemePaint({ divergingColors: ["#111111", "#222222"] }, false).colorRange,
    ).toEqual(["#111111", "#222222"]);
  });
  it("maps both axis titles and preserves typography pairs and manual rotation", () => {
    const source = input();
    source.baseline.options = {
      heatmap: {
        series: { label: { fontWeight: 600, fontStyle: "italic" } },
        axes: { category: { bottom: { label: { rotation: 23 } } } },
      },
    };
    const style = resolve(source);
    const selected = { style, baseline: source.baseline };
    expect(
      mapHeatmapEditorIntent(selected, {
        panel: "titles",
        edit: { caption: "verticalAxisTitle", field: "text", value: "Desk" },
      }),
    ).toMatchObject({
      valid: true,
      value: {
        eventOptions: {
          heatmap: {
            axes: {
              category: {
                left: { title: { text: "Desk" } },
                right: { title: { text: "Desk" } },
              },
            },
          },
        },
      },
    });
    expect(
      mapHeatmapEditorIntent(selected, {
        panel: "labels",
        edit: { field: "weight", value: "predefined" },
      }),
    ).toMatchObject({
      valid: true,
      value: {
        eventOptions: {
          heatmap: { series: { label: { fontWeight: 600, fontStyle: "italic" } } },
        },
      },
    });
    expect(
      mapHeatmapEditorIntent(selected, {
        panel: "heatmapAxisLabels",
        axis: "x",
        edit: { field: "autoRotate", value: false },
      }),
    ).toMatchObject({
      valid: true,
      value: {
        eventOptions: {
          heatmap: {
            axes: {
              category: { bottom: { label: { autoRotate: false, rotation: 23 } } },
            },
          },
        },
      },
    });
  });
  it.each([
    { panel: "heatmapAxis", axis: "number", edit: { field: "thickness", value: 4 } },
    { panel: "heatmapAxis", axis: "x", edit: { field: "type", value: "number" } },
    { panel: "heatmapLine", edit: { field: "strokeOpacity", value: 2 } },
    { panel: "gradientLegend", edit: { field: "reverseOrder", value: "true" } },
    { panel: "gradientLegend", edit: { field: "spacing", value: -1 } },
    { panel: "titles", edit: { caption: "invalid", field: "text", value: "Title" } },
  ])("rejects invalid or inaccessible intents %j", (intent) => {
    expect(
      mapHeatmapEditorIntent(
        { style: resolve(), baseline: input().baseline },
        intent as never,
      ).valid,
    ).toBe(false);
  });
  it("keeps native defaults and two categorical axes", () => {
    const value = resolve();
    expect(value.colorRange).toEqual(["#ffa03a", "#e1cc00", "#459d55"]);
    expect(value.axes.x.fields).toMatchObject({ type: "category", position: "bottom" });
    expect(value.axes.y.fields).toMatchObject({ type: "category", position: "left" });
    expect(value.gradientLegend).toMatchObject({
      position: "right",
      spacing: 20,
      gradient: { thickness: 16, preferredLength: 200 },
    });
  });
  it("resolves saved tooltip-off and legend reversal without changing the cell palette", () => {
    const source = input();
    source.baseline.options = {
      heatmap: {
        tooltip: { enabled: false },
        gradientLegend: { reverseOrder: true },
        axes: {
          category: { bottom: { line: { width: 4 } }, left: { line: { width: 7 } } },
        },
      },
    };
    const value = resolve(source);
    expect(value.application.tooltip.enabled).toBe(false);
    expect(value.gradientLegend.reverseOrder).toBe(true);
    expect(value.colorRange).toEqual(resolve().colorRange);
    expect(value.axes.x.fields.thickness).toBe(4);
    expect(value.axes.y.fields.thickness).toBe(7);
  });
  it("projects all four captions and only category controls", () => {
    const state = projectHeatmapEditorState(resolve());
    expect(Object.keys(state.titles.value)).toEqual([
      "title",
      "subtitle",
      "horizontalAxisTitle",
      "verticalAxisTitle",
    ]);
    expect(state.axes.x.fields.types).toBeUndefined();
    expect(state.axes.y.fields.positions).toBeUndefined();
    expect(state.tooltips.modes.map((x) => x.label)).toEqual([
      "Single",
      "Multiple",
      "Compact",
    ]);
  });
  it("writes only edited native leaves to both original axis positions", () => {
    const source = input();
    source.baseline.options = {
      unknown: { retained: 19 },
      bar: { series: { strokeWidth: 9 } },
    };
    const before = structuredClone(source);
    const selected = { style: resolve(source), baseline: source.baseline };
    expect(
      mapHeatmapEditorIntent(selected, {
        panel: "heatmapAxis",
        axis: "y",
        edit: { field: "thickness", value: 7 },
      }),
    ).toEqual({
      valid: true,
      value: {
        kind: "options",
        eventOptions: {
          heatmap: {
            axes: {
              category: {
                left: { line: { enabled: true, width: 7 } },
                right: { line: { enabled: true, width: 7 } },
              },
            },
          },
        },
      },
    });
    expect(
      mapHeatmapEditorIntent(selected, {
        panel: "tooltips",
        edit: { field: "enabled", value: false },
      }),
    ).toMatchObject({
      valid: true,
      value: { eventOptions: { heatmap: { tooltip: { enabled: false } } } },
    });
    expect(source).toEqual(before);
  });
  it("preserves native palette selection and cycles custom fills", () => {
    expect(heatmapThemePaint({ fills: ["#123456"] }, false).colorRange).toEqual([
      "#123456",
      "#123456",
    ]);
    expect(
      heatmapThemePaint({ fills: ["#111111", "#222222", "#333333"] }, false).colorRange,
    ).toEqual(["#111111", "#222222"]);
    expect(
      heatmapThemePaint({ fills: [{ type: "gradient" }] }, false).colorRange,
    ).toEqual(["#5090dc", "#5090dc"]);
    expect(heatmapThemePaint({ overrides: {} }, true).colorRange).toEqual(
      resolve().colorRange,
    );
  });
});
