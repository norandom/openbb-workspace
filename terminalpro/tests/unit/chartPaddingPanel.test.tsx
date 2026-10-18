import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartPaddingPanel } from "../../src/components/General/Table/Chart/editor/padding/ChartPaddingPanel";

afterEach(cleanup);
function props() {
  return { value: { top: 20, right: 20, bottom: 20, left: 20 }, bounds: { min: 0, max: 100, step: 1 }, onEdit: vi.fn() };
}
it("shows the original four sides without a toggle or mount edits and routes edits independently", () => {
  const p = props();
  render(<ChartPaddingPanel {...p} />);
  expect(screen.getByRole("group", { name: "Padding" })).toBeTruthy();
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.getAllByRole("slider").map((item) => item.getAttribute("aria-label"))).toEqual(["Top", "Right", "Bottom", "Left"]);
  expect(p.onEdit).not.toHaveBeenCalled();
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const label = side[0].toUpperCase() + side.slice(1);
    fireEvent.change(screen.getByLabelText(label), { target: { value: "31" } });
    expect(p.onEdit).toHaveBeenLastCalledWith({ side, value: 31 });
    fireEvent.change(screen.getByLabelText(`${label} value`), { target: { value: "24.25" } });
    expect(p.onEdit).toHaveBeenLastCalledWith({ side, value: 24.25 });
  }
  expect(p.value).toEqual({ top: 20, right: 20, bottom: 20, left: 20 });
});
it("accepts decimals beyond initial bounds and links controlled updates to an expanded slider", () => {
  const p = props();
  const { rerender } = render(<ChartPaddingPanel {...p} />);
  fireEvent.change(screen.getByLabelText("Top value"), { target: { value: "150.25" } });
  expect(p.onEdit).toHaveBeenLastCalledWith({ side: "top", value: 150.25 });
  rerender(<ChartPaddingPanel {...p} value={{ ...p.value, top: 150.25 }} />);
  const slider = screen.getByLabelText("Top") as HTMLInputElement;
  expect(slider.max).toBe("150.25");
  expect(slider.step).toBe("1");
  expect((screen.getByLabelText("Top value") as HTMLInputElement).value).toBe("150.25");
  expect((screen.getByLabelText("Right") as HTMLInputElement).max).toBe("100");
});
it("keeps invalid drafts correctable without edits and preserves outside-range caller values", () => {
  const p = props();
  p.value = { top: -5, right: 240, bottom: 20, left: 20 };
  const { rerender } = render(<ChartPaddingPanel {...p} />);
  expect((screen.getByLabelText("Top value") as HTMLInputElement).value).toBe("-5");
  expect((screen.getByLabelText("Right") as HTMLInputElement).max).toBe("240");
  const input = screen.getByLabelText("Left value") as HTMLInputElement;
  for (const value of ["", "-1", "oops", "0x10", "Infinity", "NaN", "1e999"]) {
    fireEvent.change(input, { target: { value } });
    expect(input.value).toBe(value);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  }
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: ".5" } });
  expect(p.onEdit).toHaveBeenLastCalledWith({ side: "left", value: .5 });
  rerender(<ChartPaddingPanel {...p} value={{ ...p.value, left: 42 }} />);
  expect(input.value).toBe("42");
});
