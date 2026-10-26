import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveFunnelAppearance } from "../../../src/components/General/Table/Chart/application/funnelAppearance";
import { projectFunnelEditorState } from "../../../src/components/General/Table/Chart/application/funnelEditor";
import type { FunnelFamily } from "../../../src/components/General/Table/Chart/compatibility/funnelContracts";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";

afterEach(cleanup);
function state(family: FunnelFamily) {
  const result = resolveFunnelAppearance(
    {
      baseline: { stateAddress: "a", chartType: family, model: {}, options: {} },
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
        family,
        fills: ["#112233"],
        strokes: ["#778899"],
        numericLabelColor: "#ffffff",
        stageLabelColor: "#222222",
        dropOffFill: "#aaaaaa",
        dropOffStroke: "#bbbbbb",
      },
    },
    family,
  );
  if (!result.valid) throw Error(result.error);
  return projectFunnelEditorState(result.value);
}
function props(family: FunnelFamily) {
  return {
    kind: "funnel" as const,
    state: state(family),
    open: true,
    activeTab: "setup" as const,
    onOpenChange: vi.fn(),
    onTabChange: vi.fn(),
    onIntent: vi.fn(),
    themeResetKey: "light",
    galleryProps: { groups: [], selectedType: family, onSelect: vi.fn() },
    setupProps: {
      value: {
        categoryId: "stage",
        aggregate: false,
        aggregationMethod: "sum",
        series: [
          { id: "value", label: "Value" },
          { id: "reserve", label: "Reserve" },
        ],
        switchCategorySeries: false,
      },
      categories: [{ value: "stage", label: "Stage" }],
      availableSeries: [
        { value: "value", label: "Value" },
        { value: "reserve", label: "Reserve" },
        { value: "correction", label: "Correction" },
      ],
      aggregationMethods: [{ value: "sum", label: "Sum" }],
      onEdit: vi.fn(),
    },
  };
}
it.each([
  "funnel",
  "coneFunnel",
  "pyramid",
] as const)("composes %s direction in Set Up and independent Customize controls", (family) => {
  const input = props(family);
  const before = structuredClone(input.setupProps.value);
  const view = render(<ApplicationChartEditor {...input} />);
  expect(screen.getByRole("button", { name: "Remove Value" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Remove Reserve" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Switch Category / Series" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Direction" }), {
    target: { value: "horizontal" },
  });
  expect(input.onIntent).toHaveBeenCalledExactlyOnceWith({
    panel: "funnelDirection",
    value: "horizontal",
  });
  expect(input.setupProps.onEdit).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Reserve" }), {
    key: "ArrowUp",
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove Value" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("switch", { name: "Aggregate" }));
  expect(input.setupProps.onEdit.mock.calls.map(([edit]) => edit)).toEqual([
    { kind: "series-order", ids: ["reserve", "value"] },
    { kind: "series-remove", id: "value" },
    { kind: "series-add", id: "correction" },
    { kind: "aggregate", value: true },
  ]);
  view.rerender(<ApplicationChartEditor {...input} activeTab="customize" />);
  expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  fireEvent.click(screen.getByRole("switch", { name: "Labels" }));
  fireEvent.click(screen.getByRole("switch", { name: "Stage Labels" }));
  expect(input.onIntent.mock.calls.slice(1).map(([intent]) => intent)).toEqual([
    { panel: "labels", edit: { field: "enabled", value: false } },
    { panel: "stageLabels", edit: { field: "enabled", value: false } },
  ]);
  expect(!!screen.queryByRole("switch", { name: "Drop-Off" })).toBe(
    family === "funnel",
  );
  expect(!!screen.queryByRole("switch", { name: "Shadow" })).toBe(
    family !== "coneFunnel",
  );
  expect(input.setupProps.value).toEqual(before);
});
it("keeps Add a series reachable for an empty selection", () => {
  const input = props("pyramid");
  input.setupProps.value.series = [];
  render(<ApplicationChartEditor {...input} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), {
    target: { value: "1" },
  });
  expect(input.setupProps.onEdit).toHaveBeenCalledExactlyOnceWith({
    kind: "series-add",
    id: "reserve",
  });
  expect(screen.getByRole("combobox", { name: "Direction" })).toBeTruthy();
});
