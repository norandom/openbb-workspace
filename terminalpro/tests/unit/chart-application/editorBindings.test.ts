import { describe, expect, it } from "vitest";
import {
  mapApplicationEditorEvent,
  rehydrateApplicationEditorEvent,
  selectApplicationEditorState,
} from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import {
  createEditorMetadata,
  fontChoices,
} from "../../../src/components/General/Table/Chart/compatibility/editorBindings/metadata";
import { deriveEditorEligibility } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/eligibility";
import type { ApplicationEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/types";
import { bindingSelection } from "./editorBindingFixture";

const font = { predefined: { fontWeight: 500, fontStyle: "oblique" } };
const binding = { axis: "category", direction: "x", optionType: "time" } as const;
function patch(event: ApplicationEditorEvent, family = "groupedColumn") {
  const result = mapApplicationEditorEvent(event, family as "groupedColumn");
  expect(result.valid).toBe(true);
  return result.valid ? result.value : {};
}
describe("original appearance edit leaves", () => {
  it.each([
    "groupedColumn",
    "stackedColumn",
    "groupedBar",
    "stackedBar",
    "line",
  ])("writes only the %s partition", (family) => {
    expect(
      patch({ panel: "padding", edit: { side: "left", value: 17 } }, family),
    ).toEqual({ [family === "line" ? "line" : "bar"]: { padding: { left: 17 } } });
  });
  it.each([
    "title",
    "subtitle",
    "horizontalAxisTitle",
    "verticalAxisTitle",
  ] as const)("maps all %s caption leaves and paired typography", (caption) => {
    const events = {
      enabled: false,
      text: "Revenue",
      font: "Arial",
      weight: "predefined",
      color: "rgba(1,2,3,.5)",
      size: 19,
      spacing: 9,
    };
    for (const [field, value] of Object.entries(events)) {
      const event = {
        panel: "titles",
        edit: { caption, field, value },
        font,
        axisBinding: binding,
      } as ApplicationEditorEvent;
      const leaf =
        field === "font"
          ? { fontFamily: value }
          : field === "size"
            ? { fontSize: value }
            : field === "weight"
              ? font.predefined
              : { [field]: value };
      expect(patch(event)).toEqual({
        bar: caption.includes("Axis")
          ? { axes: { time: { bottom: { title: leaf }, top: { title: leaf } } } }
          : { [caption]: leaf },
      });
    }
  });
  it.each([
    ["font", "Courier", { item: { label: { fontFamily: "Courier" } } }],
    [
      "weight",
      "boldItalic",
      { item: { label: { fontWeight: "bold", fontStyle: "italic" } } },
    ],
    ["color", "#abc", { item: { label: { color: "#abc" } } }],
    ["size", 17, { item: { label: { fontSize: 17 } } }],
    ["position", "right", { position: "right" }],
    ["enabled", false, { enabled: false }],
    ["spacing", 9, { spacing: 9 }],
    ["markerSize", 8, { item: { marker: { size: 8 } } }],
    ["markerStroke", 2, { item: { marker: { strokeWidth: 2 } } }],
    ["itemSpacing", 3, { item: { marker: { padding: 3 } } }],
    ["horizontalSpacing", 4, { item: { paddingX: 4 } }],
    ["verticalSpacing", 5, { item: { paddingY: 5 } }],
  ])("maps legend %s", (field, value, expected) => {
    expect(
      patch({
        panel: "legend",
        edit: { field, value },
        font,
      } as ApplicationEditorEvent),
    ).toEqual({ bar: { legend: expected } });
  });
  it("preserves paired positions and grid companion style", () => {
    expect(
      patch({
        panel: "grid",
        binding,
        firstStyle: { stroke: "red", lineDash: [3, 4] },
        edit: { field: "color", value: "blue" },
      }),
    ).toEqual({
      bar: {
        axes: {
          time: {
            bottom: { gridLine: { style: [{ stroke: "blue", lineDash: [3, 4] }] } },
            top: { gridLine: { style: [{ stroke: "blue", lineDash: [3, 4] }] } },
          },
        },
      },
    });
    expect(
      patch({
        panel: "axis",
        binding: { axis: "number", direction: "y", optionType: "number" },
        edit: { field: "thickness", value: 0 },
      }),
    ).toEqual({
      bar: {
        axes: {
          number: {
            left: { line: { enabled: false, width: 0 } },
            right: { line: { enabled: false, width: 0 } },
          },
        },
      },
    });
  });
  it("auto rotation preserves original undefined writes and manual restoration", () => {
    for (const value of [true, false]) {
      const result = patch({
        panel: "axisLabels",
        binding,
        font,
        manualRotation: -30,
        edit: { field: "autoRotate", value },
      });
      expect(result).toEqual({
        bar: {
          axes: {
            time: {
              bottom: {
                label: { autoRotate: value, rotation: value ? undefined : -30 },
              },
              top: { label: { autoRotate: value, rotation: value ? undefined : -30 } },
            },
          },
        },
      });
    }
  });
  it.each([
    null,
    { panel: "padding", edit: { side: "__proto__", value: 4 } },
    { panel: "series", edit: { field: "strokeOpacity", value: 1.1 } },
    { panel: "series", edit: { field: "strokeWidth", value: Number.NaN } },
    { panel: "axis", binding, edit: { field: "position", value: "top" } },
    { panel: "tooltips", edit: { field: "mode", value: "invented" } },
  ])("rejects malformed or unbounded runtime values", (event) => {
    expect(
      mapApplicationEditorEvent(event as ApplicationEditorEvent, "line").valid,
    ).toBe(false);
  });
  it("does not invoke accessors or accept hidden extra payloads", () => {
    let called = false;
    const input = {
      panel: "padding",
      get edit() {
        called = true;
        return { side: "top", value: 1 };
      },
    };
    expect(mapApplicationEditorEvent(input as never, "line").valid).toBe(false);
    expect(called).toBe(false);
    expect(
      mapApplicationEditorEvent(
        { panel: "connectMissingData", value: true, options: {} } as never,
        "line",
      ).valid,
    ).toBe(false);
  });
  it("rejects coercion hooks and accessors nested in grid contexts without invoking them", () => {
    let called = false;
    const coercion = {
      toString() {
        called = true;
        return "grid";
      },
    };
    expect(mapApplicationEditorEvent({ panel: coercion } as never, "line").valid).toBe(
      false,
    );
    const lineDash: number[] = [];
    Object.defineProperty(lineDash, "0", {
      enumerable: true,
      get() {
        called = true;
        return 2;
      },
    });
    expect(
      mapApplicationEditorEvent(
        {
          panel: "grid",
          binding,
          firstStyle: { stroke: "red", lineDash },
          edit: { field: "color", value: "blue" },
        },
        "line",
      ).valid,
    ).toBe(false);
    expect(called).toBe(false);
  });
});
describe("latest effective editor selection", () => {
  it("hydrates all controlled values without mutating the source", () => {
    const input = bindingSelection();
    const result = selectApplicationEditorState(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.titles.value.title.text).toBe("Retained title");
    expect(result.value.markers.value).toEqual(input.style.application.series.markers);
    expect(result.value.axes.category.fields.value.type).toBe("category");
    expect(result.value.axes.number.fields.value.type).toBe("number");
    expect(result.value.series.controls.map((c) => c.field)).toEqual([
      "strokeWidth",
      "lineDash",
      "strokeOpacity",
      "fillOpacity",
    ]);
  });
  it("rehydrates grid companion values from latest accepted selection", () => {
    const selection = bindingSelection();
    const input = {
      intent: {
        panel: "grid",
        axis: "category",
        edit: { field: "lineDash", value: 8 },
      },
      selection,
      bindings: {
        category: binding,
        number: { axis: "number", direction: "y", optionType: "number" },
      },
      manualRotations: { category: -30, number: undefined },
    } as const;
    const result = rehydrateApplicationEditorEvent(input);
    expect(result.valid).toBe(true);
    if (result.valid)
      expect(result.value).toMatchObject({
        firstStyle: { stroke: "#123456", lineDash: [2, 3] },
        binding,
      });
  });
  it("rejects stale-ineligible fields and cross-axis bindings", () => {
    const selection = bindingSelection();
    const input = {
      intent: { panel: "markers", edit: { field: "size", value: 8 } },
      selection,
      bindings: { category: binding, number: binding },
      manualRotations: { category: undefined, number: undefined },
    } as never;
    expect(rehydrateApplicationEditorEvent(input).valid).toBe(false);
  });
  it("full source menus retain custom typography, case and predefined choices", () => {
    const selection = bindingSelection();
    const metadata = createEditorMetadata(selection.style.application, {
      category: binding,
      number: { axis: "number", direction: "y", optionType: "number" },
    });
    expect(fontChoices("arial, SANS-serif").length).toBe(20);
    expect(metadata.titles.fonts.map((c) => c.value)).toContain(
      "Aria Black, sans-serif",
    );
    expect(metadata.titles.fonts.map((c) => c.value)).toContain("Book Antiqua,  serif");
    expect(metadata.titles.sizes.map((c) => c.value)).toContain(19);
    expect(metadata.titles.weights.map((c) => c.value)).toContain("predefined");
  });
  it("derives original numerical category, grouping and axis predicates", () => {
    const input = {
      family: "line",
      firstDatum: { period: "2025 Q1" },
      dimensionIds: ["period"],
      grouping: false,
      categorySeriesSwitched: false,
      axisTypes: { category: "category", number: "number" },
    } as const;
    const result = deriveEditorEligibility(input);
    expect(result.axes.category.type).toBe(true);
    expect(result.axes.category.autoRotate).toBe(true);
    expect(result.markers).toBe(true);
    expect(result.shadow).toBe(false);
    expect(
      deriveEditorEligibility({ ...input, firstDatum: undefined }).axes.category.type,
    ).toBe(false);
    expect(
      deriveEditorEligibility({ ...input, grouping: true }).axes.category.type,
    ).toBe(false);
    expect(
      deriveEditorEligibility({
        ...input,
        axisTypes: { category: "grouped-category", number: "number" },
      }).axes.category.autoRotate,
    ).toBe(false);
  });
});
