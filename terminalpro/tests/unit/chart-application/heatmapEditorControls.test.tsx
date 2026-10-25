import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveHeatmapAppearance } from "../../../src/components/General/Table/Chart/application/heatmapAppearance";
import { projectHeatmapEditorState } from "../../../src/components/General/Table/Chart/application/heatmapEditor";
import { HeatmapAxisEditor } from "../../../src/components/General/Table/Chart/editor/heatmap/HeatmapAxisEditor";
import { HeatmapCustomizeEditor } from "../../../src/components/General/Table/Chart/editor/heatmap/HeatmapCustomizeEditor";

afterEach(cleanup);
function state() {
  const result = resolveHeatmapAppearance({
    baseline: { stateAddress: "a", chartType: "heatmap", model: {}, options: {} },
    generated: {},
    precision: 2,
    theme: {
      name: "selected",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#111111",
        backgroundColor: "#ffffff",
        textColor: "#222222",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#123456"], strokes: ["#654321"] },
    },
    themePaint: {
      colorRange: ["#ffa03a", "#e1cc00", "#459d55"],
      stroke: "#ffffff",
      strokeWidth: 0,
    },
  });
  if (result.valid === false) throw Error(result.error);
  return projectHeatmapEditorState(result.value);
}
it("composes native Heatmap controls with four titles, line fields, labels and corrected preferences", () => {
  const onEdit = vi.fn();
  render(<HeatmapCustomizeEditor state={state()} onEdit={onEdit} />);
  for (const name of ["Chart Style", "Titles", "Series", "Gradient Legend"])
    fireEvent.click(screen.getByRole("button", { name }));
  fireEvent.click(screen.getByRole("switch", { name: "Horizontal Axis Title" }));
  fireEvent.click(screen.getByRole("switch", { name: "Vertical Axis Title" }));
  fireEvent.click(screen.getByRole("switch", { name: "Tooltips" }));
  fireEvent.click(screen.getByRole("switch", { name: "Reverse Direction" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Line Width value" }), {
    target: { value: "5" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Line Opacity value" }), {
    target: { value: "0.4" },
  });
  expect(onEdit.mock.calls.map(([intent]) => intent)).toEqual([
    {
      panel: "titles",
      edit: { caption: "horizontalAxisTitle", field: "enabled", value: true },
    },
    {
      panel: "titles",
      edit: { caption: "verticalAxisTitle", field: "enabled", value: true },
    },
    { panel: "tooltips", edit: { field: "enabled", value: false } },
    { panel: "gradientLegend", edit: { field: "reverseOrder", value: true } },
    { panel: "heatmapLine", edit: { field: "strokeWidth", value: 5 } },
    { panel: "heatmapLine", edit: { field: "strokeOpacity", value: 0.4 } },
  ]);
  expect(screen.getByRole("switch", { name: "Labels" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Legend" })).toBeNull();
});
it.each([
  "x",
  "y",
] as const)("offers category-only %s axis styling with correlated edits", (axis) => {
  const onEdit = vi.fn();
  render(<HeatmapAxisEditor axis={axis} state={state()} onEdit={onEdit} />);
  fireEvent.click(
    screen.getByRole("button", {
      name: axis === "x" ? "Horizontal Axis" : "Vertical Axis",
    }),
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "Thickness value" }), {
    target: { value: "7" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Ticks" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Auto Rotate" }));
  expect(onEdit.mock.calls.map(([intent]) => intent)).toEqual([
    { panel: "heatmapAxis", axis, edit: { field: "thickness", value: 7 } },
    { panel: "heatmapTicks", axis, edit: { field: "enabled", value: true } },
    { panel: "heatmapAxisLabels", axis, edit: { field: "autoRotate", value: false } },
  ]);
  for (const name of ["Axis Type", "Time Format", "Position"])
    expect(screen.queryByRole("combobox", { name })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Grid Lines" })).toBeNull();
});

it("exposes both axis sections in the composed editor and keeps their edit targets distinct", () => {
  const onEdit = vi.fn();
  render(<HeatmapCustomizeEditor state={state()} onEdit={onEdit} />);
  expect(
    screen
      .getAllByRole("button")
      .map((button) => button.textContent?.replace("›", "").trim()),
  ).toEqual([
    "Chart Style",
    "Titles",
    "Gradient Legend",
    "Series",
    "Horizontal Axis",
    "Vertical Axis",
  ]);
  for (const [axis, name, thickness] of [
    ["x", "Horizontal Axis", 4],
    ["y", "Vertical Axis", 7],
  ] as const) {
    fireEvent.click(screen.getByRole("button", { name }));
    const section = within(screen.getByRole("region", { name }));
    fireEvent.change(section.getByRole("spinbutton", { name: "Thickness value" }), {
      target: { value: String(thickness) },
    });
    fireEvent.click(section.getByRole("switch", { name: "Ticks" }));
    expect(onEdit.mock.calls.slice(-2).map(([intent]) => intent)).toEqual([
      { panel: "heatmapAxis", axis, edit: { field: "thickness", value: thickness } },
      { panel: "heatmapTicks", axis, edit: { field: "enabled", value: true } },
    ]);
  }
});
