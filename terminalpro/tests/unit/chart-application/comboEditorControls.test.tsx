import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import type { ApplicationEditorMode } from "../../../src/components/General/Table/Chart/editor/combo/comboEditorMode";
import { selectApplicationEditorState } from "../../../src/components/General/Table/Chart/compatibility/editorBindings";
import { bindingSelection } from "./editorBindingFixture";
afterEach(cleanup);
function mount(mode?: ApplicationEditorMode, tab: "setup" | "customize" = "setup") {
  const state = selectApplicationEditorState(bindingSelection());
  if (!state.valid) throw new Error(state.error);
  const onEdit = vi.fn();
  const onIntent = vi.fn();
  render(<ApplicationChartEditor open activeTab={tab} onOpenChange={vi.fn()} onTabChange={vi.fn()}
    themeResetKey="test" galleryProps={{ groups: [], selectedType: "customCombo", onSelect: vi.fn() }}
    state={state.value} onIntent={onIntent} onAxisStructure={vi.fn()} mode={mode}
    setupProps={{ value: { categoryId: "period", aggregate: false, aggregationMethod: "sum",
      series: [{ id: "revenue", label: "Revenue" }, { id: "margin", label: "Margin" }], switchCategorySeries: false },
      categories: [{ value: "period", label: "Period" }], aggregationMethods: [], onEdit }} />);
  return { onEdit, onIntent };
}
function combo(): Extract<ApplicationEditorMode, { kind: "combo" }> {
  return { kind: "combo", assignments: [{ colId: "revenue", chartType: "stackedColumn" },
    { colId: "margin", chartType: "line", secondaryAxis: true }], geometry: "line",
    activeGeometries: ["line", "bar", "area"], onAssignment: vi.fn(), onGeometry: vi.fn() };
}
it("composes selected-series assignment controls and preserves keyboard ordering", () => {
  const mode = combo();
  const { onEdit } = mount(mode);
  expect(screen.queryByLabelText("Switch Category / Series")).toBeNull();
  expect(screen.getByLabelText("Revenue Secondary Axis").hasAttribute("disabled")).toBe(true);
  expect(screen.getByLabelText("Margin Secondary Axis").hasAttribute("disabled")).toBe(false);
  expect(within(screen.getByLabelText("Revenue series type")).getAllByRole("option").map(item => item.textContent))
    .toEqual(["Line", "Area", "Stacked Area", "Grouped Column", "Stacked Column"]);
  fireEvent.change(screen.getByLabelText("Revenue series type"), { target: { value: "area" } });
  expect(mode.onAssignment).toHaveBeenCalledWith("revenue", { kind: "type", value: "area" });
  fireEvent.click(screen.getByLabelText("Margin Secondary Axis"));
  expect(mode.onAssignment).toHaveBeenCalledWith("margin", { kind: "secondaryAxis", value: false });
  fireEvent.keyDown(screen.getByLabelText("Reorder Margin"), { key: "ArrowUp" });
  expect(onEdit).toHaveBeenCalledWith({ kind: "series-order", ids: ["margin", "revenue"] });
});
it("composes active geometry selection inside the existing expandable Series group", () => {
  const mode = combo();
  const { onIntent } = mount(mode, "customize");
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  const series = within(screen.getByRole("region", { name: "Series" }));
  expect(series.getAllByRole("option").slice(0, 3).map(item => item.textContent)).toEqual(["Area", "Bar", "Line"]);
  fireEvent.change(series.getByLabelText("Series Type"), { target: { value: "bar" } });
  expect(mode.onGeometry).toHaveBeenCalledWith("bar");
  const thickness = series.getByLabelText("Stroke Width value");
  fireEvent.change(thickness, { target: { value: "4" } });
  expect(onIntent).toHaveBeenCalledWith({ panel: "series", edit: { field: "strokeWidth", value: 4 } });
});
it("retains ordinary inversion and omits combo controls by default", () => {
  mount();
  expect(screen.getByLabelText("Switch Category / Series")).toBeTruthy();
  expect(screen.queryByLabelText("Revenue series type")).toBeNull();
});

it("limits the geometry selector to active geometries while retaining shared controls", () => {
  const mode = combo();
  mode.geometry = "area";
  mode.activeGeometries = ["area", "bar"];
  mount(mode, "customize");
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  const selector = screen.getByLabelText("Series Type");
  expect(within(selector).getAllByRole("option").map(item => item.textContent)).toEqual(["Area", "Bar"]);
  expect(screen.getByLabelText("Stroke Width value")).toBeTruthy();
});
