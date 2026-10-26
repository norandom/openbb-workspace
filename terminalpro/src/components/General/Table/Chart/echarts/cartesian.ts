import type { EChartsOption } from "echarts";
import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import {
  contextDiagnostics,
  mappingIssue,
  sourceDiagnostics,
  unitDiagnostics,
} from "./cartesianAdmission";
import { projectArea } from "./cartesianArea";
import { cartesianAreaSeries } from "./cartesianAreaSeries";
import { isAreaFamily } from "./cartesianAreaTypes";
import { applicationAxes } from "./cartesianAxes";
import { fallbackDisplay, normalizedDisplay } from "./cartesianDisplay";
import { cartesianGrid } from "./cartesianGrid";
import { applicationLayout } from "./cartesianLayout";
import { projectLineStack } from "./cartesianLineStack";
import { isStackedLineFamily, LineStackOverflowError } from "./cartesianLineTypes";
import { normalizedCoordinates, normalizedExtent } from "./cartesianNormalization";
import { cartesianSeries } from "./cartesianSeries";
import { captionAppearance, validateCartesianStyle } from "./cartesianStyle";
import { cartesianTooltip } from "./cartesianTooltip";
import type {
  CartesianFamily,
  CartesianMappingContext,
  ResolvedCartesianStyle,
  TranslateCartesian,
} from "./cartesianTypes";
import {
  isCartesianFamily,
  isHorizontalCartesianFamily,
  isNormalizedFamily,
} from "./cartesianTypes";

function applicationSupport(
  snapshot: ChartSnapshot,
  style: ResolvedCartesianStyle,
  context: CartesianMappingContext | undefined,
): SnapshotDiagnostic[] {
  const a = style.application;
  if (!a) return [];
  if (!context?.viewport)
    return [
      mappingIssue(
        "missing-viewport",
        ["context", "viewport"],
        "Application rendering awaits positive host dimensions.",
      ),
    ];
  const c = a.axes.category.fields;
  const n = a.axes.number.fields;
  if (n.type !== "number")
    return [
      mappingIssue(
        "invalid-axis-type",
        ["style", "application", "axes", "number", "fields", "type"],
        "The numerical observation axis must retain its numerical interpretation.",
      ),
    ];
  if (["top", "bottom"].includes(c.position) === ["top", "bottom"].includes(n.position))
    return [
      mappingIssue(
        "invalid-axis-position",
        ["style", "application", "axes"],
        "Category and number axes must occupy orthogonal directions.",
      ),
    ];
  if (c.type === "number" && snapshot.rows.some((r) => typeof r.category !== "number"))
    return [
      mappingIssue(
        "invalid-category",
        ["rows"],
        "Number category axes require original numerical category observations.",
      ),
    ];
  if (
    c.type === "time" &&
    snapshot.rows.some((r) => !Number.isFinite(new Date(r.category).getTime()))
  )
    return [
      mappingIssue(
        "invalid-category",
        ["rows"],
        "Time category axes require parseable original dates.",
      ),
    ];
  return [];
}
function buildOptions(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  family: CartesianFamily,
  style: ResolvedCartesianStyle,
  context: CartesianMappingContext | undefined,
): EChartsOption {
  const categoryType = style.application?.axes.category.fields.type;
  const line = isStackedLineFamily(family)
    ? projectLineStack({
        snapshot,
        columns,
        family,
        legendSelection: context?.legendSelection,
        categoryAxisType:
          categoryType === "number" || categoryType === "time"
            ? categoryType
            : "category",
      })
    : undefined;
  const area = isAreaFamily(family)
    ? projectArea({
        snapshot,
        columns,
        family,
        connectMissingData:
          style.application?.series.connectMissingData ??
          style.line?.connectMissingData ??
          false,
        legendSelection: context?.legendSelection,
      })
    : undefined;
  const normalized = isNormalizedFamily(family) || family === "normalizedLine";
  const drawn =
    line?.drawn ??
    (normalized && !area
      ? normalizedCoordinates(snapshot, columns, context?.legendSelection)
      : snapshot);
  const extent =
    line?.extent ?? (area ? area.extent : normalized ? normalizedExtent(drawn) : {});
  const captions = captionAppearance(style);
  const rawDisplay = context?.display ?? fallbackDisplay(style.precision);
  const display = normalized
    ? normalizedDisplay(rawDisplay, line ? line.empty : "interval" in extent)
    : rawDisplay;
  const labels = new Map(columns.map((column) => [column.id, column.label]));
  const legacy = {
    backgroundColor: style.background,
    color: [...style.palette],
    textStyle: {
      color: style.textColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
    },
    title: captions.title,
    legend: {
      show: style.legend.visible,
      [style.legend.position]: 0,
      data: columns.map((c) => c.id),
      ...(area ? { icon: "rect" } : {}),
      formatter: (name: string) => String(display.legend(labels.get(name) ?? name)),
      textStyle: captions.legendText,
    },
    xAxis: {
      type: "category",
      ...(area ? { boundaryGap: false } : {}),
      data: snapshot.rows.map((_, index) => String(index)),
      axisLabel: {
        ...captions.axisLabelStyle,
        formatter: (value: string) =>
          String(display.category(snapshot.rows[Number(value)]?.category ?? "")),
      },
      axisPointer: {
        label: {
          formatter: (params) =>
            String(
              display.crosshair(snapshot.rows[Number(params.value)]?.category ?? ""),
            ),
        },
      },
    },
    yAxis: {
      type: "value",
      ...extent,
      axisLabel: {
        ...captions.axisLabelStyle,
        formatter: (value: number) => String(display.numericAxis(value)),
      },
    },
    tooltip: cartesianTooltip(snapshot, columns, style, display, line?.drawn),
    series: area
      ? cartesianAreaSeries(snapshot, columns, style, display, area)
      : cartesianSeries(snapshot, columns, family, style, display, drawn),
  } satisfies EChartsOption;
  if (!style.application || !context?.viewport) {
    if (isHorizontalCartesianFamily(family)) {
      return {
        ...legacy,
        xAxis: legacy.yAxis,
        yAxis: { ...legacy.xAxis, inverse: true },
      };
    }
    return legacy;
  }
  const layout = applicationLayout(
    style.application,
    columns,
    display,
    family,
    context.viewport,
  );
  const grid = layout.grid as {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  const plotViewport = {
    width: Math.max(1, context.viewport.width - grid.left - grid.right),
    height: Math.max(1, context.viewport.height - grid.top - grid.bottom),
  };
  return {
    ...legacy,
    ...cartesianGrid(style.application),
    ...layout,
    ...applicationAxes(
      style.application.axes.category,
      style.application.axes.number,
      snapshot,
      display,
      plotViewport,
      family,
      extent,
    ),
  };
}
export const translateCartesian: TranslateCartesian = (
  snapshot,
  family,
  style,
  context,
) => {
  if (!isCartesianFamily(family) && !isAreaFamily(family))
    return {
      status: "unsupported",
      diagnostics: [
        mappingIssue(
          "unsupported-family",
          ["family"],
          "Only the scoped column, bar and line Cartesian families are supported.",
        ),
      ],
    };
  try {
    const invalidContext = contextDiagnostics(context);
    if (invalidContext.length)
      return { status: "invalid", diagnostics: invalidContext };
    const source = sourceDiagnostics(snapshot, context);
    if (source.length) return { status: "unsupported", diagnostics: source };
    const validated = validateCartesianStyle(style, family as CartesianFamily);
    if (validated.status !== "valid") return validated;
    const columns = snapshot.selectedColumnIds.flatMap((id) =>
      snapshot.columns.filter((c) => c.id === id && c.role === "number"),
    );
    const units = unitDiagnostics(
      columns,
      snapshot.columns,
      context?.observations.kind === "raw-observations",
    );
    if (units.length)
      return {
        status:
          context !== undefined && units.some((d) => d.code === "invalid-unit")
            ? "invalid"
            : "unsupported",
        diagnostics: units,
      };
    const support = applicationSupport(snapshot, validated.style, context);
    if (support.length)
      return {
        status: support.some((d) => d.code.startsWith("invalid-"))
          ? "invalid"
          : "unsupported",
        diagnostics: support,
      };
    return {
      status: "supported",
      options: buildOptions(
        snapshot,
        columns,
        family as CartesianFamily,
        validated.style,
        context,
      ),
    };
  } catch (error) {
    if (error instanceof LineStackOverflowError)
      return {
        status: "invalid",
        diagnostics: [mappingIssue(error.code, ["rows"], error.message)],
      };
    return {
      status: "invalid",
      diagnostics: [
        mappingIssue(
          "invalid-style",
          ["style"],
          "Resolved style cannot be safely inspected or projected.",
        ),
      ],
    };
  }
};
