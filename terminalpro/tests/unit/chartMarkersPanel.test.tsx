import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartMarkersPanel } from "../../src/components/General/Table/Chart/editor/markers/ChartMarkersPanel";

afterEach(cleanup);
const initial = { enabled: true, shape: "circle", size: 7, strokeWidth: 0 };
const shapes = ["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].map((value) => ({ value, label: value }));
it("renders the original group order without mount edits or invented color", () => {
  const onEdit = vi.fn();
  const { container } = render(<ChartMarkersPanel value={initial} shapes={shapes} onEdit={onEdit} />);
  expect(screen.getByRole("switch", { name: "Markers" }).getAttribute("aria-checked")).toBe("true");
  expect(Array.from(container.querySelectorAll("select,input[type=number]")).map((input) => input.getAttribute("aria-label"))).toEqual(["Shape", "Size value", "Stroke Width value"]);
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(shapes.map((shape) => shape.label));
  expect(screen.queryByLabelText("Color")).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
it("preserves unknown shape and caller choice order and emits only selected shape", () => {
  const onEdit = vi.fn();
  render(<ChartMarkersPanel value={{ ...initial, shape: "custom" }} shapes={[shapes[6], shapes[0]]} onEdit={onEdit} />);
  expect((screen.getByRole("combobox", { name: "Shape" }) as HTMLSelectElement).value).toBe("custom");
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["custom", "heart", "square"]);
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Shape" }), { target: { value: "heart" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "shape", value: "heart" }]]);
});
it("emits only enabled and retains caller values through hiding and re-enabling", () => {
  const onEdit = vi.fn();
  const value = { ...initial, shape: "diamond", size: 8.5, strokeWidth: 2.25 };
  const { rerender } = render(<ChartMarkersPanel value={value} shapes={shapes} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("switch", { name: "Markers" }));
  expect(onEdit.mock.calls).toEqual([[{ field: "enabled", value: false }]]);
  rerender(<ChartMarkersPanel value={{ ...value, enabled: false }} shapes={shapes} onEdit={onEdit} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Markers" }));
  expect(onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: true });
  rerender(<ChartMarkersPanel value={value} shapes={shapes} onEdit={onEdit} />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("diamond");
  expect((screen.getByRole("spinbutton", { name: "Size value" }) as HTMLInputElement).value).toBe("8.5");
  expect((screen.getByRole("spinbutton", { name: "Stroke Width value" }) as HTMLInputElement).value).toBe("2.25");
  expect(onEdit).toHaveBeenCalledTimes(2);
});
it("uses original numeric bounds and expands both controls for retained values", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartMarkersPanel value={initial} shapes={shapes} onEdit={onEdit} />);
  for (const [label, max] of [["Size", "60"], ["Stroke Width", "10"]]) {
    for (const role of ["spinbutton", "slider"]) {
      const input = screen.getByRole(role, { name: role === "slider" ? label : `${label} value` }) as HTMLInputElement;
      expect([input.min, input.max, input.step]).toEqual(["0", max, role === "slider" ? "1" : "any"]);
    }
  }
  rerender(<ChartMarkersPanel value={{ ...initial, size: 72.5, strokeWidth: 12.5 }} shapes={shapes} onEdit={onEdit} />);
  for (const [label, max] of [["Size", "72.5"], ["Stroke Width", "12.5"]]) {
    expect((screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement).max).toBe(max);
    expect((screen.getByRole("slider", { name: label }) as HTMLInputElement).max).toBe(max);
  }
  expect(onEdit).not.toHaveBeenCalled();
});
it("keeps invalid native drafts correctable and emits exact fractional and range edits", () => {
  const onEdit = vi.fn();
  render(<ChartMarkersPanel value={initial} shapes={shapes} onEdit={onEdit} />);
  for (const [label, invalid, valid] of [["Size", "61", "8.75"], ["Stroke Width", "11", "2.25"]]) {
    const input = screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement;
    for (const value of ["", "-1", invalid]) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
      expect(input.getAttribute("aria-invalid")).toBe("true");
    }
    fireEvent.change(input, { target: { value: valid } });
    expect(input.getAttribute("aria-invalid")).toBe("false");
  }
  fireEvent.change(screen.getByRole("slider", { name: "Size" }), { target: { value: "0" } });
  fireEvent.change(screen.getByRole("slider", { name: "Stroke Width" }), { target: { value: "4" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "size", value: 8.75 }], [{ field: "strokeWidth", value: 2.25 }], [{ field: "size", value: 0 }], [{ field: "strokeWidth", value: 4 }]]);
});
