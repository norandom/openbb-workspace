import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi, type Mock } from "vitest";
import type { PieLabelControlsProps } from "../../../src/components/General/Table/Chart/application/pieSessionTypes";
import { ChartLabelsPanel } from "../../../src/components/General/Table/Chart/editor/labels/ChartLabelsPanel";
import { PieLabelControls } from "../../../src/components/General/Table/Chart/editor/pie/PieLabelControls";

afterEach(cleanup);

function props(): PieLabelControlsProps & { onIntent: Mock<PieLabelControlsProps["onIntent"]> } {
  const labels = {
    value: { enabled: true, font: "Custom Financial", weight: "predefined", size: 37, color: "#27C6A080" },
    fonts: [{ value: "Arial", label: "Arial" }],
    weights: [{ value: "predefined", label: "Predefined" }, { value: "400-italic", label: "Italic" }],
    sizes: [{ value: 12, label: "12" }, { value: 18, label: "18" }],
  };
  const numeric = { min: 0, rangeStep: 1, numberStep: "any" as const };
  return {
    callout: labels,
    sector: { ...labels, value: { ...labels.value, font: "Sector Custom", size: 39, color: "#FFFFFF" } },
    calloutControls: {
      length: { ...numeric, label: "Length", value: 55, max: 55 },
      strokeWidth: { ...numeric, label: "Stroke Width", value: 12, max: 12 },
      offset: { ...numeric, label: "Offset", value: 35, max: 35 },
    },
    sectorPosition: { label: "Position Ratio", value: 1.2, min: 0, max: 1.2, rangeStep: 0.05, numberStep: "any" },
    onIntent: vi.fn<PieLabelControlsProps["onIntent"]>(),
  };
}

it("names both independent label groups and retains custom typography without mount edits", () => {
  const p = props();
  render(<PieLabelControls {...p} />);
  expect(screen.getAllByRole("switch").map((item) => item.getAttribute("aria-label")))
    .toEqual(["Callout Labels", "Sector Labels"]);
  for (const [name, font, size] of [["Callout Labels", "Custom Financial", "37"], ["Sector Labels", "Sector Custom", "39"]]) {
    const group = within(screen.getByRole("group", { name }));
    expect((group.getByRole("combobox", { name: "Font" }) as HTMLSelectElement).value).toBe(font);
    expect((group.getByRole("combobox", { name: "Size" }) as HTMLSelectElement).value).toBe(size);
    expect((group.getByRole("combobox", { name: "Weight" }) as HTMLSelectElement).value).toBe("predefined");
  }
  expect(screen.getByRole("group", { name: "Callout" })).toBeTruthy();
  expect(p.onIntent).not.toHaveBeenCalled();
});

it("hides only disabled label children and restores controlled retained values", () => {
  const p = props();
  const view = render(<PieLabelControls {...p} />);
  fireEvent.click(screen.getByRole("switch", { name: "Callout Labels" }));
  expect(p.onIntent).toHaveBeenLastCalledWith({ panel: "pieLabel", label: "calloutLabel", edit: { field: "enabled", value: false } });
  view.rerender(<PieLabelControls {...p} callout={{ ...p.callout, value: { ...p.callout.value, enabled: false } }} />);
  expect(within(screen.getByRole("group", { name: "Callout Labels" })).queryByRole("combobox")).toBeNull();
  expect(screen.queryByRole("group", { name: "Callout" })).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Position Ratio value" })).toBeTruthy();
  view.rerender(<PieLabelControls {...p} sector={{ ...p.sector, value: { ...p.sector.value, enabled: false } }} />);
  expect(screen.queryByRole("spinbutton", { name: "Position Ratio value" })).toBeNull();
  expect(screen.getByRole("spinbutton", { name: "Length value" })).toBeTruthy();
  view.rerender(<PieLabelControls {...p} />);
  expect((screen.getByRole("spinbutton", { name: "Length value" }) as HTMLInputElement).value).toBe("55");
  expect((within(screen.getByRole("group", { name: "Callout Labels" })).getByLabelText("Color") as HTMLInputElement).value).toBe("#27C6A080");
  expect(p.onIntent).toHaveBeenCalledTimes(1);
});

it("emits typed typography and color edits independently for each channel", () => {
  const p = props();
  render(<PieLabelControls {...p} />);
  for (const [name, label] of [["Callout Labels", "calloutLabel"], ["Sector Labels", "sectorLabel"]]) {
    const group = within(screen.getByRole("group", { name }));
    for (const [control, field, value] of [["Font", "font", "Arial"], ["Weight", "weight", "400-italic"], ["Size", "size", 18], ["Color", "color", "#12345680"]] as const) {
      fireEvent.change(group.getByLabelText(control), { target: { value: String(value) } });
      expect(p.onIntent).toHaveBeenLastCalledWith({ panel: "pieLabel", label, edit: { field, value } });
    }
  }
});

it("emits every numeric intent while enforcing both retained bounds", () => {
  const p = props();
  render(<PieLabelControls {...p} />);
  const cases = [
    ["Length", "pieCallout", "length", "55", "55", 4.5],
    ["Stroke Width", "pieCallout", "strokeWidth", "12", "12", 2.5],
    ["Offset", "pieCallout", "offset", "35", "35", 3.5],
    ["Position Ratio", "pieSector", "positionRatio", "1.2", "1.2", 0.65],
  ] as const;
  for (const [name, panel, field, value, max, next] of cases) {
    const input = screen.getByRole("spinbutton", { name: `${name} value` }) as HTMLInputElement;
    const slider = screen.getByRole("slider", { name }) as HTMLInputElement;
    expect([input.value, input.min, input.max, input.step]).toEqual([value, "0", max, "any"]);
    expect([slider.min, slider.max, slider.step]).toEqual(["0", max, name === "Position Ratio" ? "0.05" : "1"]);
    fireEvent.change(input, { target: { value: String(next) } });
    expect(p.onIntent).toHaveBeenLastCalledWith({ panel, edit: { field, value: next } });
    const count = p.onIntent.mock.calls.length;
    for (const invalid of ["-1", String(Number(max) + 1), ""]) {
      fireEvent.change(input, { target: { value: invalid } });
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(p.onIntent).toHaveBeenCalledTimes(count);
    }
  }
});

it("supports keyboard switches, typography selection and color dismissal with focus return", async () => {
  const p = props();
  render(<PieLabelControls {...p} />);
  const user = userEvent.setup();
  for (const [name, label] of [["Callout Labels", "calloutLabel"], ["Sector Labels", "sectorLabel"]]) {
    const toggle = screen.getByRole("switch", { name });
    toggle.focus();
    await user.keyboard(" ");
    expect(p.onIntent).toHaveBeenLastCalledWith({ panel: "pieLabel", label, edit: { field: "enabled", value: false } });
    expect(document.activeElement).toBe(toggle);
  }
  const group = within(screen.getByRole("group", { name: "Sector Labels" }));
  await user.selectOptions(group.getByRole("combobox", { name: "Weight" }), "400-italic");
  expect(p.onIntent).toHaveBeenLastCalledWith({ panel: "pieLabel", label: "sectorLabel", edit: { field: "weight", value: "400-italic" } });
  const opener = group.getByRole("button", { name: "Choose color" });
  opener.focus();
  await user.keyboard("{Enter}");
  const picker = screen.getByRole("dialog", { name: "Color picker" });
  fireEvent.keyDown(picker, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

it("preserves the default Labels name for existing generic callers", () => {
  const p = props();
  render(<ChartLabelsPanel {...p.callout} onEdit={vi.fn()} />);
  expect(screen.getByRole("group", { name: "Labels" })).toBeTruthy();
  expect(screen.getByRole("switch", { name: "Labels" })).toBeTruthy();
});
