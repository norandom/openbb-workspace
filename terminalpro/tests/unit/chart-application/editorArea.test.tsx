import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import merge from "lodash.merge";
import type { AppearanceInput } from "../../../src/components/General/Table/Chart/application/appearanceModel";
import { resolveApplicationAppearance } from "../../../src/components/General/Table/Chart/application/effectiveAppearance";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import { deriveEditorEligibility, mapApplicationEditorEvent, rehydrateApplicationEditorEvent, selectApplicationEditorState } from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import type { ApplicationEditorIntent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
import { bindingSelection } from "./editorBindingFixture";

const families = ["area", "stackedArea", "normalizedArea"] as const;
const bindings = { category: { axis: "category", direction: "x", optionType: "category" }, number: { axis: "number", direction: "y", optionType: "number" } } as const;
function appearance(family: AppearanceInput["family"], options = {}, overrides = {}, generated = {}) {
  const input: AppearanceInput = {
    family, baseline: { stateAddress: "widget", chartType: family, model: {}, options }, generated,
    precision: 2, seriesIds: ["revenue"],
    theme: { name: "openbb-light", mode: "light", colors: { base: "ag-default", foregroundColor: "#000000", backgroundColor: "#ffffff", textColor: "#123456", chartBackgroundColor: "#ffffff" }, palette: { fills: ["red"], strokes: ["blue"] }, overrides },
    axisRuntime: { categoryAxisType: "category", axes: [{ id: "category", direction: "x", type: "category", position: "bottom", options: {} }, { id: "number", direction: "y", type: "number", position: "left", options: {} }] },
  };
  const result = resolveApplicationAppearance(input);
  if (!result.valid) throw new Error(result.error);
  return result.value;
}
function selection(family: typeof families[number], options = {}) {
  return { ...bindingSelection(), family, style: appearance(family, options), eligibility: deriveEditorEligibility({ family, firstDatum: {}, dimensionIds: [], grouping: false, categorySeriesSwitched: false, axisTypes: { category: "category", number: "number" } }) };
}
afterEach(cleanup);
describe("original area editor", () => {
  it.each(families)("resolves %s module defaults and theme/generated/saved precedence", family => {
    const style = appearance(family);
    expect(style.application.series).toMatchObject({ strokeWidth: 0, strokeOpacity: 1, fillOpacity: 0.8, lineDash: [0], connectMissingData: false, markers: { enabled: false, shape: "circle", size: 7, strokeWidth: 0 }, labels: { enabled: false, color: "#123456" }, shadow: { enabled: false, xOffset: 3, yOffset: 3, blur: 5 } });
    expect(appearance(family, { area: { series: { stroke: "purple", marker: { stroke: "pink" } } } }).application.series).toMatchObject({ strokeWidth: 2, markers: { strokeWidth: 1 } });
    expect(appearance(family, { area: { series: { fillOpacity: 0.3 } } }, { area: { series: { fillOpacity: 0.1, strokeOpacity: 0.2 } } }, { area: { series: { fillOpacity: 0.4, lineDash: [8] } } }).application.series).toMatchObject({ fillOpacity: 0.3, strokeOpacity: 0.2, lineDash: [8] });
  });
  it.each(families)("actual %s controls update saved area leaves and resolved appearance", family => {
    let options = { custom: { retained: true }, line: { series: { strokeWidth: 17 } }, bar: { series: { fillOpacity: 0.1 } }, area: { series: { connectMissingData: true, unknown: "retained" } } };
    const initial = structuredClone(options);
    const input = selection(family, options);
    const state = selectApplicationEditorState(input);
    if (!state.valid) throw new Error(state.error);
    const intents: unknown[] = [];
    render(<ApplicationCustomizeEditor state={state.value} onAxisStructure={() => {}} onIntent={intent => {
      if (intent.panel === "pieLabel" || intent.panel === "pieCallout" || intent.panel === "pieSector") throw Error("Area controls emitted pie intent");
      intents.push(intent);
      const event = rehydrateApplicationEditorEvent({ selection: selection(family, options), bindings, manualRotations: { category: undefined, number: undefined }, intent });
      if (!event.valid) throw new Error(event.error);
      const patch = mapApplicationEditorEvent(event.value, family);
      if (!patch.valid) throw new Error(patch.error);
      const saved = reduceIntegratedState({ storage: { chart: { chartModel: { chartType: family, chartOptions: options }, range: { retained: family } } }, stateKey: "chart", currentModel: { chartType: family }, resolvedOptions: options, eventOptions: patch.value, chartType: family, totalSeries: 1, isPivotMode: false });
      const partition = saved.chart as { chartModel: { chartOptions: typeof options }; range: { retained: string } };
      expect(partition.range).toEqual({ retained: family });
      expect(partition.chartModel).toMatchObject({ chartType: family });
      options = merge({}, options, partition.chartModel.chartOptions);
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Series" }));
    expect(screen.queryByLabelText("Connect Missing Data")).toBeNull();
    for (const [label, value] of [["Line Width", "4"], ["Line Dash", "6"], ["Line Opacity", "0.25"], ["Fill Opacity", "0.45"]]) {
      fireEvent.change(screen.getByLabelText(`${label} value`), { target: { value } });
    }
    for (const label of ["Markers", "Labels", "Shadow"]) {
      fireEvent.click(within(screen.getByRole("group", { name: label })).getByRole("switch"));
    }
    expect(intents).toHaveLength(7);
    expect(options.area.series).toMatchObject({ strokeWidth: 4, lineDash: [6], strokeOpacity: 0.25, fillOpacity: 0.45, marker: { enabled: true }, label: { enabled: true }, shadow: { enabled: true }, connectMissingData: true, unknown: "retained" });
    expect(options.line).toEqual(initial.line);
    expect(options.bar).toEqual(initial.bar);
    expect(options.custom).toEqual(initial.custom);
    expect(appearance(family, options).application.series).toMatchObject({ strokeWidth: 4, lineDash: [6], strokeOpacity: 0.25, fillOpacity: 0.45, markers: { enabled: true }, labels: { enabled: true }, shadow: { enabled: true }, connectMissingData: true });
    const rejected = rehydrateApplicationEditorEvent({ selection: selection(family, options), bindings, manualRotations: { category: undefined, number: undefined }, intent: { panel: "connectMissingData", value: false } });
    expect(rejected.valid).toBe(false);
  });
  it.each(families)("hydrates %s marker, font and shadow companions into area only", family => {
    let options = {};
    const intents: ApplicationEditorIntent[] = [
      { panel: "markers", edit: { field: "shape", value: "diamond" } },
      { panel: "markers", edit: { field: "size", value: 19 } },
      { panel: "markers", edit: { field: "strokeWidth", value: 3 } },
      { panel: "labels", edit: { field: "font", value: "Arial" } },
      { panel: "labels", edit: { field: "weight", value: "italic" } },
      { panel: "labels", edit: { field: "size", value: 18 } },
      { panel: "labels", edit: { field: "color", value: "purple" } },
      { panel: "shadow", edit: { field: "color", value: "red" } },
      { panel: "shadow", edit: { field: "blur", value: 11 } },
      { panel: "shadow", edit: { field: "xOffset", value: -4 } },
      { panel: "shadow", edit: { field: "yOffset", value: 9 } },
    ];
    for (const intent of intents) {
      const event = rehydrateApplicationEditorEvent({ selection: selection(family, options), bindings, manualRotations: { category: undefined, number: undefined }, intent });
      if (!event.valid) throw new Error(event.error);
      const patch = mapApplicationEditorEvent(event.value, family);
      if (!patch.valid) throw new Error(patch.error);
      expect(Object.keys(patch.value)).toEqual(["area"]);
      options = merge({}, options, patch.value);
    }
    expect(appearance(family, options).application.series).toMatchObject({ markers: { shape: "diamond", size: 19, strokeWidth: 3 }, labels: { font: "Arial", size: 18, color: "purple", fontStyle: "italic" }, shadow: { color: "red", blur: 11, xOffset: -4, yOffset: 9 } });
  });
});
