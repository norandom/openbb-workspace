import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ChartLegendPanel,
  type ChartLegendPanelProps,
} from "../../src/components/General/Table/Chart/editor/legend/ChartLegendPanel";

afterEach(cleanup);
function props(): ChartLegendPanelProps & { onEdit: ReturnType<typeof vi.fn> } {
  const bounds = { min: 0, max: 40, step: 1 };
  return {
    value: {
      enabled: true,
      font: "Verdana",
      weight: "predefined",
      size: 11,
      color: "#FFFFFF",
      position: "top",
      spacing: 20,
      markerSize: 11,
      markerStroke: 0,
      itemSpacing: 5,
      horizontalSpacing: 32,
      verticalSpacing: 8,
    },
    fonts: [
      { value: "Verdana", label: "Verdana" },
      { value: "Arial", label: "Arial" },
    ],
    weights: [
      { value: "predefined", label: "Predefined" },
      { value: "400-italic", label: "Italic" },
    ],
    sizes: [
      { value: 11, label: "11" },
      { value: 18, label: "18" },
    ],
    positions: [
      { value: "top", label: "Top" },
      { value: "right", label: "Right" },
    ],
    bounds: {
      spacing: bounds,
      markerSize: bounds,
      markerStroke: bounds,
      itemSpacing: bounds,
      horizontalSpacing: bounds,
      verticalSpacing: bounds,
    },
    onEdit: vi.fn(),
  };
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Legend", exact: true }));
}
it("starts collapsed, emits exact fields, and retains disabled state without normalization", () => {
  const p = props();
  const { rerender } = render(<ChartLegendPanel {...p} />);
  expect(screen.queryByLabelText("Font")).toBeNull();
  open();
  expect(p.onEdit).not.toHaveBeenCalled();
  for (const [label, field, value] of [
    ["Font", "font", "Arial"],
    ["Weight", "weight", "400-italic"],
    ["Size", "size", 18],
    ["Position", "position", "right"],
  ] as const) {
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: String(value) },
    });
    expect(p.onEdit).toHaveBeenLastCalledWith({ field, value });
  }
  fireEvent.click(screen.getByRole("switch", { name: "Enabled" }));
  expect(p.onEdit).toHaveBeenLastCalledWith({ field: "enabled", value: false });
  rerender(<ChartLegendPanel {...p} value={{ ...p.value, enabled: false }} />);
  expect(screen.queryByLabelText("Font")).toBeNull();
  rerender(<ChartLegendPanel {...p} />);
  expect((screen.getByLabelText("Font") as HTMLSelectElement).value).toBe("Verdana");
});
it("preserves unknown supplied selections and choice order", () => {
  const p = props();
  p.value = {
    ...p.value,
    font: "Unknown",
    weight: "opaque",
    size: 37,
    position: "custom",
  };
  render(<ChartLegendPanel {...p} />);
  open();
  for (const [label, value] of [
    ["Font", "Unknown"],
    ["Weight", "opaque"],
    ["Size", "37"],
    ["Position", "custom"],
  ])
    expect((screen.getByLabelText(label) as HTMLSelectElement).value).toBe(value);
  expect(
    [...screen.getByLabelText("Font").querySelectorAll("option")].map((o) => o.value),
  ).toEqual(["Unknown", "Verdana", "Arial"]);
  expect(p.onEdit).not.toHaveBeenCalled();
});
it("links every numeric field, accepts decimals above presentation maxima and rejects invalid drafts", () => {
  const p = props();
  const { rerender } = render(<ChartLegendPanel {...p} />);
  open();
  for (const [label, field] of [
    ["Spacing", "spacing"],
    ["Marker Size", "markerSize"],
    ["Marker Stroke", "markerStroke"],
    ["Item Spacing", "itemSpacing"],
    ["Horizontal Spacing", "horizontalSpacing"],
    ["Vertical Spacing", "verticalSpacing"],
  ] as const) {
    p.onEdit.mockClear();
    const input = screen.getByLabelText(`${label} value`);
    for (const value of ["", "-1", "bad", "Infinity", "NaN", "0x10"])
      fireEvent.change(input, { target: { value } });
    expect(p.onEdit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "81.25" } });
    expect(p.onEdit).toHaveBeenLastCalledWith({ field, value: 81.25 });
    rerender(<ChartLegendPanel {...p} value={{ ...p.value, [field]: 81.25 }} />);
    expect(screen.getByLabelText(label).getAttribute("max")).toBe("81.25");
    expect(screen.getByLabelText(label).getAttribute("step")).toBe("1");
    fireEvent.change(screen.getByLabelText(label), { target: { value: "22" } });
    expect(p.onEdit).toHaveBeenLastCalledWith({ field, value: 22 });
  }
});
it("retains alpha color drafts and picker closing focus behavior", () => {
  const p = props();
  render(<ChartLegendPanel {...p} />);
  open();
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
