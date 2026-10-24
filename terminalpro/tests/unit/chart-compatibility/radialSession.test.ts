import { expect, it } from "vitest";
import { prepareRadialSelection } from "../../../src/components/General/Table/Chart/application/radialSessionSelection";
import type { PrepareRadialSelectionInput } from "../../../src/components/General/Table/Chart/compatibility/radialContracts";
import { appearanceSnapshot } from "./appearance.fixtures";
function radialInput(): PrepareRadialSelectionInput {
  return {
    baseline: {
      stateAddress: "radial",
      chartType: "radialColumn",
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
    family: "radialColumn",
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

import { mapRadialEditorIntent } from "../../../src/components/General/Table/Chart/application/radialEditorTransaction";
import { resolveRadialAssignments } from "../../../src/components/General/Table/Chart/compatibility/radialAssignments";
import type { RadialAcceptedEditIntent } from "../../../src/components/General/Table/Chart/compatibility/radialContracts";
import { radialFamilies, radialOriginalRun2 } from "./fixtures/radialContract";
function selected(input = radialInput()) {
  const result = prepareRadialSelection(input);
  if (!result.valid) throw Error(result.error);
  return result.value;
}
for (const f of radialFamilies) {
  it(`${f.family} retains root absence, selected order, source axes and first-axis controls`, () => {
    const input = { ...radialInput(), family: f.family };
    const before = JSON.stringify(input);
    const v = selected(input);
    expect(v.baseline).toBe(input.baseline);
    expect(v.baseline.model).not.toHaveProperty("seriesGroupType");
    expect(v.mapping.groupType).toBe("grouped");
    expect(v.mapping.snapshot).toBe(input.projection.snapshot);
    expect(v.mapping.assignments).toEqual([
      { colId: "revenue" },
      { colId: "costs" },
    ]);
    expect(v.mapping.style.axes.category.key).toBe(f.categoryAxis);
    expect(v.mapping.style.axes.numerical.key).toBe(f.numericalAxis);
    const observed = radialOriginalRun2[f.family].firstAxisControls;
    expect(v.editor.polarAxis.value).toMatchObject({
      thickness: observed.thickness,
      innerRadiusRatio: observed.innerRadiusRatio,
      paddingInner: 0,
      groupPaddingInner: 0,
      labels: { size: observed.fontSize, orientation: "fixed" },
    });
    expect(v.mapping.style.axes.category.paddingInner).toBe(
      f.sourceDefaults.categoryPaddingInner,
    );
    expect(v.mapping.style.series).toMatchObject({
      strokeWidth: 0,
      strokeOpacity: 1,
      fillOpacity: 1,
    });
    expect(v.mapping.style.application.palette).toEqual(input.theme.palette);
    expect(JSON.stringify(input)).toBe(before);
    const explicit = selected({
      ...input,
      baseline: { ...input.baseline, model: { seriesGroupType: "grouped" } },
    });
    expect(explicit.baseline.model).toHaveProperty(
      "seriesGroupType",
      "grouped",
    );
    expect(
      prepareRadialSelection({
        ...input,
        baseline: { ...input.baseline, model: { seriesGroupType: null } },
      }).valid,
    ).toBe(false);
  });
  it(`${f.family} emits only applicable target paths and separate root mutation`, () => {
    const v = selected({ ...radialInput(), family: f.family });
    for (const field of [
      "color",
      "thickness",
      "innerRadiusRatio",
      "paddingInner",
      "groupPaddingInner",
    ] as const) {
      const value =
        field === "color" ? "#123456" : field === "thickness" ? 3 : 0.3;
      const result = mapRadialEditorIntent(v, {
        panel: "radialPolarAxis",
        edit: { field, value },
      } as RadialAcceptedEditIntent);
      if (!result.valid || result.value.kind !== "options")
        throw Error("No options");
      const axes = result.value.eventOptions[f.optionKey].axes;
      expect(Object.keys(axes)).toEqual(
        v.mapping.style.controls.targets[field],
      );
      expect(axes[Object.keys(axes)[0]]).toEqual(
        field === "color"
          ? { line: { stroke: value } }
          : field === "thickness"
            ? { line: { width: value } }
            : { [field]: value },
      );
    }
    const angular =
      f.family === "radialColumn" ? "angle-category" : "angle-number";
    expect(
      mapRadialEditorIntent(v, {
        panel: "radialPolarLabels",
        edit: { field: "orientation", value: "parallel" },
      }),
    ).toEqual({
      valid: true,
      value: {
        kind: "options",
        eventOptions: {
          [f.optionKey]: {
            axes: {
              [angular]: { label: { orientation: "parallel" } },
            },
          },
        },
      },
    });
    expect(
      mapRadialEditorIntent(v, {
        panel: "radialGroupType",
        edit: { value: "normalized" },
      }),
    ).toEqual({
      valid: true,
      value: { kind: "group-type", seriesGroupType: "normalized" },
    });
  });
  it(`${f.family} keeps saved inactive keys and independent axis paint and font contexts`, () => {
    const input = { ...radialInput(), family: f.family };
    input.baseline.options[f.optionKey] = {
      series: {
        cornerRadius: "inactive",
        marker: { size: "inactive" },
        columnWidthRatio: 0.7,
      },
      axes: {
        [f.categoryAxis]: { label: { fontWeight: 600, fontStyle: "italic" } },
        [f.numericalAxis]: {
          line: { width: 4 },
          label: { fontWeight: 700, fontStyle: "normal" },
        },
      },
    };
    const before = JSON.stringify(input);
    const v = selected(input);
    expect(v.mapping.style.axes.numerical.thickness).toBe(4);
    expect(v.mapping.style.axes.category.thickness).toBe(1);
    const result = mapRadialEditorIntent(v, {
      panel: "radialPolarLabels",
      edit: { field: "weight", value: "predefined" },
    });
    if (!result.valid || result.value.kind !== "options")
      throw Error("No options");
    expect(result.value.eventOptions[f.optionKey].axes).toEqual({
      [f.categoryAxis]: { label: { fontWeight: 600, fontStyle: "italic" } },
      [f.numericalAxis]: { label: { fontWeight: 700, fontStyle: "normal" } },
    });
    expect(JSON.stringify(input)).toBe(before);
    for (const field of [
      "paddingInner",
      "groupPaddingInner",
      "innerRadiusRatio",
    ]) {
      expect(
        mapRadialEditorIntent(v, {
          panel: "radialPolarAxis",
          edit: { field, value: NaN },
        } as RadialAcceptedEditIntent).valid,
      ).toBe(false);
      expect(
        mapRadialEditorIntent(v, {
          panel: "radialPolarAxis",
          edit: { field, value: 1.1 },
        } as RadialAcceptedEditIntent).valid,
      ).toBe(false);
    }
    expect(
      mapRadialEditorIntent(v, {
        panel: "markers",
        edit: {},
      } as unknown as RadialAcceptedEditIntent).valid,
    ).toBe(false);
  });
}
it("validates all assignment entries and retains selected order without truncation", () => {
  const input = {
    chartType: "radialBar",
    valueColumns: [
      { colId: "b", selected: true },
      { colId: "x", selected: false },
      { colId: "a", selected: true },
    ],
  };
  expect(resolveRadialAssignments(input)).toMatchObject({
    status: "resolved",
    assignments: [{ colId: "b" }, { colId: "a" }],
  });
  for (const value of [
    null,
    {},
    { ...input, chartType: "nightingale" },
    { ...input, valueColumns: [{ colId: "", selected: false }] },
    {
      ...input,
      valueColumns: [
        { colId: "x", selected: false },
        { colId: "x", selected: false },
      ],
    },
    { ...input, valueColumns: [{ colId: "x", selected: 1 }] },
    {
      get chartType() {
        throw Error("hostile");
      },
    },
  ])
    expect(resolveRadialAssignments(value).status).toBe("invalid");
  expect(
    resolveRadialAssignments({ ...input, valueColumns: [] }),
  ).toMatchObject({ status: "resolved", assignments: [] });
});

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { RadialControls } from "../../../src/components/General/Table/Chart/editor/radial/RadialControls";
it("projects both padding controls and emits original orientation and padding paths", () => {
  const element = document.createElement("div");
  const root = createRoot(element);
  const edits: RadialAcceptedEditIntent[] = [];
  try {
    flushSync(() =>
      root.render(
        createElement(RadialControls, {
          ...selected().editor.polarAxis,
          onEdit: (intent) => edits.push(intent),
        }),
      ),
    );
    for (const label of [
      "Group Padding",
      "Series Padding",
      "Inner Radius",
      "Orientation",
    ])
      expect(element.textContent).toContain(label);
    for (const label of ["Shape", "Markers", "Shadow", "Group Type"])
      expect(element.textContent).not.toContain(label);
    for (const label of ["Group Padding", "Series Padding", "Inner Radius"])
      expect(
        element
          .querySelector(`input[aria-label="${label}"]`)
          ?.getAttribute("step"),
      ).toBe("0.05");
    const select = element.querySelector(
      'select[aria-label="Orientation"]',
    ) as HTMLSelectElement;
    select.value = "parallel";
    flushSync(() =>
      select.dispatchEvent(new Event("change", { bubbles: true })),
    );
    expect(edits).toEqual([
      {
        panel: "radialPolarLabels",
        edit: { field: "orientation", value: "parallel" },
      },
    ]);
  } finally {
    flushSync(() => root.unmount());
  }
});
it("rejects mismatched family axes and invalid reachable paint without changing the baseline", () => {
  const input = radialInput();
  const v = selected(input);
  const wrong = { ...v, mapping: { ...v.mapping, family: "nightingale" } };
  expect(
    mapRadialEditorIntent(wrong as unknown as typeof v, {
      panel: "radialGroupType",
      edit: { value: "stacked" },
    }).valid,
  ).toBe(false);
  for (const generated of [
    {
      "radial-column": { axes: { "radius-number": { innerRadiusRatio: 1.1 } } },
    },
    {
      "radial-column": {
        axes: { "angle-category": { label: { orientation: "radial" } } },
      },
    },
    { "radial-column": { axes: { "angle-category": { paddingInner: -1 } } } },
    { "radial-column": { series: { columnWidthRatio: NaN } } },
  ])
    expect(prepareRadialSelection({ ...input, generated }).valid).toBe(false);
});

for (const f of radialFamilies) {
  it(`${f.family} defaults explicit user stroke to width one across option layers and honors saved widths`, () => {
    const input = { ...radialInput(), family: f.family };
    expect(selected(input).mapping.style.series.strokeWidth).toBe(0);
    for (const branch of ["common", f.optionKey]) {
      for (const source of ["saved", "generated", "theme"]) {
        for (const width of [undefined, 0, 4]) {
          const series = {
            stroke: "#123456",
            ...(width === undefined ? {} : { strokeWidth: width }),
          };
          const next = {
            ...input,
            baseline: {
              ...input.baseline,
              options: source === "saved" ? { [branch]: { series } } : {},
            },
            generated: source === "generated" ? { [branch]: { series } } : {},
            theme: {
              ...input.theme,
              overrides: source === "theme" ? { [branch]: { series } } : {},
            },
          };
          // Generated common replaces saved common in the existing composition contract.
          const before = JSON.stringify(next);
          const resolved = selected(next).mapping.style.series;
          if (source === "saved" && branch === "common") {
            expect(resolved.strokeWidth).toBe(0);
            expect(resolved).not.toHaveProperty("stroke");
          } else
            expect(resolved).toMatchObject({
              stroke: "#123456",
              strokeWidth: width ?? 1,
            });
          expect(JSON.stringify(next)).toBe(before);
        }
      }
    }
    const neighboring = {
      ...input,
      baseline: {
        ...input.baseline,
        options: { pie: { series: { stroke: "#123456" } } },
      },
    };
    expect(selected(neighboring).mapping.style.series.strokeWidth).toBe(0);
  });
}
