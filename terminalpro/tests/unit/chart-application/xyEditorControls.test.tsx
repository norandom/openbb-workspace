import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { selectXySession } from "../../../src/components/General/Table/Chart/application/xySessionSelection";
import { sessionFixture } from "./applicationSessionFixture";
afterEach(cleanup);
it("keeps original setup controls and exposes XY top-level point edits", () => {
  const source = sessionFixture();
  const context = { ...source, inputs: { ...source.inputs, family: "bubble" as const },
    local: { ...source.local, baseline: { ...source.local.baseline, chartType: "bubble" } } };
  const selected = selectXySession({}, context);
  const onEdit = vi.fn(), onSetup = vi.fn();
  const props: any = {
    open: true, onOpenChange: vi.fn(), activeTab: "setup", onTabChange: vi.fn(),
    themeResetKey: "light", galleryProps: { groups: [], onSelect: vi.fn() },
    state: selected.editor, mode: { kind: "xy", ...selected.xy, onEdit },
    onIntent: vi.fn(), onAxisStructure: vi.fn(),
    setupProps: { value: { categoryId: "period", aggregate: false, aggregationMethod: "sum",
      series: [{ id: "revenue", label: "Revenue" }, { id: "income", label: "Income" }],
      switchCategorySeries: false }, categories: [{ value: "period", label: "Period" }],
      availableSeries: [], aggregationMethods: [{ value: "sum", label: "Sum" }], onEdit: onSetup },
  };
  const view = render(<ApplicationChartEditor {...props} />);
  expect(screen.getByRole("combobox", { name: "Labels" })).toBeTruthy();
  expect(screen.getByText("X Y Values")).toBeTruthy();
  expect(screen.getByText("(X)")).toBeTruthy();
  expect(screen.queryByText("Switch Category / Series")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Paired Mode" }));
  expect(onEdit).toHaveBeenLastCalledWith({ kind: "paired", value: false });
  fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Income" }), { key: "ArrowUp" });
  expect(onSetup).toHaveBeenLastCalledWith({ kind: "series-order", ids: ["income", "revenue"] });
  view.rerender(<ApplicationChartEditor {...props} activeTab="customize" />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  expect(screen.getByRole("combobox", { name: "Shape" })).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Min Size value" }), { target: { value: "15" } });
  expect(onEdit).toHaveBeenLastCalledWith({ kind: "size", value: 15 });
  expect(screen.getByRole("spinbutton", { name: "Max Size value" })).toBeTruthy();
  expect(screen.queryByText("Connect Missing Data")).toBeNull();
});
