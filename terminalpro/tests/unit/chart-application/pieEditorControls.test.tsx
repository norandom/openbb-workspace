import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { selectPieSession } from "../../../src/components/General/Table/Chart/application/pieSessionSelection";
import { sessionFixture } from "./applicationSessionFixture";
afterEach(cleanup);
function props(family: "pie" | "donut" = "pie") {
  const source = sessionFixture();
  const selected = selectPieSession({}, { ...source, inputs: { ...source.inputs, family },
    local: { ...source.local, baseline: { ...source.local.baseline, chartType: family } } });
  return { open: true, onOpenChange: vi.fn(), activeTab: "customize" as const, onTabChange: vi.fn(), themeResetKey: "light",
    galleryProps: { groups: [], selectedType: family, onSelect: vi.fn() }, state: selected.editor, mode: { kind: "pie" as const, canSwitchCategorySeries: family === "donut" },
    onIntent: vi.fn(), onAxisStructure: vi.fn(), setupProps: { value: { categoryId: "period", aggregate: false,
      aggregationMethod: "sum", switchCategorySeries: false, series: [{ id: "revenue", label: "Revenue" }] },
      categories: [{ value: "period", label: "Period" }], availableSeries: [], aggregationMethods: [], onEdit: vi.fn() } };
}
it("renders original independent labels and common controls without axes, markers or dash", () => {
  const input = props();
  render(<ApplicationChartEditor {...input} />);
  expect(screen.queryByRole("button", { name: "Horizontal Axis" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Vertical Axis" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Titles" }));
  expect(screen.getByRole("switch", { name: "Chart Title" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Horizontal Axis Title" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  expect(screen.getByRole("switch", { name: "Callout Labels" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Sector Labels" })).toBeTruthy();
  expect(screen.getByRole("spinbutton", { name: "Position Ratio value" })).toBeTruthy();
  expect(screen.queryByRole("spinbutton", { name: "Line Dash value" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Labels", exact: true } as any)).toBeNull();
  expect(screen.queryByRole("switch", { name: "Markers" })).toBeNull();
  expect(screen.queryByText("Connect Missing Data")).toBeNull();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Length value" }), { target: { value: "17" } });
  expect(input.onIntent).toHaveBeenLastCalledWith({ panel: "pieCallout", edit: { field: "length", value: 17 } });
});
it.each(["pie", "donut"] as const)("shows transpose only for donut (%s)", family => {
  render(<ApplicationChartEditor {...props(family)} activeTab="setup" />);
  expect(Boolean(screen.queryByRole("switch", { name: "Switch Category / Series" }))).toBe(family === "donut");
});
