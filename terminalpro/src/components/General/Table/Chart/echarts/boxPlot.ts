import type { EChartsOption } from "echarts";
import { admitBoxPlot, boxDisplayText, boxFailure } from "./boxPlotAdmission";
import { boxPlotAxes } from "./boxPlotAxes";
import { boxPlotAxisLayout } from "./boxPlotAxisLayout";
import { boxPlotDomain, preflightBoxDomain } from "./boxPlotDomain";
import { finiteBoxGeometry, preflightBoxGeometry } from "./boxPlotGeometry";
import { boxPlotLayout } from "./boxPlotLayout";
import { boxVisibleFraction } from "./boxPlotNavigationWindow";
import { boxPlotNavigator } from "./boxPlotNavigator";
import { projectBoxPlot } from "./boxPlotProjection";
import { boxPlotSeries } from "./boxPlotSeries";
import { boxPlotTooltip } from "./boxPlotTooltip";
import type {
  BoxPlotMappingInput,
  BoxPlotProjection,
  TranslateBoxPlot,
} from "./boxPlotTypes";
import { planBoxValueAxis } from "./boxPlotValueAxis";

function preflightDisplay(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
  endpoints: readonly number[],
): void {
  const d = input.context.display;
  for (const group of projection.groups) {
    boxDisplayText(d.category(group.category));
    boxDisplayText(d.crosshair(group.category));
  }
  for (const field of projection.fields) {
    boxDisplayText(d.legend(field.descriptor.label));
    for (const datum of field.data)
      if (datum.summary)
        for (const value of Object.values(datum.summary)) {
          boxDisplayText(d.numericAxis(value));
          boxDisplayText(d.crosshair(value));
          boxDisplayText(d.seriesLabel(value));
        }
  }
  for (const value of endpoints) {
    boxDisplayText(d.numericAxis(value));
    boxDisplayText(d.crosshair(value));
  }
}
/** Pure inactive projection: caller owns capture, appearance resolution and host lifecycle. */
export const translateBoxPlot: TranslateBoxPlot = (value) => {
  try {
    const admitted = admitBoxPlot(value);
    if ("status" in admitted) return admitted;
    const { input } = admitted;
    const projection = projectBoxPlot(input);
    if ("status" in projection) return projection;
    return composeBoxPlot(input, projection);
  } catch {
    return boxFailure(
      "Box Plot input could not be safely inspected or projected into finite geometry.",
    );
  }
};

export function composeBoxPlot(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
) {
  const domain = boxPlotDomain(input, projection);
  const layout = boxPlotLayout(input, projection);
  const axisLayout = boxPlotAxisLayout(input, projection, domain, layout.grid);
  const fraction = boxVisibleFraction(input, projection, axisLayout.plan);
  const valueAxis = planBoxValueAxis(
    domain,
    axisLayout.plan.span,
    axisLayout.plan.density,
    fraction,
  );
  const scale =
    input.style.direction === "horizontal"
      ? valueAxis.fullTransport
      : valueAxis.transport;
  preflightBoxDomain(projection, scale);
  preflightBoxGeometry(input, projection, scale);
  preflightDisplay(
    input,
    projection,
    scale.constant === undefined ? [scale.min, scale.max] : [scale.constant],
  );
  const options = {
    animation: false,
    textStyle: {
      color: input.style.common.textColor,
      fontFamily: input.style.common.fontFamily,
      fontSize: input.style.common.fontSize,
    },
    ...layout,
    grid: axisLayout.grid,
    ...boxPlotAxes(
      input,
      projection,
      scale,
      domain.empty,
      valueAxis,
      axisLayout.categoryPlan,
      axisLayout.numericRotation,
    ),
    series: boxPlotSeries(input, projection, scale, domain.empty),
    tooltip: boxPlotTooltip(input, projection, domain.empty),
  };
  finiteBoxGeometry(options);
  const decorated = boxPlotNavigator(
    input,
    projection,
    valueAxis,
    options,
    axisLayout.navigatorGeometry,
  );
  return {
    status: "supported" as const,
    options: { ...decorated, openbbBox: { projection } } as EChartsOption,
    projection,
    domain,
    valueAxis,
  };
}
