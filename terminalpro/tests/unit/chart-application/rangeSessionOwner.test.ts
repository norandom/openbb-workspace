import get from "lodash/get";
import { expect, it } from "vitest";
import type { ApplicationChartCommand } from "../../../src/components/General/Table/Chart/application/applicationChartSessionTypes";
import type { ApplicationSessionContext } from "../../../src/components/General/Table/Chart/application/applicationSessionTypes";
import { applyRangeEditorTransaction } from "../../../src/components/General/Table/Chart/application/rangeEditorTransaction";
import { selectRangeSession } from "../../../src/components/General/Table/Chart/application/rangeSessionSelection";
import { sessionFixture } from "./applicationSessionFixture";

function source(
  family: "rangeBar" | "rangeArea" = "rangeArea",
): ApplicationSessionContext<"rangeBar" | "rangeArea"> {
  const context = sessionFixture();
  return {
    ...context,
    inputs: { ...context.inputs, family },
    local: {
      ...context.local,
      baseline: { ...context.local.baseline, chartType: family },
    },
    capture: {
      ...context.capture,
      rows: context.capture.rows.map((row) => ({
        ...row,
        boxPlotAggregationKey: String(row.category),
      })),
      rangeCategory: {
        categoryColumnId: "period",
        columnChartDataType: "number",
        firstCategoryIsDate: false,
        kind: "number" as const,
      },
    },
  };
}
it("selects statistical observations and retains Area controls and category semantics", () => {
  const selected = selectRangeSession({}, source());
  expect(selected.projection.snapshot.rows).toHaveLength(2);
  expect(selected.rangeAppearance.axisRuntime.categoryAxisType).toBe("number");
  expect(selected.editor.eligibility).toMatchObject({
    labels: true,
    markers: true,
    connectMissingData: true,
    shadow: true,
  });
  expect(selected.editor.series.controls[0].label).toBe("Line Width");
});
it("persists the native category preference and dashed axis options for a fresh owner", () => {
  const context = source();
  const changed = applyRangeEditorTransaction({}, context, {
    family: "rangeArea",
    stamp: context.local.stamp,
    intent: {
      panel: "axisStructure",
      axis: "category",
      edit: { field: "type", value: "category" },
    },
  });
  expect(changed.status).toBe("ready");
  if (changed.status !== "ready") return;
  const reopened = selectRangeSession(changed.value.storage, source());
  expect(reopened.baseline.model.categoryAxisType).toBe("category");
  expect(reopened.rangeAppearance.axisRuntime.categoryAxisType).toBe("category");
});
it("rebinds Bar physical axes on direction edits and retains original hidden controls", () => {
  const context = source("rangeBar");
  const positioned = applyRangeEditorTransaction({}, context, {
    family: "rangeBar",
    stamp: context.local.stamp,
    intent: {
      panel: "axisStructure",
      axis: "category",
      edit: { field: "position", value: "top" },
    },
  });
  expect(positioned.status).toBe("ready");
  if (positioned.status !== "ready") return;
  const changed = applyRangeEditorTransaction(
    positioned.value.storage,
    { ...context, local: positioned.value.local },
    {
      family: "rangeBar",
      stamp: context.local.stamp,
      intent: { panel: "range", edit: { kind: "direction", value: "horizontal" } },
    },
  );
  expect(changed.status).toBe("ready");
  if (changed.status !== "ready") return;
  const selected = selectRangeSession(changed.value.storage, {
    ...context,
    local: changed.value.local,
  });
  expect(selected.bindings.category.direction).toBe("y");
  expect(selected.editor.eligibility.axes.category).toMatchObject({
    type: false,
    ticks: false,
  });
  expect(selected.editor.eligibility.axes.number.ticks).toBe(false);
});
it("does not infer numerical selector eligibility from normalized native Dates", () => {
  const context = source();
  const selected = selectRangeSession(
    {},
    {
      ...context,
      capture: {
        ...context.capture,
        rangeCategory: {
          categoryColumnId: "period",
          columnChartDataType: null,
          firstCategoryIsDate: true,
          kind: "time",
        },
      },
    },
  );
  expect(selected.editor.eligibility.axes.category.type).toBe(false);
  expect(selected.editor.eligibility.axes.category.timeFormat).toBe(true);
});
it("rejects missing provenance and stale category preferences", () => {
  const context = source();
  const { rangeCategory: _facts, ...capture } = context.capture;
  expect(() => selectRangeSession({}, { ...context, capture })).toThrow(/provenance/);
  const storage = {
    partition: {
      chartModel: {
        ...context.local.baseline.model,
        chartType: "rangeArea",
        categoryAxisType: "category",
      },
    },
  };
  expect(
    applyRangeEditorTransaction(storage, context, {
      family: "rangeArea",
      stamp: context.local.stamp,
      intent: { panel: "range", edit: { kind: "labelPadding", value: 2 } },
    }).status,
  ).toBe("stale");
});
it("retains saved siblings and advanced interval arrays through common and specialized edits", () => {
  const context = source("rangeBar");
  const baseline = {
    ...context.local.baseline,
    options: {
      vendor: { retained: [1, 2, 3] },
      "range-bar": {
        series: { label: { padding: 7 } },
        axes: {
          number: {
            left: { interval: { values: [-10, 0, 10] }, nice: false, reverse: true },
          },
        },
      },
    },
  };
  const changed = applyRangeEditorTransaction(
    {},
    { ...context, local: { ...context.local, baseline } },
    {
      family: "rangeBar",
      stamp: context.local.stamp,
      intent: { panel: "labels", edit: { field: "enabled", value: true } },
    },
  );
  expect(changed.status).toBe("ready");
  if (changed.status !== "ready") return;
  const reopened = selectRangeSession(changed.value.storage, source("rangeBar"));
  expect(reopened.baseline.options.vendor).toEqual({ retained: [1, 2, 3] });
  expect(reopened.rangeAppearance.valuePolicy).toMatchObject({
    nice: false,
    reverse: true,
    interval: { values: [-10, 0, 10] },
  });
  expect(reopened.editor.labels.value.enabled).toBe(true);
  expect(reopened.rangeEditor.controls.labelPadding).toBe(7);
});
it("uses saved over generated over theme series and preserves an empty selection", () => {
  const context = source();
  const selected = selectRangeSession(
    {},
    {
      ...context,
      inputs: {
        ...context.inputs,
        range: { columnIds: ["period"], originalRange: { columns: ["period"] } },
        generated: { "range-area": { series: { strokeWidth: 4 } } },
        theme: {
          ...context.inputs.theme,
          overrides: { "range-area": { series: { strokeWidth: 2 } } },
        },
      },
      local: {
        ...context.local,
        range: { ...context.local.range, columnIds: ["period"] },
        baseline: {
          ...context.local.baseline,
          options: {
            "range-area": {
              series: {
                strokeWidth: 8,
                interpolation: { type: "smooth", tension: 0.3 },
              },
            },
          },
        },
      },
    },
  );
  expect(selected.setup.seriesIds).toEqual([]);
  expect(selected.editor.series.controls[0].value).toBe(8);
  expect(selected.rangeEditor.controls.interpolation).toEqual({
    type: "smooth",
    tension: 0.3,
  });
});
it("persists physical positions and time formatting under Range options on fresh reopen", () => {
  let context = source();
  let storage = {};
  for (const intent of [
    {
      panel: "axisStructure",
      axis: "category",
      edit: { field: "position", value: "top" },
    },
    {
      panel: "axisStructure",
      axis: "category",
      edit: { field: "type", value: "time" },
    },
    {
      panel: "axisStructure",
      axis: "category",
      edit: { field: "timeFormat", value: "%Y" },
    },
  ] as const) {
    const changed = applyRangeEditorTransaction(storage, context, {
      family: "rangeArea",
      stamp: context.local.stamp,
      intent,
    });
    expect(changed.status).toBe("ready");
    if (changed.status !== "ready") return;
    storage = changed.value.storage;
    context = { ...context, local: changed.value.local };
  }
  const reopened = selectRangeSession(storage, source());
  expect(reopened.rangeAppearance.axisRuntime.axes[0]).toMatchObject({
    type: "time",
    position: "top",
  });
  expect(reopened.editor.axes.category.fields.value.timeFormat).toBe("%Y");
});
it("commits every retained common panel through latest Range selection and fresh reopen", () => {
  let context = source();
  let storage = {};
  const cases: readonly [ApplicationChartCommand["intent"], string, unknown][] = [
    [
      {
        panel: "titles",
        edit: { caption: "title", field: "text", value: "Financial range" },
      },
      "titles.value.title.text",
      "Financial range",
    ],
    [
      { panel: "legend", edit: { field: "enabled", value: false } },
      "legend.value.enabled",
      false,
    ],
    [{ panel: "padding", edit: { side: "left", value: 31 } }, "padding.value.left", 31],
    [
      { panel: "background", edit: { field: "fill", value: "#123456" } },
      "background.value.fill",
      "#123456",
    ],
    [
      { panel: "tooltips", edit: { field: "mode", value: "single" } },
      "tooltips.value.mode",
      "single",
    ],
    [
      { panel: "series", edit: { field: "strokeWidth", value: 3 } },
      "series.controls.0.value",
      3,
    ],
    [
      { panel: "shadow", edit: { field: "enabled", value: true } },
      "shadow.value.enabled",
      true,
    ],
    [
      { panel: "labels", edit: { field: "enabled", value: true } },
      "labels.value.enabled",
      true,
    ],
    [
      { panel: "markers", edit: { field: "enabled", value: true } },
      "markers.value.enabled",
      true,
    ],
    [{ panel: "connectMissingData", value: true }, "connectMissingData", true],
    [
      { panel: "axis", axis: "number", edit: { field: "thickness", value: 3 } },
      "axes.number.fields.value.thickness",
      3,
    ],
    [
      { panel: "axisLabels", axis: "category", edit: { field: "rotation", value: 25 } },
      "axes.category.labels.value.rotation",
      25,
    ],
    [
      { panel: "grid", axis: "number", edit: { field: "enabled", value: false } },
      "axes.number.grid.value.enabled",
      false,
    ],
    [
      { panel: "ticks", axis: "number", edit: { field: "length", value: 8 } },
      "axes.number.ticks.value.length",
      8,
    ],
  ];
  for (const [intent, path, expected] of cases) {
    const changed = applyRangeEditorTransaction(storage, context, {
      family: "rangeArea",
      stamp: context.local.stamp,
      intent,
    });
    expect(changed.status, JSON.stringify(changed)).toBe("ready");
    if (changed.status !== "ready") return;
    storage = changed.value.storage;
    context = { ...context, local: changed.value.local };
    expect(get(selectRangeSession(storage, source()).editor, path), path).toEqual(
      expected,
    );
  }
});
