import type { EChartsOption, LegendComponentOption } from "echarts";
import { graphic } from "echarts";
import type {
  ResolvedApplicationAppearance,
  ResolvedCaption,
} from "../application/appearanceModel";
import type { ChartDisplayPolicy } from "../application/types";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { fontStyle } from "./cartesianDisplay";
import { isLineFamily } from "./cartesianLineTypes";
import { markerSymbol } from "./cartesianMarkers";
import type { CartesianFamily, CartesianMappingContext } from "./cartesianTypes";

export function measureText(
  text: string,
  font: {
    font: string;
    size: number;
    fontWeight: string | number | undefined;
    fontStyle: string | undefined;
  },
): { width: number; height: number } {
  return new graphic.Text({
    style: {
      text,
      fontFamily: font.font,
      fontSize: font.size,
      fontWeight: font.fontWeight as number | "normal" | "bold" | undefined,
      fontStyle: font.fontStyle as "normal" | "italic" | "oblique" | undefined,
    },
  }).getBoundingRect();
}
function captionHeight(caption: ResolvedCaption): number {
  return caption.enabled && caption.text !== ""
    ? measureText(caption.text, caption).height
    : 0;
}
function captionOptions(a: ResolvedApplicationAppearance): EChartsOption["title"] {
  return {
    show: a.title.enabled || a.subtitle.enabled,
    text: a.title.enabled ? a.title.text : "",
    subtext: a.subtitle.enabled ? a.subtitle.text : "",
    textStyle: fontStyle(a.title),
    subtextStyle: fontStyle(a.subtitle),
    itemGap: a.title.enabled && a.title.text !== "" ? a.title.spacing : 0,
    padding: 0,
    top: a.padding.top,
    left: "center",
  };
}
function legendExtent(
  a: ResolvedApplicationAppearance,
  columns: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  width: number,
  family: CartesianFamily | "rangeBar" | "rangeArea" | "waterfall",
) {
  const legend = a.legend;
  const sizes = columns.map((c) =>
    measureText(String(display.legend(c.label)), legend),
  );
  const heights = sizes.map((size) => Math.max(size.height, legend.markerSize));
  const widths = sizes.map(
    (size) => size.width + legendWidth(a, family) + legend.itemSpacing,
  );
  const vertical = legend.position === "left" || legend.position === "right";
  if (vertical)
    return {
      width: Math.max(0, ...widths),
      height: heights.reduce(
        (sum, n) => sum + n + legend.verticalSpacing,
        -legend.verticalSpacing,
      ),
    };
  let rowWidth = 0;
  let height = Math.max(0, ...heights);
  for (const item of widths) {
    if (rowWidth > 0 && rowWidth + item > width) {
      height += Math.max(0, ...heights) + legend.verticalSpacing;
      rowWidth = 0;
    }
    rowWidth += item + legend.horizontalSpacing;
  }
  return { width: Math.min(width, rowWidth), height };
}
function legendOptions(
  a: ResolvedApplicationAppearance,
  columns: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  family: CartesianFamily | "rangeBar" | "rangeArea" | "waterfall",
  captionSpace: number,
): LegendComponentOption {
  const l = a.legend;
  const vertical = l.position === "left" || l.position === "right";
  const labels = new Map(columns.map((c) => [c.id, c.label]));
  const rowPadding =
    (l.verticalSpacing + Math.max(0, l.markerSize - measureText("M", l).height)) / 2;
  return {
    show: l.enabled,
    orient: vertical ? "vertical" : "horizontal",
    [l.position]:
      a.padding[l.position as keyof typeof a.padding] +
      (l.position === "top" ? captionSpace : 0),
    ...(vertical ? { top: "middle" } : { left: "center" }),
    padding: 0,
    itemGap: 0,
    itemWidth: legendWidth(a, family),
    itemHeight:
      isLineFamily(family) && !a.series.markers.enabled
        ? a.series.strokeWidth
        : l.markerSize,
    // ECharts adds five pixels between its icon and text. Compensate explicitly;
    // item padding supplies independent horizontal and vertical row/column gaps.
    textStyle: {
      ...fontStyle(l),
      backgroundColor: "transparent",
      padding: [rowPadding, l.horizontalSpacing, rowPadding, l.itemSpacing - 5],
    },
    itemStyle: { borderWidth: a.legendMarkerStrokeWidth },
    data: columns.map((c) => ({
      name: c.id,
      ...(isLineFamily(family) && a.series.markers.enabled
        ? {}
        : {
            icon: isLineFamily(family) ? "rect" : markerSymbol("square"),
          }),
      symbolKeepAspect: true,
    })),
    formatter: (name) => String(display.legend(labels.get(name) ?? name)),
  };
}
function legendWidth(
  a: ResolvedApplicationAppearance,
  family: CartesianFamily | "rangeBar" | "rangeArea" | "waterfall",
): number {
  // Original line legends include a 25px series sample, even with markers hidden.
  return isLineFamily(family) ? Math.max(25, a.legend.markerSize) : a.legend.markerSize;
}
export function applicationLayout(
  a: ResolvedApplicationAppearance,
  columns: readonly SnapshotColumn[],
  display: ChartDisplayPolicy,
  family: CartesianFamily | "rangeBar" | "rangeArea" | "waterfall",
  viewport: NonNullable<CartesianMappingContext["viewport"]>,
): Pick<EChartsOption, "title" | "legend" | "grid" | "backgroundColor"> {
  const titleHeight = captionHeight(a.title);
  const subtitleHeight = captionHeight(a.subtitle);
  const captionSpace =
    titleHeight +
    subtitleHeight +
    (titleHeight ? a.title.spacing : 0) +
    (subtitleHeight ? a.subtitle.spacing : 0);
  const legend = legendExtent(
    a,
    columns,
    display,
    viewport.width - a.padding.left - a.padding.right,
    family,
  );
  const padding = { ...a.padding, top: a.padding.top + captionSpace };
  if (a.legend.enabled) {
    const position = a.legend.position as keyof typeof padding;
    padding[position] +=
      (position === "left" || position === "right" ? legend.width : legend.height) +
      a.legend.spacing;
  }
  return {
    backgroundColor: a.background.visible ? a.background.fill : "transparent",
    title: captionOptions(a),
    legend: legendOptions(a, columns, display, family, captionSpace),
    grid: {
      ...padding,
      containLabel: false,
      outerBoundsMode: "same",
      outerBoundsContain: "all",
    },
  };
}
