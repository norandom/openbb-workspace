import type {
  EChartsOption,
  SeriesOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import type { ApplicationThemeInput } from "../application/appearanceModel";


export const navigatorAxes = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function allocator(values: unknown[]) {
  const used = new Set(values.filter((v) => v !== undefined).map(String));
  return (source: unknown) => {
    const base = 'openbb-mini-' + (source ?? 'series');
    let candidate = base;
    let suffix = 1;
    while (used.has(candidate)) candidate = base + '-' + suffix++;
    used.add(candidate);
    return candidate;
  };
}
function axisIndex(series: any, dimension: 'x' | 'y', axes: any[]): number {
  const index = series[dimension + 'AxisIndex'];
  const id = series[dimension + 'AxisId'];
  const matches = id === undefined ? [] : axes.flatMap((axis, i) => axis.id !== undefined && String(axis.id) === String(id) ? [i] : []);
  const resolved = id === undefined ? index ?? 0 : matches[0];
  if ((id !== undefined && matches.length !== 1) || !Number.isInteger(resolved) || resolved < 0 || resolved >= axes.length || (index !== undefined && index !== resolved))
    throw new Error('Invalid navigator ' + dimension + ' axis reference');
  return resolved;
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
    offset: 0,
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

function cloneSeries(source: any, id: string, name: string, stack: string | undefined, x: number, y: number): SeriesOption {
  const { xAxisId, yAxisId, ...item } = source;
  return {
    ...item, id, name, xAxisIndex: x, yAxisIndex: y,
    ...(stack === undefined ? {} : { stack }),
    silent: true, label: { show: false }, tooltip: { show: false }, animation: false,
    ...(item.type === 'line' ? {
      showSymbol: false,
      lineStyle: { ...item.lineStyle, width: item.openbbAreaGeometry === true ? item.lineStyle?.width : 2, type: 'solid' },
      itemStyle: { ...item.itemStyle, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0 },
    } : {}),
    emphasis: { disabled: true }, select: { disabled: true },
  } as SeriesOption;
}
export function navigatorOverview(options: EChartsOption, overview: EChartsOption, theme: ApplicationThemeInput) {
  const mainX = navigatorAxes(options.xAxis), mainY = navigatorAxes(options.yAxis);
  const xs = navigatorAxes(overview.xAxis), ys = navigatorAxes(overview.yAxis);
  const main = navigatorAxes(options.series), sources = navigatorAxes(overview.series);
  const ids = allocator([...main, ...sources].map((s) => s.id));
  const names = allocator([...main, ...sources].map((s) => s.name));
  const stacks = allocator([...main, ...sources].map((s: any) => s.stack));
  const stackMap = new Map<string, string>();
  const axisIds = allocator([...mainX, ...mainY, ...xs, ...ys].map((a) => a.id));
  return {
    xAxis: [...mainX, ...xs.map((a, i) => ({ ...miniatureAxis(a, true, theme), id: axisIds(a.id ?? 'x-' + i) }))],
    yAxis: [...mainY, ...ys.map((a, i) => ({ ...miniatureAxis(a, false, theme), id: axisIds(a.id ?? 'y-' + i) }))],
    series: [...main, ...sources.map((source: any) => {
      let stack: string | undefined;
      if (source.stack !== undefined) {
        if (!stackMap.has(source.stack)) stackMap.set(source.stack, stacks(source.stack));
        stack = stackMap.get(source.stack);
      }
      return cloneSeries(source, ids(source.id), names(source.id ?? source.name), stack,
        mainX.length + axisIndex(source, 'x', xs), mainY.length + axisIndex(source, 'y', ys));
    })],
  };
}
