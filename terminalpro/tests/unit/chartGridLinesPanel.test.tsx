import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartGridLinesPanel } from "../../src/components/General/Table/Chart/editor/axis/ChartGridLinesPanel";

afterEach(cleanup);
const initial = { enabled: true, color: "#51515380", thickness: 1, lineDash: 0 };
it("renders original row order and restores controlled values across toggles without incidental edits", () => {
  const onEdit = vi.fn();
  const { container, rerender } = render(<ChartGridLinesPanel value={initial} onEdit={onEdit} />);
  const controls = Array.from(container.querySelectorAll('button[role="switch"], input[aria-label]')).map((node) => node.getAttribute("aria-label"));
  expect(controls).toEqual(["Grid Lines", "Color", "Thickness", "Thickness value", "Line Dash", "Line Dash value"]);
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("switch", { name: "Grid Lines" }));
  rerender(<ChartGridLinesPanel value={{ ...initial, enabled: false }} onEdit={onEdit} />);
  expect(screen.queryByLabelText("Color")).toBeNull();
  expect(screen.queryByRole("spinbutton")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Grid Lines" }));
  rerender(<ChartGridLinesPanel value={initial} onEdit={onEdit} />);
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.color);
  expect((screen.getByRole("spinbutton", { name: "Thickness value" }) as HTMLInputElement).value).toBe("1");
  expect((screen.getByRole("spinbutton", { name: "Line Dash value" }) as HTMLInputElement).value).toBe("0");
  expect(onEdit.mock.calls).toEqual([[{ field: "enabled", value: false }], [{ field: "enabled", value: true }]]);
});
it("uses zero minima, decimal inputs and expanding maxima for both controls", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartGridLinesPanel value={initial} onEdit={onEdit} />);
  for (const [label, max] of [["Thickness", "10"], ["Line Dash", "30"]]) {
    for (const role of ["slider", "spinbutton"]) {
      const input = screen.getByRole(role, { name: role === "slider" ? label : `${label} value` }) as HTMLInputElement;
      expect([input.min, input.max, input.step]).toEqual(["0", max, role === "slider" ? "1" : "any"]);
    }
  }
  rerender(<ChartGridLinesPanel value={{ ...initial, thickness: 12.5, lineDash: 35.5 }} onEdit={onEdit} />);
  expect((screen.getByRole("spinbutton", { name: "Thickness value" }) as HTMLInputElement).max).toBe("12.5");
  expect((screen.getByRole("slider", { name: "Line Dash" }) as HTMLInputElement).max).toBe("35.5");
  expect(onEdit).not.toHaveBeenCalled();
});
it("rejects invalid numeric drafts and emits exact decimal and slider edits on correction", () => {
  const onEdit = vi.fn();
  render(<ChartGridLinesPanel value={initial} onEdit={onEdit} />);
  for (const [label, overMax, valid] of [["Thickness", "11", "2.5"], ["Line Dash", "31", "3.25"]]) {
    const input = screen.getByRole("spinbutton", { name: `${label} value` }) as HTMLInputElement;
    for (const value of ["", "-1", overMax]) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
      expect(input.getAttribute("aria-invalid")).toBe("true");
    }
    fireEvent.change(input, { target: { value: valid } });
    expect(input.getAttribute("aria-invalid")).toBe("false");
  }
  fireEvent.change(screen.getByRole("slider", { name: "Line Dash" }), { target: { value: "4" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "thickness", value: 2.5 }], [{ field: "lineDash", value: 3.25 }], [{ field: "lineDash", value: 4 }]]);
});
it("preserves raw alpha colors and supports invalid color draft recovery", () => {
  const onEdit = vi.fn();
  render(<ChartGridLinesPanel value={initial} onEdit={onEdit} />);
  const input = screen.getByLabelText("Color") as HTMLInputElement;
  expect(input.value).toBe(initial.color);
  fireEvent.change(input, { target: { value: "#12" } });
  expect(input.value).toBe("#12");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "rgba(10, 20, 30, 0.25)" } });
  expect(onEdit.mock.calls).toEqual([[{ field: "color", value: "rgba(10, 20, 30, 0.25)" }]]);
});
