import type { EChartsOption } from "echarts";
import { boxPlotAxes } from "./boxPlotAxes";
import { boxPlotDomain } from "./boxPlotDomain";
import { boxPlotSeries } from "./boxPlotSeries";
import { boxRawTicks, boxTickDensity } from "./boxPlotTicks";
import type {
  BoxNavigatorGeometry,
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "./boxPlotTypes";
import { type BoxValueAxisPlan, boxAxisTransport } from "./boxPlotValueAxis";
import { cartesianNavigator, retainNavigatorExtent } from "./cartesianNavigator";
import { navigatorMask } from "./cartesianNavigatorMask";
import { navigatorAxes } from "./cartesianNavigatorOverview";
export function boxPlotNavigator(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  _plan: BoxValueAxisPlan,
  options: EChartsOption,
  geometry?: BoxNavigatorGeometry,
): EChartsOption {
  const nav = input.context.navigation;
  if (!nav || (!nav.enabled && !nav.mini)) return options;
  if (!geometry) throw Error("Missing planned Box navigator geometry.");
  const overviewInput = {
    ...input,
    context: {
      ...input.context,
      navigation: undefined,
      legendSelection: undefined,
    },
  };
  const full = {
    ...projection,
    fields: projection.fields.map((f) => ({
      ...f,
      enabled:
        input.style.fields[f.descriptor.id].visible !== false &&
        input.style.fields[f.descriptor.id].showInMiniChart !== false,
    })),
  };
  const domain = boxPlotDomain(overviewInput, full);
  const span = input.context.viewport.width - geometry.left - geometry.right;
  const rawTicks = domain.value.length
    ? boxRawTicks(domain.value, boxTickDensity(span))
    : [];
  const scale = boxAxisTransport(domain.value, rawTicks);
  const overview = {
    ...boxPlotAxes(overviewInput, full, scale, domain.empty),
    series: boxPlotSeries(overviewInput, full, scale, domain.empty),
  };
  const result = cartesianNavigator(
    options,
    nav.enabled,
    nav.mini,
    nav.theme,
    input.context.viewport,
    overview,
    { miniHeight: geometry.height, overviewOuterBoundsMode: "none" },
  );
  const grids = navigatorAxes(result.grid);
  result.grid = nav.mini
    ? [
        navigatorAxes(options.grid)[0],
        {
          ...grids[1],
          left: geometry.left,
          right: geometry.right,
          bottom: geometry.bottom,
          height: geometry.height,
          containLabel: false,
          outerBoundsMode: "none",
        },
      ]
    : options.grid;
  result.graphic = navigatorMask(
    geometry.left,
    geometry.right,
    geometry.bottom,
    geometry.height,
    input.context.viewport.width,
    nav.theme.colors.foregroundColor,
  );
  if (nav.mini)
    restoreOverviewTicks(result, input.style.direction === "horizontal", scale);
  const window = nav.window ?? { start: 0, end: 100 };
  const slider = navigatorAxes(result.dataZoom)[0];
  return retainNavigatorExtent(
    {
      ...result,
      dataZoom: [
        {
          ...slider,
          left: geometry.left,
          right: geometry.right,
          bottom: geometry.bottom,
          height: geometry.height,
          xAxisIndex: [0],
          filterMode: "none",
          ...window,
        },
        {
          id: "openbb-box-inside",
          type: "inside",
          xAxisIndex: [0],
          filterMode: "none",
          minSpan: 0.1,
          ...window,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
      ],
    },
    { dataZoom: [{ id: "openbb-navigator", ...window }] },
  );
}
function restoreOverviewTicks(
  options: EChartsOption,
  horizontal: boolean,
  scale: ReturnType<typeof boxAxisTransport>,
) {
  const axis = horizontal
    ? navigatorAxes(options.xAxis)[1]
    : navigatorAxes(options.yAxis)[1];
  if (axis.type !== "value") throw Error("Invalid Box numeric overview axis.");
  axis.axisLabel = {
    ...axis.axisLabel,
    customValues: [...(scale.ticks ?? [])],
    formatter: (value: number) => String(scale.constant ?? value),
  };
  axis.axisTick = { ...axis.axisTick, customValues: [...(scale.ticks ?? [])] };
}
