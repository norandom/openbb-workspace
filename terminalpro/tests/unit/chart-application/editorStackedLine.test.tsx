import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import merge from "lodash.merge";
import { afterEach, describe, expect, it } from "vitest";
import type { AppearanceInput } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import { transitionApplicationAxisStructure } from "../../../src/components/General/Table/Chart/application/axisStructure";
import { resolveApplicationAppearance } from "../../../src/components/General/Table/Chart/application/effectiveAppearance";
import {
  deriveEditorEligibility,
  mapApplicationEditorEvent,
  rehydrateApplicationEditorEvent,
  selectApplicationEditorState,
} from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import type { ApplicationEditorIntent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import { bindingSelection } from "./editorBindingFixture";

const families = ["stackedLine", "normalizedLine"] as const;
const bindings = {
  category: { axis: "category", direction: "x", optionType: "category" },
  number: { axis: "number", direction: "y", optionType: "number" },
} as const;
function appearance(
  family: AppearanceInput["family"],
  options = {},
  overrides = {},
  generated = {},
  mode: "light" | "dark" = "light",
) {
  const input: AppearanceInput = {
    family,
    baseline: { stateAddress: "widget", chartType: family, model: {}, options },
    generated,
    precision: 2,
    seriesIds: ["revenue"],
    theme: {
      name: `openbb-${mode}`,
      mode,
      colors: {
        base: mode === "light" ? "ag-default" : "ag-default-dark",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#123456",
        chartBackgroundColor: "#ffffff",
      },
      palette: { fills: ["red"], strokes: ["blue"] },
      overrides,
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
  const result = resolveApplicationAppearance(input);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}
function selection(family: (typeof families)[number], options = {}) {
  return {
    ...bindingSelection(),
    family,
    model: { chartType: family },
    style: appearance(family, options),
    eligibility: deriveEditorEligibility({
      family,
      firstDatum: {},
      dimensionIds: [],
      grouping: false,
      categorySeriesSwitched: false,
      axisTypes: { category: "category", number: "number" },
    }),
  };
}
afterEach(cleanup);
describe("stacked line editor", () => {
  it.each(
    families,
  )("resolves %s module defaults and theme/generated/saved precedence", (family) => {
    const style = appearance(family);
    expect(style.application.series).toMatchObject({
      strokeWidth: 2,
      strokeOpacity: 1,
      fillOpacity: 1,
      lineDash: [0],
      connectMissingData: false,
      markers: { enabled: true, shape: "circle", size: 7, strokeWidth: 0 },
      labels: { enabled: false, color: "#123456" },
      shadow: { enabled: false, xOffset: 3, yOffset: 3, blur: 5 },
    });
    expect(
      appearance(family, {
        line: { series: { stroke: "purple", marker: { stroke: "pink" } } },
      }).application.series,
    ).toMatchObject({ strokeWidth: 2, markers: { strokeWidth: 1 } });
    expect(
      appearance(
        family,
        { line: { series: { fillOpacity: 0.3 } } },
        { line: { series: { fillOpacity: 0.1, strokeOpacity: 0.2 } } },
        { line: { series: { fillOpacity: 0.4, lineDash: [8] } } },
      ).application.series,
    ).toMatchObject({ fillOpacity: 0.3, strokeOpacity: 0.2, lineDash: [8] });
  });
  it.each(
    families,
  )("actual %s controls update saved line leaves and resolved appearance", (family) => {
    let options = {
      custom: { retained: true },
      area: { series: { strokeWidth: 17 } },
      bar: { series: { fillOpacity: 0.1 } },
      line: { series: { connectMissingData: false, unknown: "retained" } },
    };
    const initial = structuredClone(options);
    const input = selection(family, options);
    const state = selectApplicationEditorState(input);
    if (!state.valid) throw new Error(state.error);
    const intents: unknown[] = [];
    render(
      <ApplicationCustomizeEditor
        state={state.value}
        onAxisStructure={() => {}}
        onIntent={(intent) => {
          if (
            intent.panel === "pieLabel" ||
            intent.panel === "pieCallout" ||
            intent.panel === "pieSector"
          )
            throw Error("Line controls emitted pie intent");
          intents.push(intent);
          const event = rehydrateApplicationEditorEvent({
            selection: selection(family, options),
            bindings,
            manualRotations: { category: undefined, number: undefined },
            intent,
          });
          if (!event.valid) throw new Error(event.error);
          const patch = mapApplicationEditorEvent(event.value, family);
          if (!patch.valid) throw new Error(patch.error);
          const saved = reduceIntegratedState({
            storage: {
              chart: {
                chartModel: { chartType: family, chartOptions: options },
                range: { retained: family },
              },
            },
            stateKey: "chart",
            currentModel: { chartType: family },
            resolvedOptions: options,
            eventOptions: patch.value,
            chartType: family,
            totalSeries: 1,
            isPivotMode: false,
          });
          const partition = saved.chart as {
            chartModel: { chartOptions: typeof options };
            range: { retained: string };
          };
          expect(partition.range).toEqual({ retained: family });
          expect(partition.chartModel).toMatchObject({ chartType: family });
          options = merge({}, options, partition.chartModel.chartOptions);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.queryByLabelText("Connect Missing Data")).toBeNull();
    expect(screen.queryByLabelText("Fill Opacity value")).toBeNull();
    expect(screen.queryByRole("group", { name: "Shadow" })).toBeNull();
    for (const [label, value] of [
      ["Line Width", "4"],
      ["Line Dash", "6"],
      ["Line Opacity", "0.25"],
    ]) {
      fireEvent.change(screen.getByLabelText(`${label} value`), { target: { value } });
    }
    for (const label of ["Markers", "Labels"]) {
      fireEvent.click(
        within(screen.getByRole("group", { name: label })).getByRole("switch"),
      );
    }
    expect(intents).toHaveLength(5);
    expect(options.line.series).toMatchObject({
      strokeWidth: 4,
      lineDash: [6],
      strokeOpacity: 0.25,
      marker: { enabled: false },
      label: { enabled: true },
      connectMissingData: false,
      unknown: "retained",
    });
    expect(options.area).toEqual(initial.area);
    expect(options.bar).toEqual(initial.bar);
    expect(options.custom).toEqual(initial.custom);
    expect(appearance(family, options).application.series).toMatchObject({
      strokeWidth: 4,
      lineDash: [6],
      strokeOpacity: 0.25,
      markers: { enabled: false },
      labels: { enabled: true },
      connectMissingData: false,
    });
    const rejected = rehydrateApplicationEditorEvent({
      selection: selection(family, options),
      bindings,
      manualRotations: { category: undefined, number: undefined },
      intent: { panel: "connectMissingData", value: false },
    });
    expect(rejected.valid).toBe(false);
  });
  it.each(
    families,
  )("hydrates %s marker and font companions into line only", (family) => {
    let options = {};
    const intents: ApplicationEditorIntent[] = [
      { panel: "markers", edit: { field: "shape", value: "diamond" } },
      { panel: "markers", edit: { field: "size", value: 19 } },
      { panel: "markers", edit: { field: "strokeWidth", value: 3 } },
      { panel: "labels", edit: { field: "font", value: "Arial" } },
      { panel: "labels", edit: { field: "weight", value: "italic" } },
      { panel: "labels", edit: { field: "size", value: 18 } },
      { panel: "labels", edit: { field: "color", value: "purple" } },
    ];
    for (const intent of intents) {
      const event = rehydrateApplicationEditorEvent({
        selection: selection(family, options),
        bindings,
        manualRotations: { category: undefined, number: undefined },
        intent,
      });
      if (!event.valid) throw new Error(event.error);
      const patch = mapApplicationEditorEvent(event.value, family);
      if (!patch.valid) throw new Error(patch.error);
      expect(Object.keys(patch.value)).toEqual(["line"]);
      options = merge({}, options, patch.value);
    }
    expect(appearance(family, options).application.series).toMatchObject({
      markers: { shape: "diamond", size: 19, strokeWidth: 3 },
      labels: { font: "Arial", size: 18, color: "purple", fontStyle: "italic" },
    });
  });
});

describe("line namespace continuity", () => {
  it.each(
    families,
  )("inherits %s host connection defaults with saved false in either theme", (family) => {
    for (const mode of ["light", "dark"] as const) {
      const theme = {
        line: {
          series: { connectMissingData: true, strokeWidth: 3, strokeOpacity: 0.4 },
        },
      };
      expect(appearance(family, {}, theme, {}, mode).line?.connectMissingData).toBe(
        true,
      );
      const saved = { line: { series: { connectMissingData: false, strokeWidth: 7 } } };
      const generated = { line: { series: { strokeWidth: 5, lineDash: [9] } } };
      const style = appearance(family, saved, theme, generated, mode);
      expect(style.application.series).toMatchObject({
        connectMissingData: false,
        strokeWidth: 7,
        strokeOpacity: 0.4,
        lineDash: [9],
      });
      expect(style.series.revenue.stroke).toBe("red");
      expect(style.application.legendMarkerStrokeWidth).toBe(0);
    }
  });
  it.each(
    families,
  )("transfers %s structural axis options through line and retains exact model token", (family) => {
    const options = {
      custom: { untouched: 1 },
      line: {
        axes: {
          category: {
            crosshair: { enabled: true },
            bottom: { label: { color: "purple" } },
            unknown: "keep",
          },
        },
        series: { unknown: 9 },
      },
      area: { unknown: 7 },
    };
    const original = structuredClone(options);
    const runtime: AppearanceInput["axisRuntime"] = {
      categoryAxisType: "category",
      axes: [
        {
          id: "category",
          direction: "x",
          type: "category",
          position: "bottom",
          options: { retained: 5 },
        },
        { id: "number", direction: "y", type: "number", position: "left", options: {} },
      ],
    };
    const transition = transitionApplicationAxisStructure({
      family,
      runtime,
      savedOptions: options,
      event: {
        panel: "axisStructure",
        axis: "category",
        edit: { field: "type", value: "time" },
      },
    });
    expect(transition.valid).toBe(true);
    if (!transition.valid) throw Error(transition.error);
    expect(transition.value.runtime.axes[0]).toMatchObject({
      type: "time",
      position: "bottom",
      options: { retained: 5, label: { format: "%d %B %Y" } },
    });
    expect(transition.value.eventOptions).toMatchObject({
      line: {
        axes: {
          time: {
            crosshair: { enabled: true },
            bottom: { label: { color: "purple" } },
          },
        },
      },
    });
    expect(transition.value.eventOptions).not.toHaveProperty("bar");
    const result = reduceIntegratedState({
      storage: {
        chart: {
          chartModel: { chartType: family, unknown: "model", chartOptions: options },
          range: { keep: 1 },
        },
      },
      stateKey: "chart",
      currentModel: { chartType: family, unknown: "model" },
      resolvedOptions: options,
      eventOptions: transition.value.eventOptions,
      chartType: family,
      totalSeries: 1,
      isPivotMode: false,
    });
    expect(result.chart).toMatchObject({
      chartModel: {
        chartType: family,
        unknown: "model",
        chartOptions: {
          custom: original.custom,
          area: original.area,
          line: { series: { unknown: 9 }, axes: { category: { unknown: "keep" } } },
        },
      },
      range: { keep: 1 },
    });
    expect(options).toEqual(original);
  });
  it("uses retained line options across ordinary and both stacked family transitions", () => {
    const options = {
      line: { series: { strokeWidth: 6, connectMissingData: false } },
      bar: { series: { strokeWidth: 17 } },
    };
    for (const family of ["line", ...families, "line"] as const) {
      expect(appearance(family, options).application.series).toMatchObject({
        strokeWidth: 6,
        connectMissingData: false,
        markers: { enabled: true },
      });
    }
    expect(
      deriveEditorEligibility({
        family: "line",
        firstDatum: {},
        dimensionIds: [],
        grouping: false,
        categorySeriesSwitched: false,
        axisTypes: { category: "category", number: "number" },
      }).connectMissingData,
    ).toBe(true);
  });
  it.each(families)("preserves %s tooltip and shared edits in line only", (family) => {
    for (const intent of [
      { panel: "tooltips", edit: { field: "mode", value: "shared" } },
      { panel: "background", edit: { field: "visible", value: false } },
      { panel: "padding", edit: { side: "left", value: 31 } },
      {
        panel: "titles",
        edit: { caption: "title", field: "text", value: "Cash flow" },
      },
    ] as const) {
      const hydrated = rehydrateApplicationEditorEvent({
        selection: selection(family),
        bindings,
        manualRotations: { category: undefined, number: undefined },
        intent,
      });
      if (!hydrated.valid) throw Error(hydrated.error);
      const mapped = mapApplicationEditorEvent(hydrated.value, family);
      expect(mapped.valid && Object.keys(mapped.value)).toEqual(["line"]);
      if (!mapped.valid) throw Error(mapped.error);
      const style = appearance(family, mapped.value).application;
      expect(style).toBeTruthy();
      if (intent.panel === "tooltips") expect(style.tooltip.mode).toBe("shared");
    }
    const rejected = rehydrateApplicationEditorEvent({
      selection: selection(family),
      bindings,
      manualRotations: { category: undefined, number: undefined },
      intent: { panel: "series", edit: { field: "fillOpacity", value: 0.5 } },
    });
    expect(rejected.valid).toBe(false);
  });
});
