import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { selectRangeSession } from "../../../src/components/General/Table/Chart/application/rangeSessionSelection";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { sessionFixture } from "./applicationSessionFixture";

afterEach(cleanup);
function props(family: "rangeBar" | "rangeArea") {
  const source = sessionFixture();
  const selected = selectRangeSession(
    {},
    {
      ...source,
      inputs: { ...source.inputs, family },
      local: {
        ...source.local,
        baseline: { ...source.local.baseline, chartType: family },
      },
      capture: {
        ...source.capture,
        rows: source.capture.rows.map((row) => ({
          ...row,
          boxPlotAggregationKey: String(row.category),
        })),
        rangeCategory: {
          categoryColumnId: "period",
          columnChartDataType: "number",
          firstCategoryIsDate: false,
          kind: "number",
        },
      },
    },
  );
  return {
    open: true,
    onOpenChange: vi.fn(),
    activeTab: "customize" as const,
    onTabChange: vi.fn(),
    themeResetKey: "light",
    galleryProps: { groups: [], selectedType: family, onSelect: vi.fn() },
    state: selected.editor,
    mode: { kind: "range" as const, ...selected.rangeEditor, onEdit: vi.fn() },
    onIntent: vi.fn(),
    onAxisStructure: vi.fn(),
    setupProps: {
      value: {
        categoryId: "period",
        aggregate: false,
        aggregationMethod: "sum",
        switchCategorySeries: false,
        series: [{ id: "revenue", label: "Revenue" }],
      },
      categories: [{ value: "period", label: "Period" }],
      aggregationMethods: [],
      onEdit: vi.fn(),
    },
  };
}
it("retains Area series controls and exposes supported interpolation", () => {
  const input = props("rangeArea");
  render(<ApplicationChartEditor {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  for (const name of ["Labels", "Markers", "Shadow", "Connect Missing Data"])
    expect(screen.getByRole("switch", { name })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Interpolation" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Interpolation" }), {
    target: { value: "smooth" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "interpolation",
    value: { type: "smooth", tension: 1 },
  });
  for (const name of [
    "Titles",
    "Legend",
    "Chart Style",
    "Horizontal Axis",
    "Vertical Axis",
  ])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.getAllByRole("switch", { name: "Ticks" })).toHaveLength(2);
  expect(screen.getAllByRole("switch", { name: "Grid Lines" })).toHaveLength(2);
});
it("places Bar direction in Setup and preserves its source selector restrictions", () => {
  const input = props("rangeBar");
  const view = render(<ApplicationChartEditor {...input} activeTab="setup" />);
  expect(screen.queryByRole("switch", { name: "Switch Category / Series" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
    target: { value: "horizontal" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "direction",
    value: "horizontal",
  });
  view.rerender(<ApplicationChartEditor {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.click(screen.getByRole("button", { name: "Label Placement" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Placement" }), {
    target: { value: "outside" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "labelPlacement",
    value: "outside",
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Label Padding value" }), {
    target: { value: "11" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "labelPadding",
    value: 11,
  });
  for (const name of ["Horizontal Axis", "Vertical Axis"])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.queryByLabelText("Axis Type")).toBeNull();
  expect(screen.queryByRole("switch", { name: "Ticks" })).toBeNull();
});
