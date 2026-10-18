import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartBackgroundPanel } from "../../src/components/General/Table/Chart/editor/background/ChartBackgroundPanel";

afterEach(cleanup);
const initial = { visible: true, fill: "rgba(21, 21, 24, 0.4)" };
it("renders the original toggle and Color without mounting edits or opacity fields", () => {
  const onEdit = vi.fn();
  render(<ChartBackgroundPanel value={initial} onEdit={onEdit} />);
  expect(screen.getByRole("switch", { name: "Background" }).getAttribute("aria-checked")).toBe("true");
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.fill);
  expect(screen.queryByLabelText(/opacity/i)).toBeNull();
  expect(onEdit).not.toHaveBeenCalled();
});
it("emits only visibility and restores the caller fill after hiding", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartBackgroundPanel value={initial} onEdit={onEdit} />);
  fireEvent.click(screen.getByRole("switch", { name: "Background" }));
  expect(onEdit.mock.calls).toEqual([[{ field: "visible", value: false }]]);
  rerender(<ChartBackgroundPanel value={{ ...initial, visible: false }} onEdit={onEdit} />);
  expect(screen.queryByLabelText("Color")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Background" }));
  expect(onEdit).toHaveBeenLastCalledWith({ field: "visible", value: true });
  rerender(<ChartBackgroundPanel value={initial} onEdit={onEdit} />);
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe(initial.fill);
  expect(onEdit).toHaveBeenCalledTimes(2);
});
it("keeps raw alpha colors and invalid drafts correctable without changing caller state", () => {
  const onEdit = vi.fn();
  const { rerender } = render(<ChartBackgroundPanel value={initial} onEdit={onEdit} />);
  const input = screen.getByLabelText("Color") as HTMLInputElement;
  for (const value of ["", "oops", "#12"]) {
    fireEvent.change(input, { target: { value } });
    expect(input.value).toBe(value);
    expect(input.getAttribute("aria-invalid")).toBe("true");
  }
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "#12345678" } });
  expect(onEdit).toHaveBeenLastCalledWith({ field: "fill", value: "#12345678" });
  expect(initial.fill).toBe("rgba(21, 21, 24, 0.4)");
  rerender(<ChartBackgroundPanel value={{ ...initial, fill: "transparent" }} onEdit={onEdit} />);
  expect(input.value).toBe("transparent");
  expect(onEdit).toHaveBeenCalledTimes(1);
});
it("opens the reused picker without edits and closes on Escape and Enter", () => {
  const onEdit = vi.fn();
  render(<ChartBackgroundPanel value={initial} onEdit={onEdit} />);
  const opener = screen.getByRole("button", { name: "Choose color" });
  for (const key of ["Escape", "Enter"]) {
    fireEvent.click(opener);
    expect(screen.getByLabelText("Picker color")).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText("Picker color"), { key });
    expect(screen.queryByLabelText("Picker color")).toBeNull();
    expect(document.activeElement).toBe(opener);
  }
  expect(onEdit).not.toHaveBeenCalled();
});
