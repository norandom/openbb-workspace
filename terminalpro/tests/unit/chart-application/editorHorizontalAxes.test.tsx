import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApplicationCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationCustomizeEditor";
import { selectApplicationEditorState, rehydrateApplicationEditorEvent, mapApplicationEditorEvent } from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import { createEditorMetadata } from "../../../src/components/General/Table/Chart/compatibility/editorBindings/metadata";
import { bindingSelection } from "./editorBindingFixture";

const bindings = {
  category: { axis: "category", direction: "y", optionType: "time" },
  number: { axis: "number", direction: "x", optionType: "number" },
} as const;
function selection(family: "groupedBar" | "stackedBar" | "groupedColumn" = "groupedBar") {
  const input = bindingSelection();
  const original = input.style.application;
  const application = { ...original, axes: {
    category: { ...original.axes.category, title: { ...original.axes.category.title, text: "Periods", size: 41, spacing: 175 } },
    number: { ...original.axes.number, title: { ...original.axes.number.title, text: "Revenue", size: 43, spacing: 180 } },
  } };
  return { ...input, family, style: { ...input.style, application }, metadata: createEditorMetadata(application, bindings) };
}
afterEach(cleanup);
describe("physical horizontal-bar editor axes", () => {
  it.each(["groupedBar", "stackedBar"] as const)("selects %s titles and typography from concrete directions", (family) => {
    const input = selection(family);
    const result = selectApplicationEditorState(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.value.titles.value.horizontalAxisTitle.text).toBe("Revenue");
    expect(result.value.titles.value.verticalAxisTitle.text).toBe("Periods");
    expect(result.value.titles.optionsByCaption?.horizontalAxisTitle.spacingBounds.max).toBe(180);
    expect(result.value.titles.optionsByCaption?.verticalAxisTitle.sizes.map(c => c.value)).toContain(41);
  });
  it("renders Horizontal before Vertical with semantic events and category-only controls", () => {
    const result = selectApplicationEditorState(selection());
    if (!result.valid) throw new Error(result.error);
    const onIntent = vi.fn();
    const onAxisStructure = vi.fn();
    render(<ApplicationCustomizeEditor state={result.value} onIntent={onIntent} onAxisStructure={onAxisStructure} />);
    const headings = screen.getAllByRole("button").map(button => button.textContent);
    expect(headings.findIndex(text => text?.includes("Horizontal Axis"))).toBeLessThan(headings.findIndex(text => text?.includes("Vertical Axis")));
    fireEvent.click(screen.getByRole("button", { name: "Horizontal Axis" }));
    fireEvent.click(screen.getByRole("button", { name: "Vertical Axis" }));
    const horizontal = within(screen.getByRole("region", { name: "Horizontal Axis" }));
    const vertical = within(screen.getByRole("region", { name: "Vertical Axis" }));
    expect(horizontal.queryByLabelText("Axis Type")).toBeNull();
    expect(vertical.getByLabelText("Axis Type")).toBeTruthy();
    fireEvent.change(horizontal.getAllByLabelText("Thickness value")[0], { target: { value: "4" } });
    expect(onIntent).toHaveBeenCalledWith({ panel: "axis", axis: "number", edit: { field: "thickness", value: 4 } });
  });
  it("uses latest concrete direction after returning to columns, regardless of stale selection metadata", () => {
    const input = selection();
    const latest = {
      category: { axis: "category", direction: "x", optionType: "time" },
      number: { axis: "number", direction: "y", optionType: "number" },
    } as const;
    const event = rehydrateApplicationEditorEvent({ selection: input, bindings: latest, manualRotations: { category: undefined, number: undefined }, intent: { panel: "titles", edit: { caption: "horizontalAxisTitle", field: "text", value: "Latest period" } } });
    expect(event).toMatchObject({ valid: true, value: { axisBinding: latest.category } });
  });
  it("keeps semantic axis edits on the latest option type and physical position pair", () => {
    const input = selection();
    const event = rehydrateApplicationEditorEvent({ selection: input, bindings, manualRotations: { category: -30, number: undefined }, intent: { panel: "grid", axis: "category", edit: { field: "lineDash", value: 9 } } });
    if (!event.valid) throw new Error(event.error);
    const leaf = { gridLine: { style: [{ stroke: "#123456", lineDash: [9] }] } };
    expect(mapApplicationEditorEvent(event.value, input.family)).toEqual({ valid: true, value: { bar: { axes: { time: { left: leaf, right: leaf } } } } });
  });
  it.each(["horizontalAxisTitle", "verticalAxisTitle"] as const)("rehydrates stale %s intent using latest binding and typography", caption => {
    const input = selection();
    const event = rehydrateApplicationEditorEvent({ selection: input, bindings, manualRotations: { category: undefined, number: undefined }, intent: { panel: "titles", edit: { caption, field: "text", value: "Latest" } } });
    expect(event.valid).toBe(true);
    if (!event.valid) return;
    const type = caption === "horizontalAxisTitle" ? "number" : "time";
    const positions = caption === "horizontalAxisTitle" ? ["bottom", "top"] : ["left", "right"];
    expect(mapApplicationEditorEvent(event.value, input.family)).toEqual({ valid: true, value: { bar: { axes: { [type]: Object.fromEntries(positions.map(position => [position, { title: { text: "Latest" } }])) } } } });
  });
});
