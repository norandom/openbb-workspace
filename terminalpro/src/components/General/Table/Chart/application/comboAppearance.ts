import type { ComboSeriesAssignment } from "../compatibility/comboAssignments";
import type { ValidationResult } from "../compatibility/legacyTypes";
import type { CartesianFamily } from "../echarts/cartesianTypes";
import type { ComboGeometry, ResolvedComboStyle } from "../echarts/comboTypes";
import type {
  AppearanceInput,
  ApplicationResolvedStyle,
} from "./appearanceModel";
import type { ApplicationConcreteAxis } from "./axisStructureTypes";
import { resolveApplicationAppearance } from "./effectiveAppearance";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { appearanceLayers } from "./effectiveAppearanceLayers";

export interface ComboConcreteAxis extends ApplicationConcreteAxis {
  readonly key: string;
  readonly colId?: string;
}
export type ComboAppearanceInput = Omit<
  AppearanceInput,
  "family" | "axisRuntime"
> & {
  readonly assignments: readonly Readonly<ComboSeriesAssignment>[];
  readonly concreteAxes?: readonly ComboConcreteAxis[];
};
export interface ComboAppearanceSelection {
  readonly style: ResolvedComboStyle;
  readonly views: Partial<
    Readonly<Record<ComboGeometry, ApplicationResolvedStyle>>
  >;
  readonly axes: readonly ComboConcreteAxis[];
}
export const COMBO_GEOMETRIES: readonly ComboGeometry[] = [
  "area",
  "bar",
  "line",
];
export function comboGeometry(
  type: ComboSeriesAssignment["chartType"],
): ComboGeometry {
  return type === "area" || type === "stackedArea"
    ? "area"
    : type === "line"
      ? "line"
      : "bar";
}
export function comboGeometryFamily(geometry: ComboGeometry): CartesianFamily {
  return geometry === "bar" ? "groupedColumn" : geometry;
}
export function activeComboGeometries(
  assignments: readonly Readonly<ComboSeriesAssignment>[],
  ids: readonly string[],
): readonly ComboGeometry[] {
  return COMBO_GEOMETRIES.filter((geometry) =>
    assignments.some(
      (a) => ids.includes(a.colId) && comboGeometry(a.chartType) === geometry,
    ),
  );
}
function selectedAssignments(input: ComboAppearanceInput) {
  if (
    !input.seriesIds.length ||
    new Set(input.seriesIds).size !== input.seriesIds.length
  )
    throw new Error("Combo appearance needs unique selected series");
  return input.seriesIds.map((id) => {
    const matches = input.assignments.filter((a) => a.colId === id);
    if (matches.length !== 1)
      throw new Error("Missing or duplicate combo assignment");
    const assignment = matches[0];
    if (
      ![
        "line",
        "area",
        "stackedArea",
        "groupedColumn",
        "stackedColumn",
      ].includes(assignment.chartType)
    )
      throw new Error("Invalid combo series type");
    if (
      assignment.secondaryAxis !== undefined &&
      typeof assignment.secondaryAxis !== "boolean"
    )
      throw new Error("Invalid secondary axis flag");
    if (
      assignment.secondaryAxis &&
      !["line", "area"].includes(assignment.chartType)
    )
      throw new Error("Invalid secondary geometry");
    return assignment;
  });
}
function concreteAxes(
  input: ComboAppearanceInput,
  selected: readonly Readonly<ComboSeriesAssignment>[],
): readonly ComboConcreteAxis[] {
  const axes: ComboConcreteAxis[] = [
    {
      key: "category",
      id: "category",
      direction: "x",
      type: "category",
      position: "bottom",
      options: {},
    },
  ];
  if (selected.some((a) => !a.secondaryAxis))
    axes.push({
      key: "primary",
      id: "number",
      direction: "y",
      type: "number",
      position: "left",
      options: {},
    });
  for (const assignment of selected.filter((a) => a.secondaryAxis))
    axes.push({
      key: `secondary:${assignment.colId}`,
      colId: assignment.colId,
      id: "number",
      direction: "y",
      type: "number",
      position: "right",
      options: {},
    });
  if (!input.concreteAxes) return axes;
  if (input.concreteAxes.length !== axes.length)
    throw new Error("Changed combo concrete axis grouping");
  return axes.map((expected, index) => {
    const axis = input.concreteAxes![index];
    if (
      axis.key !== expected.key ||
      axis.id !== expected.id ||
      axis.direction !== expected.direction ||
      axis.colId !== expected.colId
    )
      throw new Error("Changed combo concrete axis identity");
    if (
      !(
        axis.direction === "x" ? ["category", "number", "time"] : ["number"]
      ).includes(axis.type)
    )
      throw new Error("Invalid combo concrete axis type");
    if (
      !(
        axis.direction === "x" ? ["top", "bottom"] : ["left", "right"]
      ).includes(axis.position)
    )
      throw new Error("Invalid combo concrete axis position");
    return axis;
  });
}
export function resolveComboAppearance(
  input: ComboAppearanceInput,
): ValidationResult<ComboAppearanceSelection> {
  try {
    const selected = selectedAssignments(input);
    const axes = concreteAxes(input, selected);
    const active = activeComboGeometries(selected, input.seriesIds);
    const views: Partial<Record<ComboGeometry, ApplicationResolvedStyle>> = {};
    for (const geometry of active) {
      const resolved = resolveApplicationAppearance({
        ...input,
        family: comboGeometryFamily(geometry),
        axisRuntime: { axes: axes.slice(0, 2), categoryAxisType: axes[0].type },
      });
      if (!resolved.valid) throw new Error(resolved.error);
      views[geometry] = resolved.value;
    }
    const canonical = views[active[0]]!;
    const layerInput: AppearanceInput = {
      ...input,
      family: comboGeometryFamily(active[0]),
      axisRuntime: { axes: axes.slice(0, 2), categoryAxisType: axes[0].type },
    };
    const layers = appearanceLayers(layerInput);
    const resolvedAxes = axes.map((axis) =>
      resolveAppearanceAxis(layers, axis),
    );
    const secondary = Object.fromEntries(
      axes.flatMap((axis, i) =>
        axis.colId === undefined ? [] : [[axis.colId, resolvedAxes[i]]],
      ),
    );
    const primaryIndex = axes.findIndex((axis) => axis.key === "primary");
    const { application, series: _series, line: _line, ...common } = canonical;
    const { series: _applicationSeries, axes: _axes, ...shared } = application;
    for (const geometry of active) {
      const view = views[geometry]!;
      views[geometry] = {
        ...view,
        ...common,
        application: {
          ...view.application,
          ...shared,
          axes: { category: resolvedAxes[0], number: resolvedAxes[1] },
        },
      };
    }
    return {
      valid: true,
      value: {
        axes,
        views,
        style: {
          common,
          application: shared,
          geometry: Object.fromEntries(
            active.map((geometry) => [
              geometry,
              {
                series: views[geometry]!.application.series,
                overrides: views[geometry]!.series,
              },
            ]),
          ),
          axes: {
            category: resolvedAxes[0],
            ...(primaryIndex < 0
              ? {}
              : { primary: resolvedAxes[primaryIndex] }),
            secondary,
          },
        },
      },
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? error.message : "Invalid combo appearance",
    };
  }
}
