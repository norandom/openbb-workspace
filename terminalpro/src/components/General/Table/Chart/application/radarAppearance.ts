import merge from "lodash.merge";
import type {
  PrepareRadarSelectionInput,
  ResolvedRadarStyle,
  RadarAxisShape,
  RadarLabelOrientation,
} from "../compatibility/radarContracts";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { resolveAppearanceSeries } from "./effectiveAppearanceSeries";
import { applicationColors } from "./effectiveAppearanceColors";
import { at, child, font, number, object, text } from "./effectiveAppearanceValues";
export const radarOptionKey = (family: PrepareRadarSelectionInput["family"]) =>
  family === "radarLine" ? "radar-line" : "radar-area";
function shape(value: unknown): RadarAxisShape {
  if (value !== "circle" && value !== "polygon")
    throw Error("Invalid Radar axis shape");
  return value;
}
function orientation(value: unknown): RadarLabelOrientation {
  if (value !== "fixed" && value !== "parallel" && value !== "perpendicular")
    throw Error("Invalid Radar label orientation");
  return value;
}
export function resolveRadarAppearance(
  input: PrepareRadarSelectionInput,
): ResolvedRadarStyle {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const key = radarOptionKey(input.family);
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
        strokeWidth: 2,
        fillOpacity: input.family === "radarArea" ? 0.8 : 1,
        label: { color: input.theme.colors.textColor },
        marker: { enabled: input.family === "radarLine", size: 6 },
      },
      axes: {
        "angle-category": {
          shape: "polygon",
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
  const paint = resolveAppearanceSeries(child(read, "series"));
  const application = resolveAppearanceChrome(
    layers,
    input.theme.palette,
    paint.strokeWidth,
  );
  const axis = child(read, "axes.angle-category");
  const { shadow: _shadow, connectMissingData: _connect, ...series } = paint;
  return {
    common: {
      textColor: input.theme.colors.textColor,
      fontFamily: application.title.font,
      fontSize: application.title.size,
      precision: input.precision,
    },
    application,
    series: {
      ...series,
      ...(read("series.fill") === undefined ? {} : { fill: text(read("series.fill")) }),
      ...(read("series.stroke") === undefined
        ? {}
        : { stroke: text(read("series.stroke")) }),
    },
    polarAxis: {
      color: text(axis("line.stroke")),
      thickness: number(axis("line.width")),
      shape: shape(axis("shape")),
      innerRadiusRatio: number(read("axes.radius-number.innerRadiusRatio"), 0, 1),
      labels: {
        ...font(child(axis, "label")),
        orientation: orientation(axis("label.orientation")),
      },
    },
  };
}
