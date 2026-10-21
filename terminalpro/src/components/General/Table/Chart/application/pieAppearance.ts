import merge from "lodash.merge";
import type { PieChartType } from "../compatibility/pieAssignments";
import type { PieMappingInput } from "../echarts/pieTypes";
import type { AppearanceInput } from "./appearanceModel";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { resolveAppearanceChrome } from "./effectiveAppearanceChrome";
import { at, bool, child, font, number, object } from "./effectiveAppearanceValues";
import { resolveAppearanceSeries } from "./effectiveAppearanceSeries";

export function resolvePieAppearance(input: Omit<AppearanceInput, "family" | "axisRuntime"> & { family: PieChartType }) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const family = input.family === "pie" ? "pie" : "donut";
  const typography = { fontFamily: "Verdana, sans-serif", fontSize: 12, fontWeight: 400 };
  const defaults = merge({}, appearanceDefaults(input), {
    legend: { enabled: true }, tooltip: { mode: "single" },
    series: {
      rotation: 0, outerRadiusRatio: 1,
      calloutLabel: { ...typography, enabled: true, color: input.theme.colors.textColor, offset: 3, minAngle: 0.001 },
      calloutLine: { length: 10, strokeWidth: 2 },
      sectorLabel: { ...typography, enabled: true, color: input.theme.colors.chartBackgroundColor, positionRatio: 0.5, positionOffset: 0 },
    },
  });
  const layers = [defaults, object(input.theme.overrides.common), object(input.theme.overrides[family]),
    object(composed.value.common), object(composed.value[family])];
  const effective = merge({}, ...layers);
  const read = (path: string) => at(effective, path);
  const paint = resolveAppearanceSeries(child(read, "series"));
  const application = resolveAppearanceChrome(layers, input.theme.palette, paint.strokeWidth);
  const style: PieMappingInput["style"] = {
    common: { textColor: input.theme.colors.textColor, fontFamily: application.title.font,
      fontSize: application.title.size, precision: input.precision },
    application,
    series: {
      paint: { strokeWidth: paint.strokeWidth, strokeOpacity: paint.strokeOpacity,
        fillOpacity: paint.fillOpacity, lineDash: paint.lineDash, shadow: paint.shadow,
        ...(read("series.fill") === undefined ? {} : { fill: read("series.fill") as string }),
        ...(read("series.stroke") === undefined ? {} : { stroke: read("series.stroke") as string }) },
      rotation: number(read("series.rotation"), Number.NEGATIVE_INFINITY), outerRadiusRatio: number(read("series.outerRadiusRatio"), 0, 1),
      ...(read("series.innerRadiusRatio") === undefined ? {} : { innerRadiusRatio: number(read("series.innerRadiusRatio"), 0, 1) }),
      calloutLabel: { ...font(child(read, "series.calloutLabel")), enabled: bool(read("series.calloutLabel.enabled")), offset: number(read("series.calloutLabel.offset")), minAngle: number(read("series.calloutLabel.minAngle"), 0, 360) },
      calloutLine: { length: number(read("series.calloutLine.length")), strokeWidth: number(read("series.calloutLine.strokeWidth")),
        ...(read("series.calloutLine.colors") === undefined ? {} : { colors: read("series.calloutLine.colors") as string[] }) },
      sectorLabel: { ...font(child(read, "series.sectorLabel")), enabled: bool(read("series.sectorLabel.enabled")), positionRatio: number(read("series.sectorLabel.positionRatio"), 0, 1), positionOffset: number(read("series.sectorLabel.positionOffset"), Number.NEGATIVE_INFINITY) },
    },
  };
  return { application, style };
}
