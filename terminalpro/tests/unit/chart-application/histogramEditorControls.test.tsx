import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ApplicationChartEditor } from "../../../src/components/General/Table/Chart/editor/ApplicationChartEditor";
import { selectHistogramSession } from "../../../src/components/General/Table/Chart/application/histogramSessionSelection";
import { HistogramBinControls } from "../../../src/components/General/Table/Chart/editor/histogram/HistogramBinControls";
import { sessionFixture } from "./applicationSessionFixture";
afterEach(cleanup);
it("keeps original controls, exact bin naming, fractional input and stamped display precedence", () => {
  const source = sessionFixture();
  const context = { ...source, inputs: { ...source.inputs, family: "histogram" as const },
    local: { ...source.local, baseline: { ...source.local.baseline, chartType: "histogram" } } };
  const selected = selectHistogramSession({}, context);
  const onEdit = vi.fn(), onIntent = vi.fn();
  const props: any = {
    open: true, onOpenChange: vi.fn(), activeTab: "setup", onTabChange: vi.fn(),
    themeResetKey: "light", galleryProps: { groups: [], onSelect: vi.fn() },
    state: selected.editor, mode: { kind: "histogram", binCount: 2, revision: 1, style: selected.histogram.style, onEdit },
    onIntent, onAxisStructure: vi.fn(),
    setupProps: { value: { categoryId: "period", aggregate: false, aggregationMethod: "sum",
      series: [{ id: "revenue", label: "Revenue" }], switchCategorySeries: false },
      categories: [{ value: "period", label: "Period" }], availableSeries: [],
      aggregationMethods: [{ value: "sum", label: "Sum" }], onEdit: vi.fn() },
  };
  const view = render(<ApplicationChartEditor {...props} />);
  expect(screen.queryByText("Switch Category / Series")).toBeNull();
  expect(screen.queryByText("Paired Mode")).toBeNull();
  view.rerender(<ApplicationChartEditor {...props} activeTab="customize" />);
  fireEvent.click(screen.getByRole("button", { name: "Series" }));
  const count = screen.getByRole("spinbutton", { name: "Bin count value" }) as HTMLInputElement;
  expect(screen.getByText("Bin count")).toBeTruthy();
  expect([count.value, count.min, count.max, count.step]).toEqual(["2", "0", "20", "any"]);
  fireEvent.change(count, { target: { value: "4.5" } });
  expect(onEdit).toHaveBeenLastCalledWith({ kind: "binCount", value: 4.5 });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Stroke Width value" }), { target: { value: "3" } });
  expect(onIntent).toHaveBeenLastCalledWith({ panel: "series", edit: { field: "strokeWidth", value: 3 } });
  expect(screen.getByRole("switch", { name: "Shadow" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Labels" })).toBeTruthy();
  expect(screen.queryByText("Connect Missing Data")).toBeNull();
  expect(screen.queryByRole("combobox", { name: "Shape" })).toBeNull();
  view.rerender(<ApplicationChartEditor {...props} activeTab="customize" mode={{ ...props.mode, revision: 2 }} />);
  expect((screen.getByRole("spinbutton", { name: "Bin count value" }) as HTMLInputElement).value).toBe("2");
});
it("expands the original numeric maximum to the displayed bin length", () => {
  render(<HistogramBinControls mode={{ kind: "histogram", binCount: 32, revision: 1, style: {} as any, onEdit: vi.fn() }} />);
  expect((screen.getByRole("spinbutton", { name: "Bin count value" }) as HTMLInputElement).max).toBe("32");
});
