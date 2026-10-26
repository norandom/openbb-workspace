import { color, type EChartsOption } from "echarts";
import type {
  FunnelRenderInput,
  TranslateFunnel,
} from "../application/funnelRenderTypes";
import { isFunnelFamily } from "../compatibility/funnelContracts";
import { fontStyle } from "./cartesianDisplay";
import { funnelGeometry } from "./funnelGeometry";
import { funnelStageLabels } from "./funnelLabels";
import { funnelSeries } from "./funnelSeries";
import { funnelTooltip } from "./funnelTooltip";

function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite Funnel input");
  if (value && typeof value === "object") Object.values(value).forEach(finite);
}
function admit(input: FunnelRenderInput) {
  finite(input.style);
  finite(input.context.viewport);
  const s = input.style;
  if (
    !isFunnelFamily(s.family) ||
    s.family !== input.data.family ||
    s.paint.family !== s.family
  )
    throw Error("Family mismatch");
  const dimensions = [
    ...Object.values(input.context.viewport),
    ...Object.values(s.application.padding),
    ...Object.values(s.seriesAreaPadding),
    s.label.size,
    s.label.spacing,
    s.stageLabel.size,
    s.stageLabel.spacing,
    s.series.strokeWidth,
    ...s.series.lineDash,
    s.application.title.size,
    s.application.title.spacing,
    s.application.subtitle.size,
    s.application.subtitle.spacing,
  ];
  if (s.family !== "coneFunnel") dimensions.push(s.shadow.blur);
  if (s.family === "funnel")
    dimensions.push(s.spacingRatio, s.dropOff.strokeWidth, ...s.dropOff.lineDash);
  if (s.family === "pyramid") dimensions.push(s.spacing, s.aspectRatio ?? 1);
  if (
    dimensions.some((n) => n < 0) ||
    (s.family === "funnel" && s.spacingRatio > 1) ||
    (s.family === "pyramid" && s.aspectRatio === 0)
  )
    throw Error("Invalid dimensions");
  const opacity = [s.series.strokeOpacity, s.series.fillOpacity];
  if (s.family === "funnel")
    opacity.push(s.dropOff.strokeOpacity, s.dropOff.fillOpacity);
  if (opacity.some((n) => n < 0 || n > 1)) throw Error("Invalid opacity");
  if (
    !s.paint.fills.length ||
    !s.paint.strokes.length ||
    [
      ...s.paint.fills,
      ...s.paint.strokes,
      s.paint.numericLabelColor,
      s.paint.stageLabelColor,
      s.paint.dropOffFill,
      s.paint.dropOffStroke,
      s.label.color,
      s.stageLabel.color,
    ].some((c) => !color.parse(c))
  )
    throw Error("Invalid paint");
}
/** Inactive options translator; the existing host owns resize, disposal and export. */
export const translateFunnel: TranslateFunnel = (input) => {
  try {
    admit(input);
    const g = funnelGeometry(input);
    finite(g);
    const a = input.style.application;
    const options: EChartsOption = {
      animation: false,
      backgroundColor: a.background.visible ? a.background.fill : "transparent",
      title: {
        show: a.title.enabled || a.subtitle.enabled,
        text: a.title.enabled ? a.title.text : "",
        subtext: a.subtitle.enabled ? a.subtitle.text : "",
        textStyle: fontStyle(a.title),
        subtextStyle: fontStyle(a.subtitle),
        itemGap: a.title.enabled && a.title.text ? a.title.spacing : 0,
        padding: 0,
        top: a.padding.top,
        left: "center",
      },
      graphic: funnelStageLabels(input, g) as EChartsOption["graphic"],
      tooltip: funnelTooltip(input, g),
      series: [funnelSeries(input, g)],
    };
    return { status: "supported", options };
  } catch {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-input",
          path: [],
          message: "Funnel input could not be projected into finite native geometry.",
        },
      ],
    };
  }
};
