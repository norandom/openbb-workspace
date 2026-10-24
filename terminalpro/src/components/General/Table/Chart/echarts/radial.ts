import type {
  RadialMappingInput,
  TranslateRadial,
} from "../compatibility/radialContracts";
import { radialChrome } from "./radialChrome";
import { prepareRadialModel } from "./radialLayout";
import type { RadialPreparedModel } from "./radialModel";
import { radialSeries, radialTooltip } from "./radialSeries";
function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite radial geometry.");
  if (value !== null && typeof value === "object")
    Object.values(value).forEach(finite);
}
function admit(input: RadialMappingInput): void {
  if (
    !["radialColumn", "radialBar"].includes(input.family) ||
    !["grouped", "stacked", "normalized"].includes(input.groupType)
  )
    throw Error("Invalid radial structure.");
  finite(input.style);
  finite(input.context.viewport);
  if (input.context.viewport.width < 0 || input.context.viewport.height < 0)
    throw Error("Invalid viewport.");
  if (
    input.style.axes.category.key !==
      (input.family === "radialColumn"
        ? "angle-category"
        : "radius-category") ||
    input.style.axes.numerical.key !==
      (input.family === "radialColumn" ? "radius-number" : "angle-number")
  )
    throw Error("Invalid radial axis family.");
  const s = input.style.series;
  if (
    !input.style.application.palette.fills.length ||
    !input.style.application.palette.strokes.length
  )
    throw Error("Empty palette.");
  if (
    [
      s.strokeWidth,
      s.labels.size,
      ...s.lineDash,
      ...Object.values(input.style.application.padding),
    ].some((v) => typeof v !== "number" || v < 0)
  )
    throw Error("Invalid paint dimensions.");
  if ([s.fillOpacity, s.strokeOpacity].some((v) => v < 0 || v > 1))
    throw Error("Invalid opacity.");
  for (const axis of [input.style.axes.category, input.style.axes.numerical]) {
    if (
      axis.thickness < 0 ||
      axis.labels.size < 0 ||
      axis.innerRadiusRatio < 0 ||
      axis.innerRadiusRatio > 1
    )
      throw Error("Invalid axis dimensions.");
    if (
      axis.labels.orientation &&
      !["fixed", "parallel", "perpendicular"].includes(axis.labels.orientation)
    )
      throw Error("Invalid axis orientation.");
  }
}
function validateModel(
  input: RadialMappingInput,
  model: RadialPreparedModel,
): void {
  finite(model);
  if (model.holeRadius < 0 || model.outerRadius < model.holeRadius)
    throw Error("Invalid radial bounds.");
  for (const series of model.series) {
    if (!Number.isInteger(series.paletteIndex) || series.paletteIndex < 0)
      throw Error("Invalid palette index.");
    for (const mark of series.marks) {
      if (mark.kind === "column" && input.family !== "radialColumn")
        throw Error("Invalid mark family.");
      if (
        mark.kind !== "column" &&
        (input.family !== "radialBar" ||
          mark.innerRadius < 0 ||
          mark.outerRadius < mark.innerRadius ||
          mark.outerRadius > model.outerRadius ||
          mark.startAngle > mark.endAngle)
      )
        throw Error("Invalid sector geometry.");
    }
  }
}
/** Inactive translator: the native host retains resize, export and legend session ownership. */
export const translateRadial: TranslateRadial = (input) => {
  try {
    admit(input);
    const model = prepareRadialModel(input);
    validateModel(input, model);
    const c = input.style.common;
    const options = {
      animation: false,
      textStyle: {
        color: c.textColor,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
      },
      ...radialChrome(input, model),
      series: radialSeries(input, model),
      tooltip: radialTooltip(input, model),
    };
    finite(options);
    return { status: "supported", options };
  } catch {
    return {
      status: "invalid",
      diagnostics: [
        {
          code: "invalid-input",
          path: [],
          message:
            "Radial input could not be safely projected into finite geometry.",
        },
      ],
    };
  }
};
