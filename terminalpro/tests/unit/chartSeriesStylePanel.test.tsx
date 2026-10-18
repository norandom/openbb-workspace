import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartNumberInput } from "../../src/components/General/Table/Chart/editor/series/ChartNumberInput";
import {
  ChartSeriesStylePanel,
  type SeriesStyleControl,
} from "../../src/components/General/Table/Chart/editor/series/ChartSeriesStylePanel";
afterEach(cleanup);
const controls: SeriesStyleControl[] = [
  {
    field: "strokeWidth",
    label: "Stroke Width",
    value: 1,
    min: 0,
    max: 10,
    rangeStep: 1,
    numberStep: "any",
  },
  {
    field: "lineDash",
    label: "Line Dash",
    value: 0,
    min: 0,
    max: 30,
    rangeStep: 1,
    numberStep: "any",
  },
  {
    field: "strokeOpacity",
    label: "Line Opacity",
    value: 1,
    min: 0,
    max: 1,
    rangeStep: 0.05,
    numberStep: 0.05,
  },
  {
    field: "fillOpacity",
    label: "Fill Opacity",
    value: 0.5,
    min: 0,
    max: 1,
    rangeStep: 0.05,
    numberStep: 0.05,
  },
];
it("retains descriptor order, labels, bounds and exact scalar edits without mount emissions", () => {
  const onEdit = vi.fn();
  render(<ChartSeriesStylePanel controls={controls} onEdit={onEdit} />);
  expect(
    screen.getAllByRole("slider").map((e) => e.getAttribute("aria-label")),
  ).toEqual(controls.map((c) => c.label));
  expect(onEdit).not.toHaveBeenCalled();
  for (const control of controls) {
    const range = screen.getByRole("slider", { name: control.label });
    const number = screen.getByRole("spinbutton", {
      name: `${control.label} value`,
    });
    for (const [attr, value] of [
      ["min", control.min],
      ["max", control.max],
      ["step", control.rangeStep],
    ] as const)
      expect(range.getAttribute(attr)).toBe(String(value));
    expect(number.getAttribute("step")).toBe(String(control.numberStep));
    expect(number.getAttribute("min")).toBe(String(control.min));
    expect(number.getAttribute("max")).toBe(String(control.max));
    fireEvent.change(number, {
      target: { value: control.field.includes("Opacity") ? "0.35" : "2.75" },
    });
    expect(onEdit).toHaveBeenLastCalledWith({
      field: control.field,
      value: control.field.includes("Opacity") ? 0.35 : 2.75,
    });
  }
});
it("honors omitted and reordered family descriptors and external stored values", () => {
  const onEdit = vi.fn();
  const { rerender } = render(
    <ChartSeriesStylePanel
      controls={[
        { ...controls[1], label: "Custom Dash" },
        { ...controls[0], label: "Line Width", value: 15, max: 15 },
      ]}
      onEdit={onEdit}
    />,
  );
  expect(
    screen.getAllByRole("slider").map((e) => e.getAttribute("aria-label")),
  ).toEqual(["Custom Dash", "Line Width"]);
  expect(
    (
      screen.getByRole("spinbutton", {
        name: "Line Width value",
      }) as HTMLInputElement
    ).value,
  ).toBe("15");
  expect(onEdit).not.toHaveBeenCalled();
  rerender(<ChartSeriesStylePanel controls={[]} onEdit={onEdit} />);
  expect(screen.queryByRole("slider")).toBeNull();
});
it("keeps invalid native drafts local, permits correction and synchronizes external values", () => {
  const onChange = vi.fn();
  const props = {
    label: "Opacity",
    value: 0.5,
    min: 0,
    max: 1,
    rangeStep: 0.05,
    numberStep: 0.05,
    onChange,
  };
  const { rerender } = render(<ChartNumberInput {...props} />);
  const number = screen.getByRole("spinbutton") as HTMLInputElement;
  for (const value of ["", "-1", "1.1", "0.33", "1e999"]) {
    fireEvent.change(number, { target: { value } });
    expect(onChange).not.toHaveBeenCalled();
    expect(number.getAttribute("aria-invalid")).toBe("true");
  }
  fireEvent.change(number, { target: { value: "0.35" } });
  expect(onChange.mock.calls).toEqual([[0.35]]);
  fireEvent.change(number, { target: { value: "0.33" } });
  expect(number.value).toBe("0.33");
  rerender(<ChartNumberInput {...props} value={0.8} />);
  expect(number.value).toBe("0.8");
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole("slider"), { target: { value: "0.6" } });
  expect(onChange).toHaveBeenLastCalledWith(0.6);
  expect(number.value).toBe("0.6");
});
it("retains caller-expanded opacity maximum and permits fractional any-step values", () => {
  const onChange = vi.fn();
  render(
    <ChartNumberInput
      label="Width"
      value={14}
      min={-10}
      max={14}
      rangeStep={1}
      numberStep="any"
      onChange={onChange}
    />,
  );
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "-2.125" },
  });
  expect(onChange).toHaveBeenLastCalledWith(-2.125);
});

it("preserves caller-expanded opacity values without normalization", () => {
  const onEdit = vi.fn();
  render(
    <ChartSeriesStylePanel
      controls={[{ ...controls[2], value: 2, max: 2 }]}
      onEdit={onEdit}
    />,
  );
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("2");
  expect(screen.getByRole("slider").getAttribute("max")).toBe("2");
  expect(onEdit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("spinbutton"), {
    target: { value: "1.5" },
  });
  expect(onEdit).toHaveBeenLastCalledWith({
    field: "strokeOpacity",
    value: 1.5,
  });
});
