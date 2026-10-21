import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { selectBoxPlotSession } from "../../../src/components/General/Table/Chart/application/boxPlotSessionSelection";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { sessionFixture } from "./applicationSessionFixture";

afterEach(cleanup);
function props() {
  const source = { ...sessionFixture() };
  source.capture = {
    ...source.capture,
    rows: source.capture.rows.map((row) => ({
      ...row,
      boxPlotAggregationKey: String(row.category),
    })),
  };
  const selected = selectBoxPlotSession(
    {},
    {
      ...source,
      inputs: { ...source.inputs, family: "boxPlot" },
      local: {
        ...source.local,
        baseline: {
          ...source.local.baseline,
          chartType: "boxPlot",
          options: {
            "box-plot": {
              series: {
                whisker: { strokeWidth: 17, lineDash: [44, 2], lineDashOffset: -3 },
              },
            },
          },
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
    galleryProps: { groups: [], selectedType: "boxPlot", onSelect: vi.fn() },
    state: selected.editor,
    mode: {
      kind: "boxPlot" as const,
      controls: selected.boxPlot.controls,
      onEdit: vi.fn(),
    },
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
it("renders all original whisker/cap controls with saved bounds and emits their edits", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.click(screen.getByRole("button", { name: "Whisker" }));
  fireEvent.click(screen.getByRole("button", { name: "Cap" }));
  const whiskers = within(screen.getByRole("region", { name: "Whisker" }));
  expect(
    whiskers
      .getByRole("spinbutton", { name: "Stroke Width value" })
      .getAttribute("value"),
  ).toBe("17");
  for (const [label, field, value] of [
    ["Stroke Width", "strokeWidth", 16],
    ["Line Opacity", "strokeOpacity", 0.3],
    ["Line Dash", "lineDash", 42],
    ["Line Dash Offset", "lineDashOffset", -2],
  ] as const) {
    fireEvent.change(whiskers.getByLabelText(`${label} value`), {
      target: { value: String(value) },
    });
    expect(input.mode.onEdit).toHaveBeenLastCalledWith({
      kind: "whisker",
      field,
      value: field === "lineDash" ? [value] : value,
    });
  }
  fireEvent.change(whiskers.getByRole("textbox", { name: "Color" }), {
    target: { value: "#ff0000" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({
    kind: "whisker",
    field: "stroke",
    value: "#ff0000",
  });
  fireEvent.change(screen.getByLabelText("Length Ratio value"), {
    target: { value: "0.7" },
  });
  expect(input.mode.onEdit).toHaveBeenLastCalledWith({ kind: "cap", value: 0.7 });
  for (const name of ["Labels", "Markers", "Shadow", "Connect Missing Data"])
    expect(screen.queryByRole("switch", { name })).toBeNull();
  const series = within(screen.getByRole("region", { name: "Series" }));
  expect(series.getAllByRole("spinbutton", { name: "Line Dash value" })).toHaveLength(
    2,
  );
});
it("retains captions, legend, chart chrome, axis labels/grid while excluding source-ineligible structures", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} />);
  for (const name of [
    "Titles",
    "Legend",
    "Chart Style",
    "Horizontal Axis",
    "Vertical Axis",
  ])
    fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.getByRole("switch", { name: "Horizontal Axis Title" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Vertical Axis Title" })).toBeTruthy();
  expect(screen.queryByLabelText("Axis Type")).toBeNull();
  expect(screen.queryByRole("switch", { name: "Ticks" })).toBeNull();
  expect(screen.getAllByRole("switch", { name: "Grid Lines" })).toHaveLength(2);
});
it("places Direction in Setup and excludes inversion while preserving category and source setup", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} activeTab="setup" />);
  expect(screen.queryByRole("switch", { name: "Switch Category / Series" })).toBeNull();
  expect(screen.getByRole("combobox", { name: "Category" })).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
    target: { value: "horizontal" },
  });
  expect(input.mode.onEdit).toHaveBeenCalledWith({
    kind: "direction",
    value: "horizontal",
  });
});
