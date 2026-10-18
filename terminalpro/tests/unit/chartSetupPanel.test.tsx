import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ChartSetupPanel, type ChartSetupState } from "../../src/components/General/Table/Chart/editor/setup/ChartSetupPanel";

afterEach(cleanup);
it("offers an unselected stable ID with the original add placeholder", () => {
  const p = props();
  render(<ChartSetupPanel {...p} availableSeries={[{ value: "a", label: "Revenue" }, { value: "d", label: "Revenue" }]} />);
  const select = screen.getByRole("combobox", { name: "Add a series" });
  expect(select.querySelectorAll("option")).toHaveLength(2);
  fireEvent.change(select, { target: { value: "0" } });
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-add", id: "d" });
  expect((select as HTMLSelectElement).value).toBe("");
});
it("keeps an empty stable ID distinct from the add placeholder", () => {
  const p = props();
  render(<ChartSetupPanel {...p} availableSeries={[{ value: "", label: "Empty ID" }]} />);
  fireEvent.change(screen.getByRole("combobox", { name: "Add a series" }), { target: { value: "0" } });
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-add", id: "" });
});
const value: ChartSetupState = { categoryId: "period", aggregate: true, aggregationMethod: "sum", series: [{ id: "a", label: "Revenue" }, { id: "b", label: "Revenue" }, { id: "c", label: "Margin" }], switchCategorySeries: false };
function props(current = value) { return { value: current, categories: [{ value: "period", label: "Period" }, { value: "region", label: "Region" }], aggregationMethods: [{ value: "sum", label: "Sum" }, { value: "mean", label: "Mean" }], onEdit: vi.fn() }; }
it("emits exact controlled choices and switches without changing supplied state", () => {
  const p = props(); render(<ChartSetupPanel {...p} />);
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "region" } });
  fireEvent.change(screen.getByLabelText("Aggregation method"), { target: { value: "mean" } });
  fireEvent.click(screen.getByRole("switch", { name: "Aggregate" }));
  fireEvent.click(screen.getByRole("switch", { name: "Switch Category / Series" }));
  expect(p.onEdit.mock.calls.map(([edit]) => edit)).toEqual([{ kind: "category", value: "region" }, { kind: "aggregation-method", value: "mean" }, { kind: "aggregate", value: false }, { kind: "switch-category-series", value: true }]);
  expect((screen.getByLabelText("Category") as HTMLSelectElement).value).toBe("period");
});
it("retains unknown choices and hidden aggregation through collapse and controlled updates", () => {
  const current = { ...value, categoryId: "unknown-category", aggregationMethod: "unknown-method" };
  const p = props(current); const { rerender } = render(<ChartSetupPanel {...p} />);
  expect(screen.getByRole("option", { name: "unknown-category" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "unknown-method" })).toBeTruthy();
  rerender(<ChartSetupPanel {...p} value={{ ...current, aggregate: false }} />);
  expect(screen.queryByLabelText("Aggregation method")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
  expect(screen.queryByLabelText("Category")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Categories" }));
  rerender(<ChartSetupPanel {...p} />);
  expect((screen.getByLabelText("Aggregation method") as HTMLSelectElement).value).toBe("unknown-method");
  expect(p.onEdit).not.toHaveBeenCalled();
});
it("removes exact duplicate-label identity and keeps chips caller-controlled", () => {
  const p = props(); render(<ChartSetupPanel {...p} />);
  fireEvent.click(screen.getAllByRole("button", { name: "Remove Revenue" })[1]);
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-remove", id: "b" });
  expect(screen.getAllByRole("button", { name: "Remove Revenue" })).toHaveLength(2);
  expect(screen.queryByRole("checkbox")).toBeNull();
});
it("reorders from the focused grip with exact IDs and respects boundaries", async () => {
  const p = props(); render(<ChartSetupPanel {...p} />);
  const grips = screen.getAllByRole("button", { name: "Reorder Revenue" });
  grips[1].focus(); await userEvent.setup().keyboard("{ArrowUp}");
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-order", ids: ["b", "a", "c"] });
  expect(document.activeElement).toBe(grips[1]);
  p.onEdit.mockClear(); grips[0].focus(); await userEvent.setup().keyboard("{ArrowUp}");
  expect(p.onEdit).not.toHaveBeenCalled();
});
it("distinguishes missing or cancelled drag sources from valid empty-string IDs", () => {
  const p = props({ ...value, series: [{ id: "", label: "Empty ID" }, { id: "b", label: "B" }] });
  render(<ChartSetupPanel {...p} />);
  const source = screen.getByRole("button", { name: "Reorder Empty ID" });
  const target = screen.getByRole("button", { name: "Reorder B" });
  const transfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.dragEnd(source);
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.dragStart(source, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-order", ids: ["b", ""] });
});
it("dragging preserves every current ID and ignores stale or cancelled sources", () => {
  const p = props(); const { rerender } = render(<ChartSetupPanel {...p} />);
  const transfer = { setData: vi.fn(), getData: () => "external", effectAllowed: "", dropEffect: "" };
  fireEvent.drop(screen.getByRole("button", { name: "Reorder Margin" }), { dataTransfer: transfer });
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.dragStart(screen.getAllByRole("button", { name: "Reorder Revenue" })[0], { dataTransfer: transfer });
  fireEvent.drop(screen.getByRole("button", { name: "Reorder Margin" }), { dataTransfer: transfer });
  expect(p.onEdit).toHaveBeenCalledExactlyOnceWith({ kind: "series-order", ids: ["b", "c", "a"] });
  p.onEdit.mockClear();
  fireEvent.dragStart(screen.getAllByRole("button", { name: "Reorder Revenue" })[0], { dataTransfer: transfer });
  rerender(<ChartSetupPanel {...p} value={{ ...value, series: value.series.slice(1) }} />);
  fireEvent.drop(screen.getByRole("button", { name: "Reorder Margin" }), { dataTransfer: transfer });
  expect(p.onEdit).not.toHaveBeenCalled();
});
it("uses the original category and series headings when inverted", () => {
  render(<ChartSetupPanel {...props({ ...value, switchCategorySeries: true })} />);
  expect(screen.getByRole("button", { name: "Category Values" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Series Labels" })).toBeTruthy();
});
it("omits aggregation controls only for the original default category", () => {
  render(<ChartSetupPanel {...props({ ...value, categoryId: "AG-GRID-DEFAULT-CATEGORY" })} />);
  expect(screen.queryByRole("switch", { name: "Aggregate" })).toBeNull();
  expect(screen.queryByLabelText("Aggregation method")).toBeNull();
  expect(screen.getByRole("switch", { name: "Switch Category / Series" })).toBeTruthy();
});
