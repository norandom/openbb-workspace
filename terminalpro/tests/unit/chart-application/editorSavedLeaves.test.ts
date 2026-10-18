import { describe, expect, it } from "vitest";
import {
  mapApplicationEditorEvent,
  rehydrateApplicationEditorEvent,
} from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import type {
  ApplicationEditorEvent,
  RehydrateEditorEventInput,
} from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import { bindingSelection } from "./editorBindingFixture";

const font = { predefined: { fontWeight: 500, fontStyle: "oblique" } };
const binding = { axis: "number", direction: "y", optionType: "number" } as const;
const cases: [string, string, unknown, string, unknown][] = [
  ["background", "visible", false, "background.visible", false],
  ["background", "fill", "transparent", "background.fill", "transparent"],
  ["tooltips", "enabled", false, "tooltip.enabled", false],
  ["tooltips", "mode", "compact", "tooltip.mode", "compact"],
  ["series", "strokeWidth", 7.5, "series.strokeWidth", 7.5],
  ["series", "lineDash", 3, "series.lineDash", [3]],
  ["series", "strokeOpacity", 0.2, "series.strokeOpacity", 0.2],
  ["series", "fillOpacity", 0, "series.fillOpacity", 0],
  ["shadow", "enabled", false, "series.shadow.enabled", false],
  ["shadow", "color", "rgba(1,2,3,.5)", "series.shadow.color", "rgba(1,2,3,.5)"],
  ["shadow", "blur", 11, "series.shadow.blur", 11],
  ["shadow", "xOffset", -4, "series.shadow.xOffset", -4],
  ["shadow", "yOffset", 9, "series.shadow.yOffset", 9],
  ["labels", "enabled", false, "series.label.enabled", false],
  ["labels", "font", "Custom Serif", "series.label.fontFamily", "Custom Serif"],
  [
    "labels",
    "weight",
    "italic",
    "series.label",
    { fontWeight: "normal", fontStyle: "italic" },
  ],
  ["labels", "size", 0, "series.label.fontSize", 0],
  ["labels", "color", "red", "series.label.color", "red"],
  ["markers", "enabled", false, "series.marker.enabled", false],
  ["markers", "shape", "heart", "series.marker.shape", "heart"],
  ["markers", "size", 19, "series.marker.size", 19],
  ["markers", "strokeWidth", 4, "series.marker.strokeWidth", 4],
  ["ticks", "enabled", false, "tick.enabled", false],
  ["ticks", "color", "blue", "tick.stroke", "blue"],
  ["ticks", "width", 4, "tick.width", 4],
  ["ticks", "length", 8, "tick.size", 8],
  ["grid", "enabled", false, "gridLine.enabled", false],
  ["grid", "color", "green", "gridLine.style", [{ stroke: "green", lineDash: [2, 4] }]],
  ["grid", "lineDash", 7, "gridLine.style", [{ stroke: "blue", lineDash: [7] }]],
  ["grid", "thickness", 2.5, "gridLine.width", 2.5],
  ["axis", "color", "red", "line.stroke", "red"],
  ["axis", "thickness", 5, "line", { enabled: true, width: 5 }],
  ["axisLabels", "font", "Courier", "label.fontFamily", "Courier"],
  [
    "axisLabels",
    "weight",
    "bold",
    "label",
    { fontWeight: "bold", fontStyle: "normal" },
  ],
  ["axisLabels", "size", 21, "label.fontSize", 21],
  ["axisLabels", "color", "purple", "label.color", "purple"],
  ["axisLabels", "padding", 8, "label.spacing", 8],
  ["axisLabels", "rotation", -180, "label.rotation", -180],
];
function nested(path: string, value: unknown): unknown {
  return path
    .split(".")
    .reverse()
    .reduce((child, key) => ({ [key]: child }), value);
}
describe("complete original saved field contract", () => {
  it.each(
    cases,
  )("%s.%s emits the original leaf", (panel, field, value, path, expected) => {
    const extras =
      panel === "labels"
        ? { font }
        : panel === "axisLabels"
          ? { binding, font, manualRotation: 20 }
          : panel === "grid"
            ? { binding, firstStyle: { stroke: "blue", lineDash: [2, 4] } }
            : ["axis", "ticks"].includes(panel)
              ? { binding }
              : {};
    const event = {
      panel,
      edit: { field, value },
      ...extras,
    } as ApplicationEditorEvent;
    const result = mapApplicationEditorEvent(event, "line");
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    const leaf = nested(path, expected);
    expect(result.value).toEqual({
      line:
        "binding" in event ? { axes: { number: { left: leaf, right: leaf } } } : leaf,
    });
  });
  it.each([
    "top",
    "right",
    "bottom",
    "left",
  ] as const)("padding.%s is an independent saved leaf", (side) => {
    expect(
      mapApplicationEditorEvent(
        { panel: "padding", edit: { side, value: 31 } },
        "line",
      ),
    ).toEqual({ valid: true, value: { line: { padding: { [side]: 31 } } } });
  });
  it("connect missing data saves its original series field", () => {
    expect(
      mapApplicationEditorEvent({ panel: "connectMissingData", value: false }, "line"),
    ).toEqual({
      valid: true,
      value: { line: { series: { connectMissingData: false } } },
    });
  });
  it("original reducer retains unknown, inactive and alternating style branches", () => {
    const baseline = {
      custom: { x: 1 },
      bar: { series: { unknown: "retained" } },
      line: {
        axes: {
          number: {
            left: {
              gridLine: {
                enabled: true,
                style: [
                  { stroke: "blue", lineDash: [2], custom: 9 },
                  { stroke: "pink" },
                ],
              },
            },
          },
        },
      },
    };
    const patch = mapApplicationEditorEvent(
      {
        panel: "grid",
        binding,
        firstStyle: { stroke: "blue", lineDash: [2] },
        edit: { field: "color", value: "red" },
      },
      "line",
    );
    if (!patch.valid) throw new Error(patch.error);
    const result = reduceIntegratedState({
      storage: { chart: { unknown: "retained", chartModel: { other: "retained" } } },
      stateKey: "chart",
      currentModel: { chartId: "id" },
      resolvedOptions: baseline,
      eventOptions: patch.value,
      chartType: "line",
      totalSeries: 2,
      isPivotMode: false,
    });
    expect(result).toMatchObject({
      chart: {
        unknown: "retained",
        chartModel: {
          other: "retained",
          chartOptions: {
            custom: { x: 1 },
            bar: { series: { unknown: "retained" } },
            line: {
              axes: {
                number: {
                  left: {
                    gridLine: {
                      enabled: true,
                      style: [
                        { stroke: "red", lineDash: [2], custom: 9 },
                        { stroke: "pink" },
                      ],
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(baseline.line.axes.number.left.gridLine.style[0].stroke).toBe("blue");
  });
  it("fresh hydration uses the newly accepted companion color, not the prior render", () => {
    const selection = bindingSelection();
    const changed = {
      ...selection,
      style: {
        ...selection.style,
        application: {
          ...selection.style.application,
          axes: {
            ...selection.style.application.axes,
            category: {
              ...selection.style.application.axes.category,
              gridStyles: [{ stroke: "red", lineDash: [2, 3] }],
            },
          },
        },
      },
    };
    const input: RehydrateEditorEventInput = {
      selection: changed,
      intent: {
        panel: "grid",
        axis: "category",
        edit: { field: "lineDash", value: 9 },
      },
      bindings: {
        category: { axis: "category", direction: "x", optionType: "category" },
        number: binding,
      },
      manualRotations: { category: undefined, number: undefined },
    };
    const event = rehydrateApplicationEditorEvent(input);
    expect(event.valid).toBe(true);
    if (event.valid)
      expect(mapApplicationEditorEvent(event.value, "groupedColumn")).toMatchObject({
        valid: true,
        value: {
          bar: {
            axes: {
              category: {
                bottom: { gridLine: { style: [{ stroke: "red", lineDash: [9] }] } },
              },
            },
          },
        },
      });
  });
});
