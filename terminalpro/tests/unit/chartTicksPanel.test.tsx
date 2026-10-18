import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartTicksPanel } from "../../src/components/General/Table/Chart/editor/axis/ChartTicksPanel";

afterEach(cleanup);
const initial = { enabled: true, color: "#00000080", width: 5, length: 3 };
it("renders Ticks then Color, Width and Length without mount edits", () => {
  const onEdit = vi.fn();
  const { container } = render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  expect(screen.getByRole("switch", { name: "Ticks" }).getAttribute("aria-checked")).toBe("true");
  expect(Array.from(container.querySelectorAll('input[type="number"]')).map((input) => input.getAttribute("aria-label"))).toEqual(["Width value", "Length value"]);
  expect(screen.getByLabelText("Color").compareDocumentPosition(screen.getByRole("spinbutton", { name: "Width value" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByLabelText(/opacity/i)).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
it("edits only enabled and restores all caller values after hiding", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("switch", { name: "Ticks" }));
  expect(onEdit.mock.calls).toEqual([[{ field: "enabled", value: false }]]);
  rerender(<ChartTicksPanel showLength={true} value={{ ...initial, enabled: false }} onEdit={onEdit} />);
  expect(screen.queryByLabelText("Color")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Ticks" }));
  expect(onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: true });
  rerender(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.color);
  expect((screen.getByRole("spinbutton", { name: "Length value" }) as HTMLInputElement).value).toBe("3");
  expect(onEdit).toHaveBeenCalledTimes(2);
});
it("supplies original numeric bounds and expands maxima for retained values", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  for (const [label, min, max] of [["Width", "0", "10"], ["Length", "0", "30"]]) {
    const number = screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement;
    expect([number.min, number.max, number.step]).toEqual([min, max, "any"]);
  }
  for (const range of screen.getAllByRole("slider")) expect((range as HTMLInputElement).step).toBe("1");
  rerender(<ChartTicksPanel showLength={true} value={{ ...initial, width: 30, length: 38 }} onEdit={onEdit} />);
  for (const [label, max] of [["Width", "30"], ["Length", "38"]]) {
    expect((screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement).max).toBe(max);
  }
  expect(onEdit).not.toHaveBeenCalled();
});
it("emits exact numeric fields, retaining invalid drafts until correction", () => {
  const onEdit = vi.fn();
  render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  const width = screen.getByRole("spinbutton", { name: "Width value" }) as HTMLInputElement;
  for (const value of ["", "-1", "11"]) {
    fireEvent.change(width, { target: { value } });
    expect(width.value).toBe(value);
    expect(width.getAttribute("aria-invalid")).toBe("true");
  }
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(width, { target: { value: "2.5" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Length value" }), { target: { value: "7.5" } });
  fireEvent.change(screen.getByRole("slider", { name: "Length" }), { target: { value: "4" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "width", value: 2.5 }], [{ field: "length", value: 7.5 }], [{ field: "length", value: 4 }]]);
});
it("reuses alpha color correction and picker focus without incidental edits", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  const color = screen.getByLabelText("Color") as HTMLInputElement;
  fireEvent.change(color, { target: { value: "#12" } });
  expect(color.value).toBe("#12");
  expect(color.getAttribute("aria-invalid")).toBe("true");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(color, { target: { value: "rgba(10, 20, 30, 0.25)" } });
  expect(onEdit).toHaveBeenLastCalledWith({ field: "color", value: "rgba(10, 20, 30, 0.25)" });
  rerender(<ChartTicksPanel showLength={true} value={{ ...initial, color: "#12345678" }} onEdit={onEdit} />);
  expect(color.value).toBe("#12345678");
  const opener = screen.getByRole("button", { name: "Choose color" });
  for (const key of ["Escape", "Enter"]) {
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByLabelText("Picker color"), { key });
    expect(screen.queryByLabelText("Picker color")).toBeNull();
    expect(document.activeElement).toBe(opener);
  }
  expect(onEdit).toHaveBeenCalledTimes(1);
});
it("hides Length without an edit and restores the caller's accepted value", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  rerender(<ChartTicksPanel showLength={false} value={initial} onEdit={onEdit} />);
  expect(screen.queryByLabelText("Length value")).toBeNull();
  expect(screen.queryByLabelText("Length")).toBeNull();
  expect(screen.getByLabelText("Width value")).toBeTruthy();
  rerender(<ChartTicksPanel showLength={true} value={initial} onEdit={onEdit} />);
  expect((screen.getByLabelText("Length value") as HTMLInputElement).value).toBe("3");
  expect(onEdit).not.toHaveBeenCalled();
});