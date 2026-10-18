import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";
import {
  navigatorBorder,
  navigatorMask,
  rangedNavigatorMask,
} from "./cartesianNavigatorMask";

const ID = "openbb-navigator";
type Zoom = { id?: string; start?: number; end?: number };
function navigator(options: unknown): Zoom | undefined {
  if (!options || typeof options !== "object") return;
  const zoom = (options as { dataZoom?: Zoom | Zoom[] }).dataZoom;
  return (Array.isArray(zoom) ? zoom : [zoom]).find((item) => item?.id === ID) as
    | Zoom
    | undefined;
}
export function hasNavigator(options: EChartsOption): boolean {
  return navigator(options) !== undefined;
}
/** ECharts owns the live percent range; it is deliberately absent from Widget storage. */
export function retainNavigatorExtent(
  options: EChartsOption,
  current: unknown,
): EChartsOption {
  const range = navigator(current);
  if (!range || !Number.isFinite(range.start) || !Number.isFinite(range.end))
    return options;
  const start = Math.max(0, Math.min(100, range.start!));
  const end = Math.max(start, Math.min(100, range.end!));
  const dataZoom = Array.isArray(options.dataZoom)
    ? options.dataZoom
    : [options.dataZoom!];
  return {
    ...options,
    dataZoom: dataZoom.map((zoom) => (zoom.id === ID ? { ...zoom, start, end } : zoom)),
    ...(options.graphic
      ? { graphic: rangedNavigatorMask(options.graphic, start, end) }
      : {}),
  };
}
function miniatureAxis<Axis extends XAXisComponentOption | YAXisComponentOption>(
  axis: Axis,
  horizontal: boolean,
  theme: ApplicationThemeInput,
): Axis {
  const font = theme.navigatorFont ?? {
    fontFamily: "Verdana, sans-serif",
    fontSize: 10,
    fontWeight: 400,
  };
  return {
    ...axis,
    gridIndex: 1,
    name: "",
    show: horizontal,
    axisPointer: { show: false },
    axisLabel: {
      formatter: axis.axisLabel?.formatter,
      show: horizontal,
      color: theme.colors.textColor,
      ...font,
      rotate: 0,
      margin: 5,
      hideOverlap: true,
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
  } as Axis;
}
function miniatureSeries(series: readonly SeriesOption[]): SeriesOption[] {
  return series.map((source) => {
    const item = source as SeriesOption & { stack?: string };
    return {
      ...item,
      id: `openbb-mini-${source.id}`,
      name: `openbb-mini-${source.id}`,
      xAxisIndex: 1,
      yAxisIndex: 1,
      ...(item.stack ? { stack: `openbb-mini-${item.stack}` } : {}),
      silent: true,
      label: { show: false },
      tooltip: { show: false },
      animation: false,
      ...(item.type === "line"
        ? {
            showSymbol: false,
            lineStyle: {
              ...(item as { lineStyle?: Record<string, unknown> }).lineStyle,
              width: 2,
              type: "solid",
            },
            itemStyle: {
              ...(item as { itemStyle?: Record<string, unknown> }).itemStyle,
              shadowBlur: 0,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
            },
          }
        : {}),
      emphasis: { disabled: true },
      select: { disabled: true },
    } as SeriesOption;
  });
}
/** The original miniature retains every series. Slider data shadows only retain one. */
export function cartesianNavigator(
  options: EChartsOption,
  enabled: boolean,
  mini: boolean,
  theme: ApplicationThemeInput,
  viewport: { readonly width: number },
): EChartsOption {
  if (!enabled && !mini) return options;
  const grid = options.grid as {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
  const height = mini ? 40 : 18;
  const labelSpace = mini
    ? Math.ceil((theme.navigatorFont?.fontSize ?? 10) * 1.2) + 5
    : 0;
  const bottom = grid.bottom + labelSpace;
  const foreground = theme.colors.foregroundColor;
  const border = navigatorBorder(theme);
  const series = options.series as SeriesOption[];
  const x = options.xAxis as XAXisComponentOption;
  const y = options.yAxis as YAXisComponentOption;
  return {
    ...options,
    graphic: navigatorMask(
      grid.left,
      grid.right,
      bottom,
      height,
      viewport.width,
      foreground,
    ),
    grid: mini
      ? [
          { ...grid, bottom: bottom + height + 10 },
          {
            left: grid.left,
            right: grid.right,
            bottom,
            height,
            containLabel: false,
            outerBoundsMode: "same",
          },
        ]
      : { ...grid, bottom: grid.bottom + height + 10 },
    dataZoom: [
      {
        id: ID,
        type: "slider",
        xAxisIndex: [0],
        orient: "horizontal",
        // Numeric range selection crops geometry without dropping category rows.
        filterMode: x.type === "value" && y.inverse ? "none" : "filter",
        left: grid.left,
        right: grid.right,
        bottom,
        height,
        start: 0,
        end: 100,
        minSpan: 0.1,
        showDataShadow: false,
        showDetail: false,
        brushSelect: false,
        moveHandleSize: 0,
        realtime: true,
        borderRadius: 4,
        borderColor: border,
        backgroundColor: "transparent",
        fillerColor: "transparent",
        handleIcon: "path://M0,4Q0,0 4,0H8Q12,0 12,4V20Q12,24 8,24H4Q0,24 0,20Z",
        handleSize: 24,
        handleStyle: {
          color: theme.colors.chartBackgroundColor,
          borderColor: border,
          borderWidth: 1,
        },
        emphasis: {
          handleLabel: { show: false },
          handleStyle: {
            color: theme.colors.chartBackgroundColor,
            borderColor: border,
          },
        },
      },
    ],
    ...(mini
      ? {
          xAxis: [x, miniatureAxis(x, true, theme)],
          yAxis: [y, miniatureAxis(y, false, theme)],
          series: [...series, ...miniatureSeries(series)],
        }
      : {}),
  };
}
