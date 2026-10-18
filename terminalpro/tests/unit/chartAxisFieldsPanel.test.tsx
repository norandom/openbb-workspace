import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartAxisFieldsPanel } from "../../src/components/General/Table/Chart/editor/axis/ChartAxisFieldsPanel";

afterEach(cleanup);
const initial = { type: "custom", timeFormat: "%custom", position: "custom", color: "#12345680", thickness: 0 };
const choices = {
  types: [{ value: "time", label: "Time" }, { value: "category", label: "Category" }],
  timeFormats: [{ value: "%Y", label: "Year" }],
  positions: [{ value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }],
} as const;
it("renders exact field order and caller choice order without heading or toggle", () => {
  const onEdit = vi.fn();
  const { container } = render(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} {...choices} />);
  expect(Array.from(container.querySelectorAll('select, input[aria-label="Color"], input[type="number"]')).map((node) => node.getAttribute("aria-label"))).toEqual(["Axis Type", "Time Format", "Position", "Color", "Thickness value"]);
  expect(Array.from((screen.getByLabelText("Axis Type") as HTMLSelectElement).options).map((option) => option.value)).toEqual(["custom", "time", "category"]);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
it("hides optional selectors independently and restores unknown retained values", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} {...choices} />);
  for (const field of ["types", "timeFormats", "positions"] as const) {
    rerender(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} {...choices} {...{ [field]: undefined }} />);
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
  }
  rerender(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} />);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.color);
  rerender(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} {...choices} />);
  expect(screen.getAllByRole("combobox").map((node) => (node as HTMLSelectElement).value)).toEqual(["custom", "%custom", "custom"]);
  expect(onEdit).not.toHaveBeenCalled();
});
it("emits one exact field per choice, color and numeric edit", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} {...choices} />);
  for (const [label, value] of [["Axis Type", "time"], ["Time Format", "%Y"], ["Position", "top"], ["Color", "#ABCDEF80"], ["Thickness value", "2.5"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.change(screen.getByRole("slider", { name: "Thickness" }), { target: { value: "1" } });
  rerender(<ChartAxisFieldsPanel value={{ ...initial, thickness: 1 }} onEdit={onEdit} {...choices} />);
  fireEvent.change(screen.getByRole("slider", { name: "Thickness" }), { target: { value: "0" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "type", value: "time" }], [{ field: "timeFormat", value: "%Y" }], [{ field: "position", value: "top" }], [{ field: "color", value: "#ABCDEF80" }], [{ field: "thickness", value: 2.5 }], [{ field: "thickness", value: 1 }], [{ field: "thickness", value: 0 }]]);
});
it("retains correctable drafts across unchanged rerenders and accepts expanded bounds", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartAxisFieldsPanel value={initial} onEdit={onEdit} />);
  const number = screen.getByLabelText("Thickness value") as HTMLInputElement;
  const color = screen.getByLabelText("Color") as HTMLInputElement;
  expect([number.min, number.max, number.step]).toEqual(["0", "10", "any"]);
  expect((screen.getByRole("slider") as HTMLInputElement).step).toBe("1");
  for (const value of ["", "-1", "11"]) {
    fireEvent.change(number, { target: { value } });
    expect(number.value).toBe(value);
    expect(number.getAttribute("aria-invalid")).toBe("true");
  }
  fireEvent.change(color, { target: { value: "#12" } });
  rerender(<ChartAxisFieldsPanel value={{ ...initial }} onEdit={onEdit} />);
  expect(number.value).toBe("11");
  expect(color.value).toBe("#12");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(number, { target: { value: "1.25" } });
  fireEvent.change(color, { target: { value: "rgba(10, 20, 30, 0.25)" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "thickness", value: 1.25 }], [{ field: "color", value: "rgba(10, 20, 30, 0.25)" }]]);
  rerender(<ChartAxisFieldsPanel value={{ ...initial, thickness: 15.5, color: "#ABCDEF40" }} onEdit={onEdit} />);
  expect([number.max, number.value, color.value]).toEqual(["15.5", "15.5", "#ABCDEF40"]);
});
