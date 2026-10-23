import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { resolveWaterfallAppearance } from "../../../src/components/General/Table/Chart/application/waterfallAppearance";
import {
  mapWaterfallEdit,
  waterfallControlValues,
} from "../../../src/components/General/Table/Chart/application/waterfallEditorControls";
import type { WaterfallAppearanceInput } from "../../../src/components/General/Table/Chart/application/waterfallTypes";
import { reduceIntegratedState } from "../../../src/components/General/Table/Chart/compatibility/integratedState";
import { WaterfallControls } from "../../../src/components/General/Table/Chart/editor/waterfall/WaterfallControls";
import { sessionFixture } from "../chart-application/applicationSessionFixture";

function waterfallInput(): WaterfallAppearanceInput {
  const fixture = sessionFixture();
  return {
    baseline: fixture.local.baseline,
    generated: {},
    seriesIds: ["delta"],
    precision: 2,
    theme: fixture.inputs.theme,
    axisRuntime: fixture.local.axes,
    paint: {
      positive: { fill: "#123456", stroke: "#234567" },
      negative: { fill: "#abcdef", stroke: "#bcdef0" },
      total: { fill: "#888888", stroke: "#777777" },
      connectorStroke: "#999999",
    },
  };
}
function resolvedWaterfall(input = waterfallInput()) {
  const result = resolveWaterfallAppearance(input);
  if (result.status !== "resolved") throw Error(JSON.stringify(result));
  return result.value;
}

afterEach(cleanup);
it("maps only the edited Waterfall leaves and preserves predefined font pairs", () => {
  const current = resolvedWaterfall();
  expect(
    mapWaterfallEdit({ kind: "connector", field: "lineDash", value: 4 }, current),
  ).toEqual({
    valid: true,
    value: { waterfall: { series: { line: { lineDash: [4] } } } },
  });
  expect(
    mapWaterfallEdit(
      { kind: "item", sign: "negative", field: "strokeWidth", value: 3 },
      current,
    ),
  ).toEqual({
    valid: true,
    value: { waterfall: { series: { item: { negative: { strokeWidth: 3 } } } } },
  });
  expect(
    mapWaterfallEdit(
      {
        kind: "label",
        sign: "positive",
        edit: { field: "weight", value: "boldItalic" },
      },
      current,
    ),
  ).toEqual({
    valid: true,
    value: {
      waterfall: {
        series: {
          item: { positive: { label: { fontWeight: "bold", fontStyle: "italic" } } },
        },
      },
    },
  });
  const source = waterfallInput();
  const saved = resolvedWaterfall({
    ...source,
    generated: {
      waterfall: {
        series: {
          item: { positive: { label: { fontWeight: 650, fontStyle: "oblique" } } },
        },
      },
    },
  });
  expect(
    mapWaterfallEdit(
      {
        kind: "label",
        sign: "positive",
        edit: { field: "weight", value: "predefined" },
      },
      saved,
    ),
  ).toMatchObject({
    valid: true,
    value: {
      waterfall: {
        series: {
          item: { positive: { label: { fontWeight: 650, fontStyle: "oblique" } } },
        },
      },
    },
  });
  expect(
    mapWaterfallEdit(
      { kind: "item", sign: "negative", field: "fillOpacity", value: 4 },
      current,
    ).valid,
  ).toBe(false);
});
it("exposes connector style and local positive/negative selection using existing panels", () => {
  const onEdit = vi.fn();
  render(
    <WaterfallControls
      value={waterfallControlValues(resolvedWaterfall())}
      onEdit={onEdit}
    />,
  );
  expect(screen.queryByRole("combobox", { name: "Direction" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Connector Line" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Series Item" }), {
    target: { value: "negative" },
  });
  const items = screen.getByRole("group", { name: "Series Items" });
  fireEvent.change(
    within(items).getByRole("spinbutton", { name: "Stroke Width value" }),
    { target: { value: "3" } },
  );
  expect(onEdit).toHaveBeenLastCalledWith({
    kind: "item",
    sign: "negative",
    field: "strokeWidth",
    value: 3,
  });
  fireEvent.click(within(items).getByRole("switch", { name: "Labels" }));
  expect(onEdit).toHaveBeenLastCalledWith({
    kind: "label",
    sign: "negative",
    edit: { field: "enabled", value: true },
  });
  expect(within(items).queryByRole("textbox", { name: "Color" })).toBeNull();
  expect(within(items).queryByRole("combobox", { name: "Placement" })).toBeNull();
});
it("preserves unknown saved bags and untouched total/negative settings through the original reducer", () => {
  const saved = {
    future: { nested: [1, 2] },
    waterfall: {
      series: {
        totals: [{ index: 2, future: true }],
        item: {
          total: { name: "Reserve" },
          negative: { label: { placement: "outside-end" } },
          positive: { future: "keep" },
        },
      },
    },
  };
  const before = structuredClone(saved);
  const patch = mapWaterfallEdit(
    { kind: "label", sign: "positive", edit: { field: "font", value: "Custom Serif" } },
    resolvedWaterfall(),
  );
  if (!patch.valid) throw Error(patch.error);
  const result = reduceIntegratedState({
    storage: {},
    stateKey: "a",
    currentModel: {},
    resolvedOptions: saved,
    eventOptions: patch.value,
    chartType: "waterfall",
    totalSeries: 1,
    isPivotMode: false,
  });
  expect(result.a).toMatchObject({
    chartModel: {
      chartOptions: {
        ...saved,
        waterfall: {
          series: {
            ...saved.waterfall.series,
            item: {
              ...saved.waterfall.series.item,
              positive: { future: "keep", label: { fontFamily: "Custom Serif" } },
            },
          },
        },
      },
    },
  });
  expect(saved).toEqual(before);
});
it.each([
  { kind: "direction", value: "horizontal" },
  { kind: "connector", field: "strokeWidth", value: 0 },
  { kind: "connector", field: "strokeOpacity", value: 0.2 },
  { kind: "connector", field: "stroke", value: "#123456" },
  { kind: "item", sign: "positive", field: "lineDash", value: 2 },
] as const)("maps supported leaf %j", (edit) => {
  expect(mapWaterfallEdit(edit, resolvedWaterfall()).valid).toBe(true);
});
it("keeps sign-specific typography in control metadata and emits connector edits separately", () => {
  const input = waterfallInput();
  const resolved = resolvedWaterfall({
    ...input,
    generated: {
      waterfall: {
        series: {
          item: {
            negative: {
              label: {
                enabled: true,
                fontFamily: "A Custom Font",
                fontSize: 19,
                fontWeight: "bold",
                fontStyle: "italic",
              },
            },
          },
        },
      },
    },
  });
  const values = waterfallControlValues(resolved);
  expect(values.items.negative.labels.value).toMatchObject({
    font: "A Custom Font",
    size: 19,
    weight: "boldItalic",
  });
  expect(
    values.items.negative.labels.fonts.some(
      (choice) => choice.value === "A Custom Font",
    ),
  ).toBe(true);
  const onEdit = vi.fn();
  render(<WaterfallControls value={values} onEdit={onEdit} />);
  const connector = screen.getByRole("group", { name: "Connector Line" });
  fireEvent.change(
    within(connector).getByRole("spinbutton", { name: "Stroke Width value" }),
    { target: { value: "0" } },
  );
  expect(onEdit).toHaveBeenLastCalledWith({
    kind: "connector",
    field: "strokeWidth",
    value: 0,
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Series Item" }), {
    target: { value: "negative" },
  });
  const items = screen.getByRole("group", { name: "Series Items" });
  fireEvent.change(within(items).getByRole("combobox", { name: "Weight" }), {
    target: { value: "normal" },
  });
  expect(onEdit).toHaveBeenLastCalledWith({
    kind: "label",
    sign: "negative",
    edit: { field: "weight", value: "normal" },
  });
  expect(screen.queryByRole("combobox", { name: "Total" })).toBeNull();
  expect(within(items).getAllByRole("textbox", { name: "Color" })).toHaveLength(1);
});
