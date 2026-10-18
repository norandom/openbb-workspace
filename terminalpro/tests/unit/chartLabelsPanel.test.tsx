import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ChartLabelsPanel,
  type ChartLabelsPanelProps,
} from "../../src/components/General/Table/Chart/editor/labels/ChartLabelsPanel";

afterEach(cleanup);
function props(): ChartLabelsPanelProps & { onEdit: ReturnType<typeof vi.fn> } {
  return {
    value: { enabled: true, font: "Verdana", weight: "predefined", size: 12, color: "#FFFFFF" },
    fonts: [{ value: "Verdana", label: "Verdana" }, { value: "Arial", label: "Arial" }],
    weights: [{ value: "predefined", label: "Predefined" }, { value: "400-italic", label: "Italic" }],
    sizes: [{ value: 12, label: "12" }, { value: 18, label: "18" }],
    onEdit: vi.fn(),
  };
}
it("emits only exact controlled edits and retains hidden typography and alpha color", () => {
  const p = props();
  p.value.color = "#27C6A080";
  const { rerender } = render(<ChartLabelsPanel {...p} />);
  expect(p.onEdit).not.toHaveBeenCalled();
  expect(screen.getAllByRole("combobox").map((input) => input.getAttribute("aria-label"))).toEqual(["Font", "Weight", "Size"]);
  for (const [label, field, value] of [["Font", "font", "Arial"], ["Weight", "weight", "400-italic"], ["Size", "size", 18]] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });
    expect(p.onEdit).toHaveBeenLastCalledWith({ field, value });
  }
  fireEvent.click(screen.getByRole("switch", { name: "Labels" }));
  expect(p.onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: false });
  rerender(<ChartLabelsPanel {...p} value={{ ...p.value, enabled: false }} />);
  expect(screen.queryByLabelText("Font")).toBeNull();
  fireEvent.click(screen.getByRole("switch", { name: "Labels" }));
  expect(p.onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: true });
  rerender(<ChartLabelsPanel {...p} />);
  expect((screen.getByLabelText("Font") as HTMLSelectElement).value).toBe("Verdana");
  expect((screen.getByLabelText("Color") as HTMLInputElement).value).toBe("#27C6A080");
});
it("preserves unknown choices and caller order without mount edits", () => {
  const p = props();
  p.value = { ...p.value, font: "Custom", weight: "opaque", size: 37 };
  render(<ChartLabelsPanel {...p} />);
  for (const [label, values] of [["Font", ["Custom", "Verdana", "Arial"]], ["Weight", ["opaque", "predefined", "400-italic"]], ["Size", ["37", "12", "18"]]] as const) {
    const input = screen.getByLabelText(label) as HTMLSelectElement;
    expect(input.value).toBe(values[0]);
    expect([...input.options].map((option) => option.value)).toEqual(values);
  }
  expect(p.onEdit).not.toHaveBeenCalled();
});
it("keeps invalid color drafts correctable and closes the picker with restored focus", () => {
  const p = props();
  render(<ChartLabelsPanel {...p} />);
  const color = screen.getByLabelText("Color");
  fireEvent.change(color, { target: { value: "invalid" } });
  expect(color.getAttribute("aria-invalid")).toBe("true");
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.change(color, { target: { value: "#27C6A080" } });
  expect(p.onEdit).toHaveBeenLastCalledWith({ field: "color", value: "#27C6A080" });
  const opener = screen.getByRole("button", { name: "Choose color" });
  for (const key of ["Escape", "Enter"]) {
    fireEvent.click(opener);
    fireEvent.keyDown(screen.getByRole("dialog"), { key });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  }
});
