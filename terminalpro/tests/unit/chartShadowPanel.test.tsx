import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartShadowPanel } from "../../src/components/General/Table/Chart/editor/shadow/ChartShadowPanel";

afterEach(cleanup);
const initial = { enabled: true, color: "#00000080", blur: 5, xOffset: 3, yOffset: -3 };
it("renders Shadow then Color, Blur, X Offset and Y Offset without mount edits", () => {
  const onEdit = vi.fn();
  const { container } = render(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  expect(screen.getByRole("switch", { name: "Shadow" }).getAttribute("aria-checked")).toBe("true");
  expect(Array.from(container.querySelectorAll('input[type="number"]')).map((input) => input.getAttribute("aria-label"))).toEqual(["Blur value", "X Offset value", "Y Offset value"]);
  expect(screen.getByLabelText("Color").compareDocumentPosition(screen.getByRole("spinbutton", { name: "Blur value" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByLabelText(/opacity/i)).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
it("edits only enabled and restores all caller values after hiding", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("switch", { name: "Shadow" }));
  expect(onEdit.mock.calls).toEqual([[{ field: "enabled", value: false }]]);
  rerender(<ChartShadowPanel value={{ ...initial, enabled: false }} onEdit={onEdit} />);
  expect(screen.queryByLabelText("Color")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Shadow" }));
  expect(onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: true });
  rerender(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.color);
  expect((screen.getByRole("spinbutton", { name: "Y Offset value" }) as HTMLInputElement).value).toBe("-3");
  expect(onEdit).toHaveBeenCalledTimes(2);
});
it("supplies original numeric bounds and expands maxima for retained values", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  for (const [label, min, max] of [["Blur", "0", "20"], ["X Offset", "-10", "10"], ["Y Offset", "-10", "10"]]) {
    const number = screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement;
    expect([number.min, number.max, number.step]).toEqual([min, max, "any"]);
  }
  for (const range of screen.getAllByRole("slider")) expect((range as HTMLInputElement).step).toBe("1");
  rerender(<ChartShadowPanel value={{ ...initial, blur: 30, xOffset: 22, yOffset: 18 }} onEdit={onEdit} />);
  for (const [label, max] of [["Blur", "30"], ["X Offset", "22"], ["Y Offset", "18"]]) {
    expect((screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement).max).toBe(max);
  }
  expect(onEdit).not.toHaveBeenCalled();
});
it("emits exact numeric fields, retaining invalid drafts until correction", () => {
  const onEdit = vi.fn();
  render(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  const blur = screen.getByRole("spinbutton", { name: "Blur value" }) as HTMLInputElement;
  for (const value of ["", "-1", "21"]) fireEvent.change(blur, { target: { value } });
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(blur, { target: { value: "2.5" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "X Offset value" }), { target: { value: "-7.5" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Y Offset value" }), { target: { value: "4" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "blur", value: 2.5 }], [{ field: "xOffset", value: -7.5 }], [{ field: "yOffset", value: 4 }]]);
});
it("reuses alpha color correction and picker focus without incidental edits", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartShadowPanel value={initial} onEdit={onEdit} />);
  const color = screen.getByLabelText("Color") as HTMLInputElement;
  fireEvent.change(color, { target: { value: "#12" } });
  expect(color.value).toBe("#12");
  expect(color.getAttribute("aria-invalid")).toBe("true");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(color, { target: { value: "rgba(10, 20, 30, 0.25)" } });
  expect(onEdit).toHaveBeenLastCalledWith({ field: "color", value: "rgba(10, 20, 30, 0.25)" });
  rerender(<ChartShadowPanel value={{ ...initial, color: "#12345678" }} onEdit={onEdit} />);
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
