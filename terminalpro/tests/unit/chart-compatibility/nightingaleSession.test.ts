import { expect, it } from "vitest";
import type { PrepareNightingaleSelectionInput } from "../../../src/components/General/Table/Chart/compatibility/nightingaleContracts";
import { appearanceSnapshot } from "./appearance.fixtures";
import { prepareNightingaleSelection } from "../../../src/components/General/Table/Chart/application/nightingaleSessionSelection";
function nightingaleInput(): PrepareNightingaleSelectionInput {
  return {
    baseline: {
      stateAddress: "nightingale",
      chartType: "nightingale",
      model: {},
      options: {},
    },
    range: { columnIds: ["period", "revenue", "costs"], originalRange: null },
    setup: {
      categoryId: "period",
      seriesIds: ["revenue", "costs"],
      switchCategorySeries: false,
    },
    projection: {
      snapshot: appearanceSnapshot,
      valueOrigins: {},
      observationKind: "raw-observations",
      axisUnits: "consistent",
    },
    family: "nightingale",
    theme: {
      name: "ag-default",
      mode: "light",
      colors: {
        base: "ag-default",
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
        textColor: "#111111",
        chartBackgroundColor: "#ffffff",
      },
      overrides: {},
      palette: { fills: ["#112233"], strokes: ["#334455"] },
    },
    generated: {},
    precision: 2,
    display: {
      category: (v) => v,
      numericAxis: (v) => v,
      crosshair: (v) => v,
      legend: (v) => v,
      seriesLabel: (v) => v,
      tooltipNumber: (v) => String(v),
    },
    viewport: { width: 600, height: 400 },
  };
}

import { mapNightingaleEditorIntent } from "../../../src/components/General/Table/Chart/application/nightingaleEditorTransaction";
import type { NightingaleAcceptedEditIntent } from "../../../src/components/General/Table/Chart/compatibility/nightingaleContracts";
function selected(input = nightingaleInput()) {
  const result = prepareNightingaleSelection(input);
  if (!result.valid) throw Error(result.error);
  return result.value;
}
it("preserves selected data, missing points and inactive bytes; only root selects grouping", () => {
  const input = nightingaleInput();
  input.baseline.options.nightingale = {
    series: {
      normalizedTo: 500,
      grouped: true,
      stacked: false,
      marker: { size: "inactive" },
      shadow: { enabled: "inactive" },
    },
  };
  const before = JSON.stringify(input);
  const v = selected(input);
  expect(v.mapping.groupType).toBe("stacked");
  expect(v.mapping.snapshot).toBe(input.projection.snapshot);
  expect(v.mapping.assignments).toEqual([{ colId: "revenue" }, { colId: "costs" }]);
  expect(v.mapping.style.application.palette).toEqual(input.theme.palette);
  expect(v.mapping.style.series).not.toHaveProperty("stroke");
  expect(v.mapping.style.series).not.toHaveProperty("markers");
  expect(v.mapping.style.series).not.toHaveProperty("shadow");
  expect(v.editor).not.toHaveProperty("markers");
  expect(v.editor.polarAxis).not.toHaveProperty("shapes");
  for (const seriesGroupType of ["grouped", "stacked", "normalized"] as const) {
    const next = selected({
      ...input,
      baseline: { ...input.baseline, model: { seriesGroupType } },
    });
    expect(next.mapping.groupType).toBe(seriesGroupType);
    expect(next.mapping.snapshot.rows).toEqual(input.projection.snapshot.rows);
  }
  expect(JSON.stringify(input)).toBe(before);
  expect(
    prepareNightingaleSelection({
      ...input,
      baseline: { ...input.baseline, model: { seriesGroupType: "invalid" } },
    }).valid,
  ).toBe(false);
});
it("separates normalized axis labels from supplied raw/count formatting", () => {
  const input = nightingaleInput();
  const display = {
    ...input.display,
    numericAxis: (v: unknown) => `USD ${v}`,
    tooltipNumber: (v: number) => `raw ${v}`,
  };
  const v = selected({
    ...input,
    display,
    baseline: { ...input.baseline, model: { seriesGroupType: "normalized" } },
  });
  expect(v.mapping.context.radialAxisLabel(100)).toBe(100);
  expect(v.mapping.context.display.tooltipNumber(42)).toBe("raw 42");
  const count = selected({
    ...input,
    projection: { ...input.projection, observationKind: "count" },
  });
  expect(count.mapping.context.observationKind).toBe("count");
  expect(count.mapping.context.display).toBe(input.display);
  expect(count.mapping.context.radialAxisLabel).toBe(input.display.numericAxis);
});
it("returns root mutation separately and applies polar edits to applicable axes", () => {
  const v = selected();
  const before = JSON.stringify(v);
  expect(
    mapNightingaleEditorIntent(v, {
      panel: "nightingaleGroupType",
      edit: { value: "normalized" },
    }),
  ).toEqual({
    valid: true,
    value: { kind: "group-type", seriesGroupType: "normalized" },
  });
  for (const [field, value, leaf] of [
    ["thickness", 3, { line: { width: 3 } }],
    ["innerRadiusRatio", 0.25, { innerRadiusRatio: 0.25 }],
  ] as const)
    expect(
      mapNightingaleEditorIntent(v, {
        panel: "nightingalePolarAxis",
        edit: { field, value },
      }),
    ).toEqual({
      valid: true,
      value: {
        kind: "options",
        eventOptions: {
          nightingale: { axes: { "angle-category": leaf, "radius-number": leaf } },
        },
      },
    });
  expect(
    mapNightingaleEditorIntent(v, {
      panel: "nightingalePolarLabels",
      edit: { field: "orientation", value: "parallel" },
    }),
  ).toEqual({
    valid: true,
    value: {
      kind: "options",
      eventOptions: {
        nightingale: {
          axes: { "angle-category": { label: { orientation: "parallel" } } },
        },
      },
    },
  });
  expect(JSON.stringify(v)).toBe(before);
});
it("rejects malformed and neighboring controls without mutation", () => {
  const v = selected();
  const before = JSON.stringify(v);
  for (const intent of [
    { panel: "markers", edit: { field: "enabled", value: true } },
    { panel: "shadow", edit: { field: "enabled", value: true } },
    { panel: "nightingalePolarAxis", edit: { field: "shape", value: "circle" } },
    {
      panel: "nightingalePolarAxis",
      edit: { field: "innerRadiusRatio", value: Number.NaN },
    },
    { panel: "nightingalePolarAxis", edit: { field: "innerRadiusRatio", value: 1.1 } },
    { panel: "nightingalePolarAxis", edit: { field: "thickness", value: -1 } },
    {
      panel: "nightingalePolarLabels",
      edit: { field: "orientation", value: "radial" },
    },
    { panel: "nightingaleGroupType", edit: { value: "grouped", extra: true } },
    {
      panel: "titles",
      edit: { caption: "horizontalAxisTitle", field: "text", value: "x" },
    },
    {
      get panel() {
        throw Error("hostile");
      },
      edit: {},
    },
    null,
  ])
    expect(
      mapNightingaleEditorIntent(v, intent as NightingaleAcceptedEditIntent).valid,
    ).toBe(false);
  expect(JSON.stringify(v)).toBe(before);
});
it("projects original defaults and common control patches", () => {
  const v = selected();
  expect(v.mapping.style.polarAxis).toMatchObject({
    thickness: 1,
    innerRadiusRatio: 0,
    labels: { orientation: "fixed", size: 11 },
  });
  expect(v.mapping.style.series).toMatchObject({
    strokeWidth: 1,
    fillOpacity: 1,
    strokeOpacity: 1,
    lineDash: [0],
  });
  expect(v.editor.series.controls.map((c) => c.field)).toEqual([
    "strokeWidth",
    "lineDash",
    "strokeOpacity",
    "fillOpacity",
  ]);
  for (const [panel, edit, leaf] of [
    ["padding", { side: "top", value: 35 }, { padding: { top: 35 } }],
    [
      "background",
      { field: "fill", value: "#112233" },
      { background: { fill: "#112233" } },
    ],
    ["tooltips", { field: "mode", value: "compact" }, { tooltip: { mode: "compact" } }],
    ["series", { field: "lineDash", value: 4 }, { series: { lineDash: [4] } }],
    [
      "labels",
      { field: "enabled", value: true },
      { series: { label: { enabled: true } } },
    ],
    [
      "titles",
      { caption: "title", field: "text", value: "Costs" },
      { title: { text: "Costs" } },
    ],
    [
      "legend",
      { field: "position", value: "right" },
      { legend: { position: "right" } },
    ],
  ] as const)
    expect(
      mapNightingaleEditorIntent(v, { panel, edit } as NightingaleAcceptedEditIntent),
    ).toEqual({
      valid: true,
      value: { kind: "options", eventOptions: { nightingale: leaf } },
    });
});

it("composes family precedence, rejects invalid reachable values and preserves predefined fonts", () => {
  const input = nightingaleInput();
  const options = {
    common: { series: { strokeWidth: 99 } },
    nightingale: {
      series: { strokeWidth: 4 },
      axes: { "angle-category": { label: { fontWeight: 600, fontStyle: "italic" } } },
    },
    pie: { series: { innerRadiusRatio: 0.9 } },
  };
  const v = selected({
    ...input,
    baseline: { ...input.baseline, options },
    generated: { common: { series: { strokeWidth: 3 } } },
  });
  expect(v.mapping.style.series.strokeWidth).toBe(4);
  expect(
    mapNightingaleEditorIntent(v, {
      panel: "nightingalePolarLabels",
      edit: { field: "weight", value: "predefined" },
    }),
  ).toEqual({
    valid: true,
    value: {
      kind: "options",
      eventOptions: {
        nightingale: {
          axes: {
            "angle-category": { label: { fontWeight: 600, fontStyle: "italic" } },
            "radius-number": { label: { fontWeight: 600, fontStyle: "italic" } },
          },
        },
      },
    },
  });
  for (const axes of [
    { "radius-number": { innerRadiusRatio: 1.1 } },
    { "angle-category": { label: { orientation: "radial" } } },
    { "angle-category": { line: { width: -1 } } },
  ])
    expect(
      prepareNightingaleSelection({ ...input, generated: { nightingale: { axes } } })
        .valid,
    ).toBe(false);
});

it("rejects null root grouping rather than treating malformed storage as an absent default", () => {
  const input = nightingaleInput();
  expect(
    prepareNightingaleSelection({
      ...input,
      baseline: { ...input.baseline, model: { seriesGroupType: null } },
    }).valid,
  ).toBe(false);
});

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NightingaleControls } from "../../../src/components/General/Table/Chart/editor/nightingale/NightingaleControls";
it("reuses the original polar layout and emits the existing orientation intent", () => {
  const element = document.createElement("div");
  const root = createRoot(element);
  const edits: NightingaleAcceptedEditIntent[] = [];
  try {
    flushSync(() =>
      root.render(
        createElement(NightingaleControls, {
          ...selected().editor.polarAxis,
          onEdit: (intent) => edits.push(intent),
        }),
      ),
    );
    for (const label of [
      "Polar Axis",
      "Thickness",
      "Inner Radius",
      "Labels",
      "Font",
      "Weight",
      "Size",
      "Orientation",
    ])
      expect(element.textContent).toContain(label);
    for (const label of [
      "Shape",
      "Group Type",
      "Group Padding",
      "Series Padding",
      "Shadow",
      "Markers",
    ])
      expect(element.textContent).not.toContain(label);
    expect(
      element.querySelector('input[aria-label="Inner Radius"]')?.getAttribute("step"),
    ).toBe("0.05");
    const select = element.querySelector(
      'select[aria-label="Orientation"]',
    ) as HTMLSelectElement;
    select.value = "parallel";
    flushSync(() => select.dispatchEvent(new Event("change", { bubbles: true })));
    expect(edits).toEqual([
      {
        panel: "nightingalePolarLabels",
        edit: { field: "orientation", value: "parallel" },
      },
    ]);
  } finally {
    flushSync(() => root.unmount());
  }
});
