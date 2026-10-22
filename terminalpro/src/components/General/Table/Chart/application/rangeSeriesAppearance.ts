import { color } from "echarts";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { OptionBaseline } from "../compatibility/optionStateTypes";
import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import type {
  RangeAreaFieldStyle,
  RangeAreaInterpolation,
} from "../echarts/rangeAreaTypes";
import type { RangeBarFieldStyle } from "../echarts/rangeBarTypes";
import type { ApplicationThemeInput } from "./appearanceModel";
import { bool, dash, font, number, object, text } from "./effectiveAppearanceValues";
import {
  prepareRangeSeriesOptions,
  RangeAppearanceUnsupported,
} from "./rangeSeriesAppearanceOptions";

export interface RangeSeriesAppearanceInput {
  readonly family: "rangeBar" | "rangeArea";
  readonly baseline: OptionBaseline;
  readonly generated: RuntimeOptions;
  readonly theme: ApplicationThemeInput;
  readonly seriesIds: readonly string[];
}
export type RangeSeriesAppearanceResult =
  | {
      readonly status: "resolved";
      readonly family: "rangeBar";
      readonly direction: "vertical" | "horizontal";
      readonly fields: Readonly<Record<string, RangeBarFieldStyle>>;
      readonly configuredVisible: boolean;
    }
  | {
      readonly status: "resolved";
      readonly family: "rangeArea";
      readonly fields: Readonly<Record<string, RangeAreaFieldStyle>>;
      readonly configuredVisible: boolean;
    }
  | {
      readonly status: "invalid" | "unsupported";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };

function paint(value: unknown): string {
  if (value !== null && typeof value === "object")
    throw new RangeAppearanceUnsupported(
      "Range paint requires a supported string color",
    );
  const result = text(value);
  if (!color.parse(result)) throw Error("Invalid Range color");
  return result;
}

function labelStyle(value: unknown): RangeBarFieldStyle["label"] {
  const label = object(value);
  const placement = label.placement;
  if (placement !== "inside" && placement !== "outside")
    throw Error("Invalid Range label placement");
  paint(label.color);
  const typography = font((key) => label[key]);
  return {
    ...typography,
    enabled: bool(label.enabled),
    placement,
    spacing: number(label.spacing),
    padding: number(label.padding),
  };
}

function bandStyle(
  series: RuntimeOptions,
  fill: string,
  stroke: string,
): RangeBarFieldStyle {
  const lineDash = dash(series.lineDash);
  for (const value of lineDash) number(value);
  return {
    fill: paint(series.fill === undefined ? fill : series.fill),
    stroke: paint(series.stroke === undefined ? stroke : series.stroke),
    fillOpacity: number(series.fillOpacity, 0, 1),
    strokeOpacity: number(series.strokeOpacity, 0, 1),
    strokeWidth: number(series.strokeWidth),
    lineDash,
    lineDashOffset: number(series.lineDashOffset, Number.NEGATIVE_INFINITY),
    label: labelStyle(series.label),
  };
}

function markerStyle(
  value: unknown,
  fill: string,
  stroke: string,
): RangeAreaFieldStyle["marker"] {
  const marker = object(value);
  const shape = marker.shape;
  if (
    !["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].includes(
      text(shape),
    )
  )
    throw Error("Invalid Range marker shape");
  return {
    enabled: bool(marker.enabled),
    shape: shape as RangeAreaFieldStyle["marker"]["shape"],
    size: number(marker.size),
    strokeWidth: number(marker.strokeWidth),
    // Palette/default marker properties win over inherited band properties.
    fill: paint(marker.fill === undefined ? fill : marker.fill),
    stroke: paint(marker.stroke === undefined ? stroke : marker.stroke),
    fillOpacity: number(marker.fillOpacity, 0, 1),
    strokeOpacity: number(marker.strokeOpacity, 0, 1),
  };
}

function shadowStyle(value: unknown): RangeAreaFieldStyle["shadow"] {
  const shadow = object(value);
  return {
    enabled: bool(shadow.enabled),
    color: paint(shadow.color),
    blur: number(shadow.blur),
    xOffset: number(shadow.xOffset, Number.NEGATIVE_INFINITY),
    yOffset: number(shadow.yOffset, Number.NEGATIVE_INFINITY),
  };
}

function interpolationStyle(value: unknown): RangeAreaInterpolation {
  const interpolation = object(value);
  if (interpolation.tension !== undefined) number(interpolation.tension, 0, 1);
  if (
    interpolation.position !== undefined &&
    !["start", "middle", "end"].includes(text(interpolation.position))
  )
    throw Error("Invalid Range interpolation position");
  if (interpolation.type === "linear") return { type: "linear" };
  if (interpolation.type === "smooth")
    return {
      type: "smooth",
      tension: number(
        interpolation.tension === undefined ? 1 : interpolation.tension,
        0,
        1,
      ),
    };
  if (interpolation.type === "step") {
    const position =
      interpolation.position === undefined ? "end" : interpolation.position;
    if (position !== "start" && position !== "middle" && position !== "end")
      throw Error("Invalid Range interpolation position");
    return { type: "step", position };
  }
  throw Error("Invalid Range interpolation type");
}

function validateSelection(input: RangeSeriesAppearanceInput) {
  if (
    !Array.isArray(input.seriesIds) ||
    input.seriesIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(input.seriesIds).size !== input.seriesIds.length
  )
    throw Error("Range series IDs must be unique nonempty strings");
  const palette = input.theme.palette;
  for (const values of [palette.fills, palette.strokes]) {
    if (!Array.isArray(values) || values.length === 0)
      throw Error("Range palette must contain fills and strokes");
    for (const value of values) paint(value);
  }
}

function resolvePrepared(
  input: RangeSeriesAppearanceInput,
  series: RuntimeOptions,
): RangeSeriesAppearanceResult {
  validateSelection(input);
  const configuredVisible = bool(series.visible);
  const palette = input.theme.palette;
  const styles = input.seriesIds.map((id, index) => {
    const fill = palette.fills[index % palette.fills.length];
    const stroke = palette.strokes[index % palette.strokes.length];
    const band = bandStyle(series, fill, stroke);
    const style =
      input.family === "rangeBar"
        ? band
        : {
            ...band,
            marker: markerStyle(series.marker, fill, stroke),
            shadow: shadowStyle(series.shadow),
            interpolation: interpolationStyle(series.interpolation),
            connectMissingData: bool(series.connectMissingData),
          };
    return [id, style] as const;
  });
  // Validate retained settings even when selection is temporarily empty.
  if (styles.length === 0) {
    bandStyle(series, palette.fills[0], palette.strokes[0]);
    if (input.family === "rangeArea") {
      markerStyle(series.marker, palette.fills[0], palette.strokes[0]);
      shadowStyle(series.shadow);
      interpolationStyle(series.interpolation);
      bool(series.connectMissingData);
    }
  }
  if (input.family === "rangeArea")
    return {
      status: "resolved",
      family: input.family,
      configuredVisible,
      fields: Object.fromEntries(styles) as Record<string, RangeAreaFieldStyle>,
    };
  const direction = series.direction;
  if (direction !== "vertical" && direction !== "horizontal")
    throw Error("Invalid Range Bar direction");
  return {
    status: "resolved",
    family: input.family,
    direction,
    configuredVisible,
    fields: Object.fromEntries(styles),
  };
}

export function resolveRangeSeriesAppearance(
  input: RangeSeriesAppearanceInput,
): RangeSeriesAppearanceResult {
  try {
    const prepared = prepareRangeSeriesOptions(input);
    return resolvePrepared(prepared.input, prepared.series);
  } catch (error) {
    const status =
      error instanceof RangeAppearanceUnsupported ? "unsupported" : "invalid";
    return {
      status,
      diagnostics: [
        {
          code: `range-appearance-${status}`,
          path: [],
          message:
            error instanceof Error
              ? error.message
              : "Unable to inspect Range appearance",
        },
      ],
    };
  }
}
