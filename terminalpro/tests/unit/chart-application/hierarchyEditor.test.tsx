import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveHierarchyAppearance } from "../../../src/components/General/Table/Chart/application/hierarchyAppearance";
import type { HierarchyAppearanceInput } from "../../../src/components/General/Table/Chart/application/hierarchyAppearanceTypes";
import { projectHierarchyEditorState } from "../../../src/components/General/Table/Chart/application/hierarchyEditorState";
import type { HierarchySetupSelection } from "../../../src/components/General/Table/Chart/application/hierarchyTypes";
import type { SnapshotColumn } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import { HierarchyCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/hierarchy/HierarchyCustomizeEditor";
import { HierarchySetupPanel } from "../../../src/components/General/Table/Chart/editor/hierarchy/HierarchySetupPanel";

afterEach(cleanup);
const columns: readonly SnapshotColumn[] = [
  { id: "AG-GRID-DEFAULT-CATEGORY", label: "(None)", role: "category" },
  { id: "region", label: "Region", role: "category" },
  { id: "desk", label: "Desk", role: "category" },
  { id: "", label: "Empty ID", role: "category" },
  { id: "amount", label: "Amount", role: "number" },
  { id: "rate", label: "Rate", role: "number" },
  { id: "other", label: "Other", role: "number" },
];
const selection: HierarchySetupSelection = {
  categoryIds: ["region", "desk"],
  seriesIds: ["amount", "rate"],
  aggFunc: "avg",
};
function setup(current = selection) {
  return { columns, selection: current, onEdit: vi.fn() };
}
function state(family: "treemap" | "sunburst" = "treemap", color = true) {
  const input: HierarchyAppearanceInput = {
    family,
    baseline: { stateAddress: "hierarchy", chartType: family, model: {}, options: {} },
    generated: {},
    precision: 2,
    assignments: color ? { sizeId: "amount", colorId: "rate" } : {},
    theme: {
      name: "ag-default",
      mode: "light",
      overrides: {},
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#111111",
        chartBackgroundColor: "#ffffff",
      },
      palette: { fills: ["#123456"], strokes: ["#654321"] },
    },
    themePalette: {
      fills: ["#123456"],
      strokes: ["#654321"],
      hierarchyColors: ["#dddddd"],
      secondHierarchyColors: ["#cccccc"],
      colorRange: ["#ff0000", "#0000ff"],
    },
  };
  const result = resolveHierarchyAppearance(input);
  if (!result.valid) throw Error(result.error);
  return projectHierarchyEditorState(result.value, input.assignments);
}
function open(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}
function chip(label: string) {
  return screen.getByRole("button", { name: `Remove ${label}` }).parentElement
    ?.textContent;
}

it("offers only unselected real categories and preserves empty column identity", () => {
  const props = setup();
  render(<HierarchySetupPanel {...props} />);
  const add = screen.getByRole("combobox", { name: "Add a category" });
  expect(within(add).queryByRole("option", { name: "(None)" })).toBeNull();
  expect(within(add).queryByRole("option", { name: "Region" })).toBeNull();
  expect(within(add).queryByRole("option", { name: "Amount" })).toBeNull();
  fireEvent.change(add, { target: { value: "0" } });
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith({
    kind: "category-add",
    id: "",
  });
  expect((add as HTMLSelectElement).value).toBe("");
  expect(screen.queryByRole("switch", { name: "Switch Category / Series" })).toBeNull();
});

it("keeps ordered category chips controlled and supports keyboard reorder and removal", () => {
  const props = setup();
  render(<HierarchySetupPanel {...props} />);
  const desk = screen.getByRole("button", { name: "Reorder Desk" });
  desk.focus();
  fireEvent.keyDown(desk, { key: "ArrowUp" });
  fireEvent.click(screen.getByRole("button", { name: "Remove Region" }));
  expect(props.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
    { kind: "category-order", ids: ["desk", "region"] },
    { kind: "category-remove", id: "region" },
  ]);
  expect(document.activeElement).toBe(desk);
  expect(screen.getByRole("button", { name: "Remove Region" })).toBeTruthy();
  props.onEdit.mockClear();
  fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Region" }), {
    key: "ArrowUp",
  });
  expect(props.onEdit).not.toHaveBeenCalled();
});

it("uses internal drag identity and ignores cancelled and stale sources", () => {
  const props = setup();
  const { rerender } = render(<HierarchySetupPanel {...props} />);
  const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  const source = screen.getByRole("button", { name: "Reorder Region" });
  const target = screen.getByRole("button", { name: "Reorder Desk" });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragEnd(source);
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(props.onEdit).not.toHaveBeenCalled();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith({
    kind: "category-order",
    ids: ["desk", "region"],
  });
  props.onEdit.mockClear();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  rerender(
    <HierarchySetupPanel
      {...props}
      selection={{ ...selection, categoryIds: ["desk"] }}
    />,
  );
  fireEvent.drop(screen.getByRole("button", { name: "Reorder Desk" }), {
    dataTransfer: transfer,
  });
  expect(props.onEdit).not.toHaveBeenCalled();
});

it("omits numeric Add at two fields and updates Size/Color roles only from controlled props", () => {
  const props = setup();
  const { rerender } = render(<HierarchySetupPanel {...props} />);
  expect(screen.queryByRole("combobox", { name: "Add a series" })).toBeNull();
  expect(chip("Amount")).toContain("Amount (Size)");
  expect(chip("Rate")).toContain("Rate (Color)");
  fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Rate" }), {
    key: "ArrowUp",
  });
  expect(props.onEdit).toHaveBeenLastCalledWith({
    kind: "series-order",
    ids: ["rate", "amount"],
  });
  expect(chip("Amount")).toContain("Amount (Size)");
  fireEvent.click(screen.getByRole("button", { name: "Remove Amount" }));
  expect(props.onEdit).toHaveBeenLastCalledWith({
    kind: "series-remove",
    id: "amount",
  });
  rerender(
    <HierarchySetupPanel
      {...props}
      selection={{ ...selection, seriesIds: ["rate"] }}
    />,
  );
  expect(chip("Rate")).toContain("Rate (Size)");
  expect(chip("Rate")).not.toContain("(Color)");
  const add = screen.getByRole("combobox", { name: "Add a series" });
  expect(within(add).queryByRole("option", { name: "Region" })).toBeNull();
  expect(within(add).queryByRole("option", { name: "Rate" })).toBeNull();
  fireEvent.change(add, { target: { value: "0" } });
  expect(props.onEdit).toHaveBeenLastCalledWith({ kind: "series-add", id: "amount" });
});

it("accepts no-size mode and leaves inactive aggregation untouched without categories", () => {
  const props = setup({ categoryIds: [], seriesIds: [], aggFunc: "avg" });
  const { rerender } = render(<HierarchySetupPanel {...props} />);
  expect(screen.queryByRole("switch", { name: "Aggregate" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Aggregation method" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Add a series" })).toBeTruthy();
  expect(props.onEdit).not.toHaveBeenCalled();
  rerender(
    <HierarchySetupPanel
      {...props}
      selection={{ ...props.selection, categoryIds: ["region"] }}
    />,
  );
  expect(
    (screen.getByRole("combobox", { name: "Aggregation method" }) as HTMLSelectElement)
      .value,
  ).toBe("avg");
  fireEvent.change(screen.getByRole("combobox", { name: "Aggregation method" }), {
    target: { value: "count" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Aggregate" }));
  expect(props.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
    { kind: "aggregation-method", value: "count" },
    { kind: "aggregate", value: false },
  ]);
  expect(props.selection.aggFunc).toBe("avg");
});

it("collapses setup groups without emitting edits and enables aggregation explicitly", () => {
  const props = setup({ categoryIds: ["region"], seriesIds: [] });
  render(<HierarchySetupPanel {...props} />);
  expect(screen.queryByRole("combobox", { name: "Aggregation method" })).toBeNull();
  open("Categories");
  expect(screen.queryByRole("combobox", { name: "Add a category" })).toBeNull();
  open("Categories");
  fireEvent.click(screen.getByRole("switch", { name: "Aggregate" }));
  expect(props.onEdit).toHaveBeenCalledExactlyOnceWith({
    kind: "aggregate",
    value: true,
  });
});

it("composes actual common panels and title/subtitle only with accepted edits", () => {
  const onEdit = vi.fn();
  render(<HierarchyCustomizeEditor state={state()} onEdit={onEdit} />);
  open("Chart Style");
  open("Titles");
  open("Series");
  fireEvent.change(screen.getByRole("textbox", { name: "Top value" }), {
    target: { value: "17" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Chart Title" }));
  fireEvent.click(screen.getByRole("switch", { name: "Subtitle" }));
  fireEvent.click(screen.getByRole("switch", { name: "Tooltips" }));
  expect(onEdit.mock.calls.map(([intent]) => intent)).toEqual([
    { panel: "padding", edit: { side: "top", value: 17 } },
    { panel: "titles", edit: { caption: "title", field: "enabled", value: true } },
    { panel: "titles", edit: { caption: "subtitle", field: "enabled", value: true } },
    { panel: "tooltips", edit: { field: "enabled", value: false } },
  ]);
  expect(screen.getByRole("group", { name: "Background" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Horizontal Axis Title" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Legend" })).toBeNull();
  expect(screen.queryByText("Inner Labels")).toBeNull();
});

it("composes Treemap's four spacing controls and continuous legend with correlated edits", () => {
  const onEdit = vi.fn();
  render(<HierarchyCustomizeEditor state={state()} onEdit={onEdit} />);
  open("Series");
  open("Gradient Legend");
  for (const label of [
    "Group Padding",
    "Group Spacing",
    "Tile Padding",
    "Tile Spacing",
  ])
    expect(screen.getByRole("textbox", { name: `${label} value` })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Group Spacing value" }), {
    target: { value: "7" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Position" }), {
    target: { value: "left" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Reverse Direction" }));
  expect(onEdit.mock.calls.map(([intent]) => intent)).toEqual([
    { panel: "hierarchySpacing", edit: { field: "groupGap", value: 7 } },
    { panel: "hierarchyGradientLegend", edit: { field: "position", value: "left" } },
    { panel: "hierarchyGradientLegend", edit: { field: "reverseOrder", value: true } },
  ]);
});

it("keeps Sunburst Series tooltip-only and disables retained gradient preferences without Color", () => {
  const onEdit = vi.fn();
  render(<HierarchyCustomizeEditor state={state("sunburst", false)} onEdit={onEdit} />);
  open("Series");
  open("Gradient Legend");
  expect(screen.queryByRole("group", { name: "Tile Spacing" })).toBeNull();
  expect(screen.getByRole("switch", { name: "Tooltips" })).toBeTruthy();
  const legend = screen.getByRole("group", {
    name: "Gradient Legend",
  }) as HTMLFieldSetElement;
  expect(legend.disabled).toBe(true);
  expect(
    (within(legend).getByRole("combobox", { name: "Position" }) as HTMLSelectElement)
      .value,
  ).toBe("right");
  expect(onEdit).not.toHaveBeenCalled();
});
