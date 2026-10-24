import type {
  NightingaleMappingInput,
  TranslateNightingale,
} from "../compatibility/nightingaleContracts";
import { nightingaleData } from "./nightingaleData";
import { nightingaleLayout } from "./nightingaleLayout";
import { nightingaleSeries, nightingaleTooltip } from "./nightingaleSeries";
function finite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Nonfinite Nightingale geometry.");
  if (value !== null && typeof value === "object") Object.values(value).forEach(finite);
}
function admit(input: NightingaleMappingInput) {
  if (
    input.family !== "nightingale" ||
    !["grouped", "stacked", "normalized"].includes(input.groupType ?? "stacked")
  )
    throw Error("Invalid Nightingale structure.");
  const { width, height } = input.context.viewport;
  const p = input.style.polarAxis;
  const s = input.style.series;
  if (width < 0 || height < 0 || p.innerRadiusRatio < 0 || p.innerRadiusRatio > 1)
    throw Error("Invalid dimensions.");
  if (!["fixed", "parallel", "perpendicular"].includes(p.labels.orientation))
    throw Error("Invalid orientation.");
  if (
    !input.style.application.palette.fills.length ||
    !input.style.application.palette.strokes.length
  )
    throw Error("Empty palette.");
  if (
    [
      p.thickness,
      p.labels.size,
      s.strokeWidth,
      s.labels.size,
      ...s.lineDash,
      ...Object.values(input.style.application.padding),
    ].some((v) => typeof v !== "number" || v < 0)
  )
    throw Error("Invalid dimensions.");
  if ([s.strokeOpacity, s.fillOpacity].some((v) => v < 0 || v > 1))
    throw Error("Invalid opacity.");
  finite(input.style);
  finite(input.context.viewport);
}
/** Inactive: existing session and native host retain lifecycle and persistence ownership. */
export const translateNightingale: TranslateNightingale = (input) => {
  try {
    admit(input);
    const data = nightingaleData(input);
    const c = input.style.common;
    const options = {
      animation: false,
      textStyle: { color: c.textColor, fontFamily: c.fontFamily, fontSize: c.fontSize },
      ...nightingaleLayout(input, data),
      series: nightingaleSeries(input, data),
      tooltip: nightingaleTooltip(input),
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
            "Nightingale input could not be safely projected into finite geometry.",
        },
      ],
    };
  }
};
