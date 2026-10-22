import type { EChartsOption, LegendComponentOption } from "echarts";
import { composeAppearanceOptions } from "../application/appearanceComposition";
import { at, number, object, text } from "../application/effectiveAppearanceValues";
import type { RangeAppearance } from "../application/rangeAppearance";
import type { RangeAreaFieldStyle } from "./rangeAreaTypes";
import type { RangeApplicationInput } from "./rangeApplicationTypes";
import { markerDimensions, markerSymbol } from "./cartesianMarkers";

type Marker = RangeAreaFieldStyle["marker"];
const shapes = ["square", "circle", "cross", "diamond", "plus", "triangle", "heart"];

function xml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function explicitLegend(input: RangeApplicationInput) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const marker: Record<string, unknown> = {};
  const line: Record<string, unknown> = {};
  for (const layer of [
    input.theme.overrides.common,
    composed.value.common,
    input.theme.overrides["range-area"],
    composed.value["range-area"],
  ]) {
    Object.assign(marker, object(at(layer, "legend.item.marker")));
    Object.assign(line, object(at(layer, "legend.item.line")));
  }
  return { marker, line };
}

function markerPaint(marker: Marker, explicit: Record<string, unknown>): Marker {
  const shape = text(explicit.shape ?? marker.shape);
  if (!shapes.includes(shape)) throw Error("Invalid Range legend marker shape");
  return {
    ...marker,
    shape: shape as Marker["shape"],
    fill: text(explicit.fill ?? marker.fill),
    stroke: text(explicit.stroke ?? marker.stroke),
    fillOpacity: number(explicit.fillOpacity ?? marker.fillOpacity, 0, 1),
    strokeOpacity: number(explicit.strokeOpacity ?? marker.strokeOpacity, 0, 1),
    strokeWidth: number(explicit.strokeWidth ?? Math.min(2, marker.strokeWidth)),
  };
}

type Metrics = {
  width: number;
  height: number;
  nominalWidth: number;
  nominalHeight: number;
};

function linePaint(style: RangeAreaFieldStyle, explicit: Record<string, unknown>) {
  return {
    length: number(explicit.length ?? 25),
    width: number(explicit.strokeWidth ?? Math.min(2, style.strokeWidth)),
  };
}

function markerBounds(marker: Marker, size: number) {
  const stroke = marker.strokeWidth;
  const ordinary = size + stroke;
  // Mitered tips extend beyond the half-stroke margin around the nominal path.
  if (marker.shape === "diamond" || marker.shape === "cross") {
    const extent = size + Math.SQRT2 * stroke;
    return { width: extent, height: extent };
  }
  if (marker.shape === "triangle") {
    const side = Math.hypot(0.5, 0.87);
    return {
      width: Math.max(ordinary, size + (stroke * (side + 0.5)) / 0.87),
      height: Math.max(ordinary, size * 0.87 + 2 * stroke * side),
    };
  }
  return { width: ordinary, height: ordinary };
}

function metrics(
  size: number,
  fields: Readonly<Record<string, RangeAreaFieldStyle>>,
  explicit: ReturnType<typeof explicitLegend>,
): Metrics {
  const length = number(explicit.line.length ?? 25);
  const styles = Object.values(fields);
  const markers = styles.map((style) =>
    markerBounds(markerPaint(style.marker, explicit.marker), size),
  );
  const lineStroke = Math.max(
    0,
    ...styles.map((style) => linePaint(style, explicit.line).width),
  );
  return {
    width: Math.max(length, size, ...markers.map((marker) => marker.width)),
    height: Math.max(size, lineStroke, ...markers.map((marker) => marker.height)),
    nominalWidth: Math.max(length, size),
    nominalHeight: size,
  };
}

export function rangeLegendMetrics(
  input: RangeApplicationInput,
  appearance: RangeAppearance,
  fields: Readonly<Record<string, RangeAreaFieldStyle>>,
): Metrics {
  return metrics(
    appearance.application.legend.markerSize,
    fields,
    explicitLegend(input),
  );
}

function markerPath(marker: Marker, size: number, bounds: Metrics): string {
  const dimensions = markerDimensions(marker.shape, size);
  const [w, h] = typeof dimensions === "number" ? [dimensions, dimensions] : dimensions;
  const geometry =
    marker.shape === "circle"
      ? '<circle cx=".5" cy=".5" r=".5"'
      : `<path d="${markerSymbol(marker.shape).slice(7)}"`;
  const view =
    marker.shape === "plus"
      ? "0 0 3 3"
      : marker.shape === "heart"
        ? "-.5 -.375 1 .75"
        : marker.shape === "triangle"
          ? "0 0 1 .87"
          : "0 0 1 1";
  return `<svg x="${(bounds.width - w) / 2}" y="${(bounds.height - h) / 2}" width="${w}" height="${h}" viewBox="${view}" overflow="visible">${geometry} fill="${xml(marker.fill)}" fill-opacity="${marker.fillOpacity}" stroke="${xml(marker.stroke)}" stroke-opacity="${marker.strokeOpacity}" stroke-width="${marker.strokeWidth}" vector-effect="non-scaling-stroke"/></svg>`;
}

function icon(
  style: RangeAreaFieldStyle,
  marker: Marker,
  size: number,
  selected: boolean,
  linePaint: { length: number; width: number },
  bounds: Metrics,
): string {
  // Separate SVG paint preserves the band's line and marker's independent palette.
  const left = (bounds.width - linePaint.length) / 2;
  const line = `<path d="M${left} ${bounds.height / 2}H${left + linePaint.length}" fill="none" stroke="${xml(style.stroke)}" stroke-opacity="${style.strokeOpacity}" stroke-width="${linePaint.width}" stroke-dasharray="${style.lineDash.join(" ")}" stroke-dashoffset="${style.lineDashOffset}"/>`;
  // Expand the image viewport for centered strokes without scaling nominal glyphs.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="0 0 ${bounds.width} ${bounds.height}"><g opacity="${selected ? 1 : 0.5}">${line}${markerPath(marker, size, bounds)}</g></svg>`;
  return `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function rangeLegend(
  chrome: EChartsOption,
  appearance: RangeAppearance,
  fields: Readonly<Record<string, RangeAreaFieldStyle>>,
  selection: Record<string, boolean>,
  input: RangeApplicationInput,
): LegendComponentOption {
  const legend =
    (Array.isArray(chrome.legend) ? chrome.legend[0] : chrome.legend) ?? {};
  const explicit = explicitLegend(input);
  const size = appearance.application.legend.markerSize;
  const bounds = metrics(size, fields, explicit);
  const padding = legend.textStyle?.padding;
  return {
    ...legend,
    itemWidth: bounds.width,
    itemHeight: bounds.height,
    textStyle: {
      ...legend.textStyle,
      padding: [
        ...(Array.isArray(padding)
          ? padding.slice(0, 3)
          : [0, appearance.application.legend.horizontalSpacing, 0]),
        appearance.application.legend.itemSpacing - 5,
      ],
    },
    selected: { ...selection },
    data: (legend.data ?? []).map((entry) => {
      const item = typeof entry === "string" ? { name: entry } : entry;
      const style = fields[item.name ?? ""];
      if (!style) return item;
      return {
        ...item,
        icon: icon(
          style,
          markerPaint(style.marker, explicit.marker),
          size,
          selection[item.name!] !== false,
          linePaint(style, explicit.line),
          bounds,
        ),
        symbolKeepAspect: true,
      };
    }),
  };
}
