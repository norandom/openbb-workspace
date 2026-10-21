import { admitBoxPlot, boxDisplayText, boxFailure } from "./boxPlotAdmission";
import { boxPlotAxes } from "./boxPlotAxes";
import { boxPlotDomain, boxValueScale, preflightBoxDomain } from "./boxPlotDomain";
import { finiteBoxGeometry, preflightBoxGeometry } from "./boxPlotGeometry";
import { boxPlotLayout } from "./boxPlotLayout";
import { projectBoxPlot } from "./boxPlotProjection";
import { boxPlotSeries } from "./boxPlotSeries";
import { boxPlotTooltip } from "./boxPlotTooltip";
import type {
  BoxPlotMappingInput,
  BoxPlotProjection,
  TranslateBoxPlot,
} from "./boxPlotTypes";

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
    const domain = boxPlotDomain(input, projection);
    const scale = boxValueScale(input, domain);
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
      ...boxPlotLayout(input, projection),
      ...boxPlotAxes(input, projection, scale, domain.empty),
      series: boxPlotSeries(input, projection, scale, domain.empty),
      tooltip: boxPlotTooltip(input, projection, domain.empty),
    };
    finiteBoxGeometry(options);
    return { status: "supported", options, projection, domain };
  } catch {
    return boxFailure(
      "Box Plot input could not be safely inspected or projected into finite geometry.",
    );
  }
};
