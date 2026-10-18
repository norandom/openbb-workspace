import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";
import { applicationDiagnostics } from "./cartesianApplicationValidation";
import type {
  CaptionAppearance,
  CaptionTypography,
  CartesianFamily,
  CartesianSeriesStyle,
  ResolvedCartesianStyle,
  SeriesAppearance,
  StyleValidation,
  ValidateCartesianStyle,
} from "./cartesianTypes";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const dimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const string = (value: unknown): value is string => typeof value === "string";
const boolean = (value: unknown): value is boolean => typeof value === "boolean";
type Path = readonly (string | number)[];
type Check = (value: unknown) => boolean;

function checkFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  check: Check,
  path: Path,
  diagnostics: SnapshotDiagnostic[],
  optional = false,
): void {
  for (const field of fields) {
    if (optional && value[field] === undefined) continue;
    if (!check(value[field])) diagnostics.push(issue([...path, field]));
  }
}

function issue(path: Path): SnapshotDiagnostic {
  return { code: "invalid-style", path, message: "Resolved style field is invalid." };
}

function typographyDiagnostics(
  value: unknown,
  diagnostics: SnapshotDiagnostic[],
): void {
  if (value === undefined) return;
  const path = ["style", "typography"];
  if (!record(value)) {
    diagnostics.push(issue(path));
    return;
  }
  for (const field of ["title", "legend", "axis"]) {
    const caption = value[field];
    if (!record(caption)) {
      diagnostics.push(issue([...path, field]));
      continue;
    }
    checkFields(
      caption,
      ["color", "fontFamily"],
      string,
      [...path, field],
      diagnostics,
    );
    checkFields(caption, ["fontSize"], dimension, [...path, field], diagnostics);
  }
}

function lineDiagnostics(value: unknown, diagnostics: SnapshotDiagnostic[]): void {
  if (value === undefined) return;
  const path = ["style", "line"];
  if (!record(value)) {
    diagnostics.push(issue(path));
    return;
  }
  checkFields(value, ["connectMissingData"], boolean, path, diagnostics);
  const markers = value.markers;
  if (!record(markers)) {
    diagnostics.push(issue([...path, "markers"]));
    return;
  }
  const markerPath = [...path, "markers"];
  checkFields(markers, ["enabled"], boolean, markerPath, diagnostics);
  checkFields(
    markers,
    ["shape"],
    string,
    markerPath,
    diagnostics,
    markers.enabled !== true,
  );
  checkFields(
    markers,
    ["size"],
    dimension,
    markerPath,
    diagnostics,
    markers.enabled !== true,
  );
}

function seriesDiagnostics(value: unknown, diagnostics: SnapshotDiagnostic[]): void {
  const path = ["style", "series"];
  if (!record(value)) {
    diagnostics.push(issue(path));
    return;
  }
  for (const [id, override] of Object.entries(value)) {
    if (!record(override)) {
      diagnostics.push(issue([...path, id]));
      continue;
    }
    checkFields(
      override,
      ["color", "fill", "stroke", "markerFill", "markerStroke"],
      string,
      [...path, id],
      diagnostics,
      true,
    );
    checkFields(
      override,
      ["lineWidth", "strokeWidth", "markerStrokeWidth"],
      dimension,
      [...path, id],
      diagnostics,
      true,
    );
  }
}

function requiredDiagnostics(
  value: Record<string, unknown>,
  diagnostics: SnapshotDiagnostic[],
): void {
  const path = ["style"];
  checkFields(
    value,
    ["background", "textColor", "fontFamily"],
    string,
    path,
    diagnostics,
  );
  checkFields(value, ["fontSize"], dimension, path, diagnostics);
  if (
    !Array.isArray(value.palette) ||
    !value.palette.length ||
    !value.palette.every(string)
  )
    diagnostics.push(issue([...path, "palette"]));
  if (
    !dimension(value.precision) ||
    !Number.isInteger(value.precision) ||
    value.precision > 20
  )
    diagnostics.push(issue([...path, "precision"]));
  if (!record(value.legend)) diagnostics.push(issue([...path, "legend"]));
  else {
    checkFields(value.legend, ["visible"], boolean, [...path, "legend"], diagnostics);
    checkFields(
      value.legend,
      ["position"],
      (position) =>
        string(position) && ["top", "bottom", "left", "right"].includes(position),
      [...path, "legend"],
      diagnostics,
    );
  }
}

function validate(input: unknown, family: CartesianFamily): StyleValidation {
  if (!record(input)) return { status: "invalid", diagnostics: [issue(["style"])] };
  const diagnostics: SnapshotDiagnostic[] = [];
  requiredDiagnostics(input, diagnostics);
  checkFields(input, ["title"], string, ["style"], diagnostics, true);
  checkFields(input, ["titleEnabled"], boolean, ["style"], diagnostics, true);
  if (input.titleEnabled !== undefined && !string(input.title))
    diagnostics.push(issue(["style", "title"]));
  typographyDiagnostics(input.typography, diagnostics);
  lineDiagnostics(input.line, diagnostics);
  seriesDiagnostics(input.series, diagnostics);
  diagnostics.push(...applicationDiagnostics(input.application));
  if (diagnostics.length) return { status: "invalid", diagnostics };
  const style = input as unknown as ResolvedCartesianStyle;
  if (
    family === "line" &&
    style.application === undefined &&
    style.line?.markers.enabled &&
    style.line.markers.shape !== "circle"
  )
    return {
      status: "unsupported",
      diagnostics: [
        {
          code: "unsupported-marker",
          path: ["style", "line", "markers", "shape"],
          message: "Only circular line markers are supported.",
        },
      ],
    };
  return { status: "valid", style };
}

export const validateCartesianStyle: ValidateCartesianStyle = (input, family) => {
  try {
    return validate(input, family);
  } catch {
    return { status: "invalid", diagnostics: [issue(["style"])] };
  }
};

const baseTypography = (style: ResolvedCartesianStyle): CaptionTypography => ({
  color: style.textColor,
  fontFamily: style.fontFamily,
  fontSize: style.fontSize,
});

export const captionAppearance: CaptionAppearance = (style) => {
  const base = baseTypography(style);
  return {
    title:
      style.title === undefined
        ? undefined
        : {
            text: style.title,
            ...(style.titleEnabled === undefined ? {} : { show: style.titleEnabled }),
            textStyle: style.typography?.title ?? base,
          },
    legendText: style.typography?.legend ?? base,
    axisLabelStyle: style.typography?.axis ?? { color: style.textColor },
  };
};

function markerAppearance(
  override: CartesianSeriesStyle | undefined,
  palette: string,
  stroke: string | undefined,
  width: number | undefined,
) {
  return {
    color: override?.markerFill ?? override?.fill ?? override?.color ?? palette,
    borderColor: override?.markerStroke ?? stroke ?? palette,
    borderWidth: override?.markerStrokeWidth ?? width ?? 0,
  };
}

export const seriesAppearance: SeriesAppearance = (
  style,
  seriesId,
  paletteIndex,
  family,
) => {
  const override = style.series[seriesId];
  const palette = style.palette[paletteIndex % style.palette.length];
  const width = override?.strokeWidth ?? override?.lineWidth;
  if (family !== "line")
    return {
      itemStyle: {
        color: override?.fill ?? override?.color,
        ...(override?.stroke === undefined ? {} : { borderColor: override.stroke }),
        borderWidth: width,
      },
    };
  const stroke =
    override?.stroke ?? override?.color ?? (style.line ? palette : undefined);
  const markers = style.line?.markers;
  return {
    itemStyle: markers?.enabled
      ? markerAppearance(override, palette, stroke, width)
      : {
          color: override?.fill ?? override?.color,
          borderWidth: undefined,
        },
    lineStyle: {
      color: stroke,
      ...(width === undefined && style.line ? {} : { width }),
    },
    connectNulls: style.line?.connectMissingData ?? false,
    ...(markers === undefined ? {} : { showSymbol: markers.enabled }),
    ...(markers?.enabled ? { symbol: "circle", symbolSize: markers.size } : {}),
  };
};
