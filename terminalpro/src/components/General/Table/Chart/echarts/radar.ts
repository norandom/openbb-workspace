import type {
  RadarMappingInput,
  TranslateRadar,
} from "../compatibility/radarContracts";
import { radarData } from "./radarData";
import { radarLayout } from "./radarLayout";
import { radarSeries, radarTooltip } from "./radarSeries";

function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite Radar geometry.");
  if (value !== null && typeof value === "object") Object.values(value).forEach(finite);
}
function admit(input: RadarMappingInput) {
  if (input.family !== "radarLine" && input.family !== "radarArea")
    throw Error("Unsupported Radar family.");
  const { width, height } = input.context.viewport;
  const p = input.style.polarAxis;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0)
    throw Error("Invalid Radar viewport.");
  if (
    p.innerRadiusRatio < 0 ||
    p.innerRadiusRatio > 1 ||
    !Number.isFinite(p.innerRadiusRatio)
  )
    throw Error("Invalid Radar inner radius.");
  if (
    !["circle", "polygon"].includes(p.shape) ||
    !["fixed", "parallel", "perpendicular"].includes(p.labels.orientation)
  )
    throw Error("Invalid Radar polar appearance.");
  if (
    !["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].includes(
      input.style.series.markers.shape,
    )
  )
    throw Error("Invalid Radar marker.");
  if (
    !input.style.application.palette.fills.length ||
    !input.style.application.palette.strokes.length
  )
    throw Error("Empty Radar palette.");
  const s = input.style.series;
  const dimensions = [
    p.thickness,
    p.labels.size,
    s.strokeWidth,
    s.labels.size,
    s.markers.size,
    s.markers.strokeWidth,
    ...s.lineDash,
    ...Object.values(input.style.application.padding),
  ];
  if (dimensions.some((value) => typeof value !== "number" || value < 0))
    throw Error("Invalid Radar dimensions.");
  if ([s.strokeOpacity, s.fillOpacity].some((value) => value < 0 || value > 1))
    throw Error("Invalid Radar opacity.");
  finite(input.style);
  finite(input.context.viewport);
}
/** Inactive adapter: the caller owns capture, selection, persistence and legend events. */
export const translateRadar: TranslateRadar = (input) => {
  try {
    admit(input);
    const data = radarData(input);
    const layout = radarLayout(input, data);
    const c = input.style.common;
    const options = {
      animation: false,
      textStyle: { color: c.textColor, fontFamily: c.fontFamily, fontSize: c.fontSize },
      ...layout.options,
      series: radarSeries(input, data, layout.geometry, layout.domain),
      tooltip: radarTooltip(input),
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
            "Radar input could not be safely inspected or projected into finite geometry.",
        },
      ],
    };
  }
};
