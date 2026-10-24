import merge from "lodash.merge";
import type {
  PrepareRadialSelectionInput,
  RadialAxisKey,
  RadialControlTargets,
  RadialLabelOrientation,
  ResolvedRadialStyle,
} from "../compatibility/radialContracts";
import { composeAppearanceOptions } from "./appearanceComposition";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { applicationColors } from "./effectiveAppearanceColors";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import {
  at,
  bool,
  child,
  dash,
  font,
  number,
  object,
  text,
} from "./effectiveAppearanceValues";

function orientation(value: unknown): RadialLabelOrientation {
  if (value !== "fixed" && value !== "parallel" && value !== "perpendicular")
    throw Error("Invalid Radial label orientation");
  return value;
}
export function radialControlTargets(family: string): RadialControlTargets {
  if (family !== "radialColumn" && family !== "radialBar")
    throw Error("Invalid Radial family");
  const column = family === "radialColumn";
  const both: RadialAxisKey[] = column
    ? ["angle-category", "radius-number"]
    : ["angle-number", "radius-category"];
  const category: RadialAxisKey[] = [
    column ? "angle-category" : "radius-category",
  ];
  return {
    color: both,
    thickness: both,
    innerRadiusRatio: both,
    paddingInner: category,
    groupPaddingInner: category,
    labelTypography: both,
    labelOrientation: [column ? "angle-category" : "angle-number"],
  };
}
function defaults(input: PrepareRadialSelectionInput, userStroke: boolean) {
  const column = input.family === "radialColumn";
  const paint = {
    line: { stroke: applicationColors(input.theme.colors).axis, width: 1 },
    innerRadiusRatio: column ? 0.5 : 0.2,
    label: {
      fontFamily: "Verdana, sans-serif",
      fontSize: column ? 11 : 12,
      fontWeight: 400,
      color: input.theme.colors.textColor,
    },
  };
  const category = {
    ...paint,
    paddingInner: column ? 0 : 0.2,
    groupPaddingInner: column ? 0 : 0.2,
    paddingOuter: column ? 0 : 0.1,
  };
  const angular = {
    ...paint,
    paddingInner: 0,
    groupPaddingInner: 0,
    label: { ...paint.label, orientation: "fixed" },
  };
  return merge(
    {},
    appearanceDefaults({ ...input, seriesIds: input.setup.seriesIds }),
    {
      tooltip: { mode: "single" },
      series: {
        strokeWidth: userStroke ? 1 : 0,
        fillOpacity: 1,
        columnWidthRatio: 0.5,
        maxColumnWidthRatio: 0.5,
        label: {
          color: column
            ? input.theme.colors.textColor
            : input.theme.colors.chartBackgroundColor,
        },
      },
      axes: column
        ? {
            "angle-category": merge({}, category, angular),
            "radius-number": paint,
          }
        : { "angle-number": angular, "radius-category": category },
    },
  );
}
function axisPaint(read: (path: string) => unknown, angular: boolean) {
  return {
    color: text(read("line.stroke")),
    thickness: number(read("line.width")),
    innerRadiusRatio: number(read("innerRadiusRatio"), 0, 1),
    labels: {
      ...font(child(read, "label")),
      ...(angular
        ? { orientation: orientation(read("label.orientation")) }
        : {}),
    },
  };
}
function resolveAxes(
  effective: object,
  column: boolean,
): ResolvedRadialStyle["axes"] {
  const categoryKey = column ? "angle-category" : "radius-category";
  const numericalKey = column ? "radius-number" : "angle-number";
  const categoryRead = (path: string) =>
    at(effective, `axes.${categoryKey}.${path}`);
  const numericalRead = (path: string) =>
    at(effective, `axes.${numericalKey}.${path}`);
  const category = {
    ...axisPaint(categoryRead, column),
    paddingInner: number(categoryRead("paddingInner"), 0, 1),
    groupPaddingInner: number(categoryRead("groupPaddingInner"), 0, 1),
    paddingOuter: number(categoryRead("paddingOuter"), 0, 1),
  };
  const numerical = axisPaint(numericalRead, !column);
  return column
    ? {
        category: { ...category, key: "angle-category" },
        numerical: { ...numerical, key: "radius-number" },
      }
    : {
        category: { ...category, key: "radius-category" },
        numerical: { ...numerical, key: "angle-number" },
      };
}
export function resolveRadialAppearance(
  input: PrepareRadialSelectionInput,
): ResolvedRadialStyle {
  const targets = radialControlTargets(input.family);
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const column = input.family === "radialColumn";
  const key = column ? "radial-column" : "radial-bar";
  const layers = [
    object(input.theme.overrides.common),
    object(input.theme.overrides[key]),
    object(composed.value.common),
    object(composed.value[key]),
  ];
  // Palette strokes do not opt into a visible border; explicit user strokes do.
  layers.unshift(
    defaults(
      input,
      layers.some((layer) => at(layer, "series.stroke") !== undefined),
    ),
  );
  const effective = merge({}, ...layers);
  const read = (path: string) => at(effective, path);
  const series = {
    strokeWidth: number(read("series.strokeWidth")),
    strokeOpacity: number(read("series.strokeOpacity"), 0, 1),
    fillOpacity: number(read("series.fillOpacity"), 0, 1),
    lineDash: dash(read("series.lineDash")),
    labels: {
      ...font(child(read, "series.label")),
      enabled: bool(read("series.label.enabled")),
    },
    ...(read("series.fill") === undefined
      ? {}
      : { fill: text(read("series.fill")) }),
    ...(read("series.stroke") === undefined
      ? {}
      : { stroke: text(read("series.stroke")) }),
  };
  const application = resolveAppearanceChrome(
    layers,
    input.theme.palette,
    series.strokeWidth,
  );
  const axes = resolveAxes(effective, column);
  const first = child(
    read,
    `axes.${column ? "angle-category" : "angle-number"}`,
  );
  return {
    common: {
      textColor: input.theme.colors.textColor,
      fontFamily: application.title.font,
      fontSize: application.title.size,
      precision: input.precision,
    },
    application,
    series,
    axes,
    ...(column
      ? {
          column: {
            columnWidthRatio: number(read("series.columnWidthRatio"), 0, 1),
            maxColumnWidthRatio: number(
              read("series.maxColumnWidthRatio"),
              0,
              1,
            ),
          },
        }
      : {}),
    controls: {
      targets,
      value: {
        ...axisPaint(first, true),
        labels: {
          ...font(child(first, "label")),
          orientation: orientation(first("label.orientation")),
        },
        paddingInner: number(first("paddingInner"), 0, 1),
        groupPaddingInner: number(first("groupPaddingInner"), 0, 1),
      },
    },
  };
}
