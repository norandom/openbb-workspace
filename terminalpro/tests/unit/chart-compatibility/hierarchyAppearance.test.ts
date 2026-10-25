import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveHierarchyAppearance } from "../../../src/components/General/Table/Chart/application/hierarchyAppearance";
import { projectHierarchyEditorState } from "../../../src/components/General/Table/Chart/application/hierarchyEditorState";
import { mapHierarchyEditorIntent } from "../../../src/components/General/Table/Chart/application/hierarchyEditorTransaction";
import type { HierarchyAppearanceInput, ResolvedHierarchyStyle } from "../../../src/components/General/Table/Chart/application/hierarchyAppearanceTypes";
import type { HierarchyAcceptedEditIntent } from "../../../src/components/General/Table/Chart/application/hierarchyEditorTypes";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import { HierarchySpacingControls } from "../../../src/components/General/Table/Chart/editor/hierarchy/HierarchySpacingControls";
import { HierarchyGradientLegendPanel } from "../../../src/components/General/Table/Chart/editor/hierarchy/HierarchyGradientLegendPanel";

afterEach(cleanup);
function input(family: "treemap" | "sunburst" = "treemap"): { -readonly [Key in keyof HierarchyAppearanceInput]: HierarchyAppearanceInput[Key] } {
  return {
    family, baseline: { stateAddress: "hierarchy", chartType: family, model: {}, options: {} },
    generated: {}, precision: 2, assignments: { sizeId: "amount", colorId: "rate" },
    theme: { name: "ag-default", mode: "light", overrides: {},
      colors: { base: "ag-default", foregroundColor: "#000000", backgroundColor: "#ffffff", textColor: "#111111", chartBackgroundColor: "#ffffff" },
      palette: { fills: ["#123456"], strokes: ["#654321"] } },
    themePalette: { fills: ["#123456"], strokes: ["#654321"], hierarchyColors: ["#dddddd"], secondHierarchyColors: ["#cccccc"], colorRange: ["#ff0000", "#0000ff"] },
  };
}
function resolved(value = input()): ResolvedHierarchyStyle {
  const result = resolveHierarchyAppearance(value);
  if (!result.valid) throw Error(result.error);
  return result.value;
}
function mapped(intent: unknown, value = input()) {
  return mapHierarchyEditorIntent({ style: resolved(value), assignments: value.assignments }, intent as HierarchyAcceptedEditIntent);
}
describe("hierarchy appearance composition", () => {
  it("resolves finite family defaults and separates gradient and categorical legend", () => {
    const style = resolved();
    expect(style).toMatchObject({ family: "treemap", group: { padding: 4, gap: 2 }, tile: { padding: 3, gap: 1 }, tooltip: { enabled: true, mode: "single" }, gradientLegend: { enabled: true, position: "right", spacing: 20, reverseOrder: false, gradient: { thickness: 16, preferredLength: 200 } } });
    expect(style.application.padding.bottom).toBe(10);
    expect(style.application).not.toHaveProperty("legend");
    expect(resolved(input("sunburst"))).toMatchObject({ series: { sectorSpacing: 2, padding: 3, label: { enabled: true, wrapping: "never" } } });
  });
  it("replaces saved common, layers theme and family, honors zero/false and ignores model options", () => {
    const value = input();
    value.baseline.model.chartOptions = { treemap: { series: { group: { padding: 999 } } } };
    value.baseline.options.common = { title: { text: "discarded" } };
    value.baseline.options.treemap = { series: { group: { padding: 0 } }, tooltip: { enabled: false }, gradientLegend: { enabled: false, spacing: 0 } };
    value.generated = { common: { title: { text: "generated" } }, treemap: { series: { group: { gap: 8 } } } };
    value.theme.overrides.common = { title: { enabled: true }, series: { group: { padding: 7 } } };
    value.theme.overrides.treemap = { series: { group: { gap: 6 } } };
    const before = JSON.stringify(value);
    expect(resolved(value)).toMatchObject({ application: { title: { text: "generated", enabled: true } }, group: { padding: 0, gap: 8 }, tooltip: { enabled: false }, gradientLegend: { enabled: false, spacing: 0 } });
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each(["never", "always", "hyphenate", "on-space"])("retains %s wrapping and advanced saved paint as detached data", (wrapping) => {
    const value = input();
    const fill = { type: "gradient", gradient: "conic", colorStops: [{ color: "red", stop: 0 }, { color: "blue", stop: 1 }] };
    value.baseline.options.treemap = { series: { tile: { fill, label: { wrapping, overflowStrategy: "hide", padding: { left: 0 }, border: { enabled: false, strokeWidth: 0 } } } } };
    const style = resolved(value);
    expect(style.family === "treemap" && style.tile).toMatchObject({ fill, label: { wrapping, overflowStrategy: "hide", padding: { left: 0 }, border: { enabled: false, strokeWidth: 0 } } });
    expect(style.family === "treemap" && style.tile.fill).not.toBe(fill);
    expect(Object.isFrozen(style.palette.fills)).toBe(true);
  });
  it("uses hierarchy palette input and family overrides without changing caller tokens", () => {
    const value = input();
    value.baseline.options.treemap = { series: { fills: ["#abcdef"], undocumentedGroupFills: ["#010203"], colorRange: ["red", "blue"] } };
    expect(resolved(value).palette).toEqual({ fills: ["#abcdef"], strokes: ["#654321"], hierarchyColors: ["#010203"], secondHierarchyColors: ["#cccccc"], colorRange: ["red", "blue"] });
    expect(value.themePalette.fills).toEqual(["#123456"]);
  });
  it("distinguishes stock palette strokes from explicit source outline intent", () => {
    expect(resolved(input("sunburst"))).toMatchObject({ series: { strokeWidth: 0 } });
    const sunburst = input("sunburst"); sunburst.baseline.options.sunburst = { series: { strokes: ["red"] } };
    expect(resolved(sunburst)).toMatchObject({ series: { strokeWidth: 2 } });
    const treemap = input(); treemap.baseline.options.treemap = { series: { tile: { stroke: "red", strokeWidth: 0 } } };
    expect(resolved(treemap)).toMatchObject({ tile: { stroke: "red", strokeWidth: 0 } });
  });
  it("rejects malformed consumed values and getters without invoking them", () => {
    for (const bad of [NaN, -1, "4", null]) {
      const value = input(); value.baseline.options.treemap = { series: { group: { padding: bad } } };
      expect(resolveHierarchyAppearance(value).valid).toBe(false);
    }
    const value = input(); const getter = vi.fn(() => ({}));
    Object.defineProperty(value.theme.overrides, "treemap", { enumerable: true, get: getter });
    expect(resolveHierarchyAppearance(value).valid).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([
    { fills: { 0: "red" } },
    { tile: { fill: { type: "gradient", colorStops: [{ stop: 1 }, { stop: 0 }] } } },
    { tile: { fill: { type: "pattern", width: -1 } } },
    { tile: { fill: { type: "image", url: "data:image/png;base64,", backgroundFillOpacity: 2 } } },
    { tile: { label: { wrapping: "breakAll" } } },
  ])("rejects invalid consumed palette, paint and label values", (series) => {
    const value = input(); value.baseline.options.treemap = { series };
    expect(resolveHierarchyAppearance(value).valid).toBe(false);
  });
});
describe("hierarchy editor state and leaf transactions", () => {
  it("projects immutable narrow state, larger saved slider bounds and retained Color preferences", () => {
    const value = input(); value.baseline.options.treemap = { series: { group: { padding: 25 } }, gradientLegend: { enabled: false, gradient: { preferredLength: 450 } } };
    const style = resolved(value);
    const state = projectHierarchyEditorState(style, {});
    expect(state).not.toHaveProperty("legend"); expect(state).not.toHaveProperty("axes");
    expect(state.titles.availableCaptions).toEqual(["title", "subtitle"]);
    expect(state.gradientLegend).toMatchObject({ applicable: false, value: { enabled: false, preferredLength: 450 }, bounds: { preferredLength: { max: 450 } } });
    expect(state.family === "treemap" && state.spacing.map(v => [v.field, v.value, v.bounds.max])).toEqual([["groupPadding", 25, 25], ["groupGap", 2, 10], ["tilePadding", 3, 10], ["tileGap", 1, 10]]);
    expect(Object.isFrozen(state.titles.value.title)).toBe(true);
    expect(state.titles.value.title).not.toBe(style.application.title);
    expect(projectHierarchyEditorState(style, { colorId: "missing-observations" }).gradientLegend.applicable).toBe(true);
    expect(projectHierarchyEditorState(resolved(input("sunburst")), {})).not.toHaveProperty("spacing");
  });
  it.each([["groupPadding", "group", "padding"], ["groupGap", "group", "gap"], ["tilePadding", "tile", "padding"], ["tileGap", "tile", "gap"]])("maps independent %s leaf", (field, branch, leaf) => {
    expect(mapped({ panel: "hierarchySpacing", edit: { field, value: 0 } })).toEqual({ valid: true, value: { kind: "options", eventOptions: { treemap: { series: { [branch]: { [leaf]: 0 } } } } } });
  });
  it.each([
    ["enabled", false, { enabled: false }], ["reverseOrder", true, { reverseOrder: true }], ["position", "left", { position: "left" }],
    ["thickness", 0, { gradient: { thickness: 0 } }], ["preferredLength", 800, { gradient: { preferredLength: 800 } }], ["spacing", 0, { spacing: 0 }],
    ["font", "Custom Font", { scale: { label: { fontFamily: "Custom Font" } } }], ["size", 0, { scale: { label: { fontSize: 0 } } }], ["color", "red", { scale: { label: { color: "red" } } }],
  ])("maps exact gradient %s path", (field, value, leaf) => {
    expect(mapped({ panel: "hierarchyGradientLegend", edit: { field, value } })).toEqual({ valid: true, value: { kind: "options", eventOptions: { treemap: { gradientLegend: leaf } } } });
  });
  it("uses current predefined font pair and maps existing common controls", () => {
    const value = input(); value.baseline.options.treemap = { gradientLegend: { scale: { label: { fontWeight: 630, fontStyle: "oblique" } } } };
    expect(mapped({ panel: "hierarchyGradientLegend", edit: { field: "weight", value: "predefined" } }, value)).toMatchObject({ value: { eventOptions: { treemap: { gradientLegend: { scale: { label: { fontWeight: 630, fontStyle: "oblique" } } } } } } });
    for (const [intent, leaf] of [
      [{ panel: "titles", edit: { caption: "subtitle", field: "text", value: "Units: USD" } }, { subtitle: { text: "Units: USD" } }],
      [{ panel: "tooltips", edit: { field: "enabled", value: false } }, { tooltip: { enabled: false } }],
      [{ panel: "padding", edit: { side: "bottom", value: 0 } }, { padding: { bottom: 0 } }],
      [{ panel: "background", edit: { field: "visible", value: false } }, { background: { visible: false } }],
    ]) expect(mapped(intent)).toMatchObject({ valid: true, value: { eventOptions: { treemap: leaf } } });
  });
  it("leaves unknown/inactive options intact through the authoritative reducer and Color reselect", () => {
    const value = input();
    Object.assign(value.baseline.options, { custom: { keep: [1, null] }, sunburst: { custom: "inactive" }, treemap: { gradientLegend: { enabled: false }, custom: "selected" } });
    const before = JSON.stringify(value.baseline);
    const mutation = mapped({ panel: "hierarchySpacing", edit: { field: "tileGap", value: 0 } }, value);
    if (!mutation.valid) throw Error(mutation.error);
    const storage = reduceIntegratedState({ storage: {}, stateKey: "chart", currentModel: value.baseline.model, resolvedOptions: value.baseline.options, eventOptions: mutation.value.eventOptions, chartType: "treemap", totalSeries: 2, isPivotMode: false });
    expect(storage).toMatchObject({ chart: { chartModel: { chartOptions: { custom: { keep: [1, null] }, sunburst: { custom: "inactive" }, treemap: { custom: "selected", gradientLegend: { enabled: false }, series: { tile: { gap: 0 } } } } } } });
    expect(projectHierarchyEditorState(resolved(value), {}).gradientLegend.value.enabled).toBe(false);
    expect(projectHierarchyEditorState(resolved(value), { colorId: "rate" }).gradientLegend).toMatchObject({ applicable: true, value: { enabled: false } });
    expect(JSON.stringify(value.baseline)).toBe(before);
  });
  it("rejects malformed/cross-family/inapplicable intents and never inspects thrown properties", () => {
    const invalid = [null, [], { panel: "legend", edit: { field: "enabled", value: true } }, { panel: "titles", edit: { caption: "horizontalAxisTitle", field: "text", value: "bad" } }, { panel: "hierarchySpacing", edit: { field: "groupPadding", value: NaN } }, { panel: "hierarchySpacing", edit: { field: "tileGap", value: -1 } }, { panel: "hierarchyGradientLegend", edit: { field: "position", value: "diagonal" } }, { panel: "tooltips", edit: { field: "enabled", value: false, extra: 1 } }];
    invalid.forEach(intent => expect(mapped(intent).valid).toBe(false));
    expect(mapped({ panel: "hierarchySpacing", edit: { field: "tileGap", value: 2 } }, input("sunburst")).valid).toBe(false);
    expect(mapped({ panel: "hierarchyGradientLegend", edit: { field: "enabled", value: true } }, { ...input(), assignments: {} }).valid).toBe(false);
    const getter = vi.fn(); const intent = Object.defineProperty({}, "panel", { enumerable: true, get: getter });
    expect(mapped(intent).valid).toBe(false); expect(getter).not.toHaveBeenCalled();
    const thrown = Object.defineProperty({}, "message", { get: getter });
    expect(mapped(new Proxy({}, { ownKeys() { throw thrown; } })).valid).toBe(false); expect(getter).not.toHaveBeenCalled();
  });
});
it("renders four spacing primitives and the disabled/re-enabled semantic gradient group", () => {
  const state = projectHierarchyEditorState(resolved(), {}); const edit = vi.fn();
  if (state.family !== "treemap") throw Error("Expected Treemap");
  render(React.createElement(HierarchySpacingControls, { controls: state.spacing, onEdit: edit }));
  fireEvent.change(screen.getByLabelText("Group Padding value"), { target: { value: "0" } });
  expect(edit).toHaveBeenLastCalledWith({ field: "groupPadding", value: 0 }); cleanup();
  const view = render(React.createElement(HierarchyGradientLegendPanel, { ...state.gradientLegend, onEdit: edit }));
  fireEvent.click(screen.getByRole("button", { name: "Gradient Legend" }));
  expect(screen.getByRole("group", { name: "Gradient Legend" }).hasAttribute("disabled")).toBe(true);
  view.rerender(React.createElement(HierarchyGradientLegendPanel, { ...state.gradientLegend, applicable: true, onEdit: edit }));
  fireEvent.change(screen.getByLabelText("Thickness value"), { target: { value: "0" } });
  expect(edit).toHaveBeenLastCalledWith({ field: "thickness", value: 0 });
  expect(screen.queryByText("Marker Size")).toBeNull();
});
