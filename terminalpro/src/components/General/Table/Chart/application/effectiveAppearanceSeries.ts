import type { CartesianFamily } from "../echarts/cartesianTypes";
import type { ResolvedApplicationSeries } from "./appearanceModel";
import {
  bool,
  child,
  dash,
  font,
  number,
  text,
  type ReadAppearance,
} from "./effectiveAppearanceValues";

export function resolveAppearanceSeries(
  read: ReadAppearance,
): ResolvedApplicationSeries {
  return {
    strokeWidth: number(read("strokeWidth")),
    strokeOpacity: number(read("strokeOpacity"), 0, 1),
    fillOpacity: number(read("fillOpacity"), 0, 1),
    lineDash: dash(read("lineDash")),
    connectMissingData: bool(read("connectMissingData")),
    shadow: {
      enabled: bool(read("shadow.enabled")),
      color: text(read("shadow.color")),
      blur: number(read("shadow.blur")),
      xOffset: number(read("shadow.xOffset"), Number.NEGATIVE_INFINITY),
      yOffset: number(read("shadow.yOffset"), Number.NEGATIVE_INFINITY),
    },
    labels: { ...font(child(read, "label")), enabled: bool(read("label.enabled")) },
    markers: {
      enabled: bool(read("marker.enabled")),
      shape: text(read("marker.shape")),
      size: number(read("marker.size")),
      strokeWidth: number(read("marker.strokeWidth")),
    },
  };
}

export function paletteSeries(
  read: ReadAppearance,
  family: CartesianFamily,
  fill: string,
  stroke: string,
  series: ResolvedApplicationSeries,
) {
  return {
    fill: text(read("fill") ?? fill),
    stroke: text(read("stroke") ?? (family === "line" ? fill : stroke)),
    strokeWidth: series.strokeWidth,
    markerFill: text(read("marker.fill") ?? fill),
    markerStroke: text(read("marker.stroke") ?? stroke),
    markerStrokeWidth: series.markers.strokeWidth,
    lineWidth: series.strokeWidth,
  };
}
