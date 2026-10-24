import merge from "lodash.merge";
import type {
  PrepareNightingaleSelectionInput,
  ResolvedNightingaleStyle,
  NightingaleLabelOrientation,
} from "../compatibility/nightingaleContracts";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { applicationColors } from "./effectiveAppearanceColors";
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
function orientation(value: unknown): NightingaleLabelOrientation {
  if (value !== "fixed" && value !== "parallel" && value !== "perpendicular")
    throw Error("Invalid Nightingale label orientation");
  return value;
}
export function resolveNightingaleAppearance(
  input: PrepareNightingaleSelectionInput,
): ResolvedNightingaleStyle {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const key = "nightingale";
  const defaults = merge(
    {},
    appearanceDefaults({
      ...input,
      seriesIds: input.projection.snapshot.selectedColumnIds.filter((id) =>
        input.projection.snapshot.columns.some(
          (column) => column.id === id && column.role === "number",
        ),
      ),
    }),
    {
      tooltip: { mode: "single" },
      series: {
        strokeWidth: 1,
        fillOpacity: 1,
        label: { color: input.theme.colors.textColor },
      },
      axes: {
        "angle-category": {
          line: { stroke: applicationColors(input.theme.colors).axis, width: 1 },
          label: {
            fontFamily: "Verdana, sans-serif",
            fontSize: 11,
            fontWeight: 400,
            color: input.theme.colors.textColor,
            orientation: "fixed",
          },
        },
        "radius-number": { innerRadiusRatio: 0 },
      },
    },
  );
  const layers = [
    defaults,
    object(input.theme.overrides.common),
    object(input.theme.overrides[key]),
    object(composed.value.common),
    object(composed.value[key]),
  ];
  const effective = merge({}, ...layers);
  const read = (path: string) => at(effective, path);
  // Resolve only reachable Nightingale paint; retained marker/shadow keys stay inactive.
  const paint = {
    strokeWidth: number(read("series.strokeWidth")),
    strokeOpacity: number(read("series.strokeOpacity"), 0, 1),
    fillOpacity: number(read("series.fillOpacity"), 0, 1),
    lineDash: dash(read("series.lineDash")),
    labels: {
      ...font(child(read, "series.label")),
      enabled: bool(read("series.label.enabled")),
    },
  };
  const application = resolveAppearanceChrome(
    layers,
    input.theme.palette,
    paint.strokeWidth,
  );
  const axis = child(read, "axes.angle-category");
  const { strokeWidth, strokeOpacity, fillOpacity, lineDash, labels } = paint;
  return {
    common: {
      textColor: input.theme.colors.textColor,
      fontFamily: application.title.font,
      fontSize: application.title.size,
      precision: input.precision,
    },
    application,
    series: {
      strokeWidth,
      strokeOpacity,
      fillOpacity,
      lineDash,
      labels,
      ...(read("series.fill") === undefined ? {} : { fill: text(read("series.fill")) }),
      ...(read("series.stroke") === undefined
        ? {}
        : { stroke: text(read("series.stroke")) }),
    },
    polarAxis: {
      color: text(axis("line.stroke")),
      thickness: number(axis("line.width")),
      innerRadiusRatio: number(read("axes.radius-number.innerRadiusRatio"), 0, 1),
      labels: {
        ...font(child(axis, "label")),
        orientation: orientation(axis("label.orientation")),
      },
    },
  };
}
