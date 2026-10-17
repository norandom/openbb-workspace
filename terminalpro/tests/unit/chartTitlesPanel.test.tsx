import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  ChartTitlesPanel,
  type ChartCaptionState,
} from "../../src/components/General/Table/Chart/editor/titles/ChartTitlesPanel";

afterEach(cleanup);
const caption: ChartCaptionState = {
  enabled: true,
  text: "Revenue",
  font: "Verdana",
  weight: "predefined",
  size: 18,
  color: "rgba(39, 198, 160, 0.502)",
  spacing: 10,
};
function props() {
  return {
    value: {
      title: { ...caption },
      subtitle: { ...caption },
      horizontalAxisTitle: { ...caption },
      verticalAxisTitle: { ...caption },
    },
    fonts: [{ value: "Verdana", label: "Verdana" }],
    weights: [{ value: "predefined", label: "Predefined" }],
    sizes: [{ value: 18, label: "18" }],
    spacingBounds: { min: 0, max: 100, step: 1 },
    onEdit: vi.fn(),
  };
}
function open() {
  fireEvent.click(screen.getByRole("button", { name: "Titles" }));
}
it("emits independent typed edits and retains caller values while disabled", () => {
  const p = props();
  const { rerender } = render(<ChartTitlesPanel {...p} />);
  open();
  expect(p.onEdit).not.toHaveBeenCalled();
  const section = within(screen.getByRole("group", { name: "Chart Title" }));
  fireEvent.change(section.getByLabelText("Title"), {
    target: { value: "USD million" },
  });
  expect(p.onEdit).toHaveBeenLastCalledWith({
    caption: "title",
    field: "text",
    value: "USD million",
  });
  fireEvent.click(section.getByRole("switch"));
  expect(p.onEdit).toHaveBeenLastCalledWith({
    caption: "title",
    field: "enabled",
    value: false,
  });
  rerender(
    <ChartTitlesPanel
      {...p}
      value={{ ...p.value, title: { ...caption, enabled: false } }}
    />,
  );
  expect(section.queryByLabelText("Title")).toBeNull();
  expect(screen.getAllByLabelText("Title")).toHaveLength(3);
  rerender(<ChartTitlesPanel {...p} />);
  expect((section.getByLabelText("Title") as HTMLInputElement).value).toBe("Revenue");
});
it("keeps unknown choices visible and rejects empty, invalid and out-of-bound spacing", () => {
  const p = props();
  p.value.title = { ...caption, font: "Unknown family", weight: "opaque", size: 37 };
  render(<ChartTitlesPanel {...p} />);
  open();
  const section = within(screen.getByRole("group", { name: "Chart Title" }));
  expect((section.getByLabelText("Font") as HTMLSelectElement).value).toBe(
    "Unknown family",
  );
  expect((section.getByLabelText("Weight") as HTMLSelectElement).value).toBe("opaque");
  expect((section.getByLabelText("Size") as HTMLSelectElement).value).toBe("37");
  const spacing = section.getByLabelText("Spacing value");
  for (const value of ["", "-1", "101", "oops", "0x10", "Infinity", "NaN"])
    fireEvent.change(spacing, { target: { value } });
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.change(spacing, { target: { value: "24" } });
  expect(p.onEdit).toHaveBeenLastCalledWith({
    caption: "title",
    field: "spacing",
    value: 24,
  });
});
it("accepts alpha CSS colors, keeps invalid drafts and closes the picker with focus", () => {
  const p = props();
  render(<ChartTitlesPanel {...p} />);
  open();
  const section = within(screen.getByRole("group", { name: "Subtitle" }));
  const color = section.getByLabelText("Color");
  fireEvent.change(color, { target: { value: "not-color" } });
  expect(color.getAttribute("aria-invalid")).toBe("true");
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.change(color, { target: { value: "#27C6A080" } });
  expect(p.onEdit).toHaveBeenLastCalledWith({
    caption: "subtitle",
    field: "color",
    value: "#27C6A080",
  });
  p.onEdit.mockClear();
  const opener = section.getByRole("button", { name: "Choose color" });
  fireEvent.click(opener);
  expect(p.onEdit).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
  fireEvent.click(opener);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});
it("routes every displayed field to each caption without converting opaque weights", () => {
  const p = props();
  p.fonts.push({ value: "Arial", label: "Arial" });
  p.weights.push({ value: "400-italic", label: "Italic" });
  p.sizes.push({ value: 24, label: "24" });
  render(<ChartTitlesPanel {...p} />);
  open();
  const ids = ["title", "subtitle", "horizontalAxisTitle", "verticalAxisTitle"];
  screen.getAllByRole("group").forEach((group, index) => {
    const section = within(group);
    for (const [label, field, value] of [
      ["Font", "font", "Arial"],
      ["Weight", "weight", "400-italic"],
      ["Size", "size", 24],
    ] as const) {
      fireEvent.change(section.getByLabelText(label), {
        target: { value: String(value) },
      });
      expect(p.onEdit).toHaveBeenLastCalledWith({ caption: ids[index], field, value });
    }
    fireEvent.change(section.getByLabelText("Spacing"), { target: { value: "31" } });
    expect(p.onEdit).toHaveBeenLastCalledWith({
      caption: ids[index],
      field: "spacing",
      value: 31,
    });
  });
});
