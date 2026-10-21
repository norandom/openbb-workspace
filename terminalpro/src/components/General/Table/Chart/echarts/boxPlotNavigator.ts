import type { EChartsOption } from "echarts";
import { boxPlotAxes } from "./boxPlotAxes";
import { boxPlotDomain } from "./boxPlotDomain";
import { boxPlotSeries } from "./boxPlotSeries";
import type { BoxPlotMappingInput, BoxPlotProjection } from "./boxPlotTypes";
import { type BoxValueAxisPlan, boxAxisTransport } from "./boxPlotValueAxis";
import { cartesianNavigator, retainNavigatorExtent } from "./cartesianNavigator";
import { navigatorAxes } from "./cartesianNavigatorOverview";
export function boxPlotNavigator(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  _plan: BoxValueAxisPlan,
  options: EChartsOption,
): EChartsOption {
  const nav = input.context.navigation;
  if (!nav || (!nav.enabled && !nav.mini)) return options;
  const overviewInput = {
    ...input,
    context: { ...input.context, navigation: undefined, legendSelection: undefined },
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
  const scale = boxAxisTransport(domain.value, domain.value);
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
    { miniHeight: 40, overviewOuterBoundsMode: "none" },
  );
  const window = nav.window ?? { start: 0, end: 100 };
  const slider = navigatorAxes(result.dataZoom)[0];
  return retainNavigatorExtent(
    {
      ...result,
      dataZoom: [
        { ...slider, xAxisIndex: [0], filterMode: "none", ...window },
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
