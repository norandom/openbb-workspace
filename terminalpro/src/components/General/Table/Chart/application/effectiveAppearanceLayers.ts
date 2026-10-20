import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import { isAreaFamily } from "../echarts/cartesianAreaTypes";
import { composeAppearanceOptions } from "./appearanceComposition";
import type { AppearanceInput } from "./appearanceModel";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { at, object } from "./effectiveAppearanceValues";

export function appearanceLayers(input: AppearanceInput): RuntimeOptions[] {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw new Error(composed.error);
  const selected = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "appearance",
    previous: {
      stateAddress: "appearance",
      chartType: input.family,
      model: {},
      options: input.theme.overrides,
    },
  });
  if (!selected.valid) throw new Error(selected.error);
  const family = isAreaFamily(input.family)
    ? "area"
    : input.family === "line"
      ? "line"
      : "bar";
  const overrides = [
    object(selected.value.options.common),
    object(selected.value.options[family]),
    object(composed.value.common),
    object(composed.value[family]),
  ];
  const supplied = merge({}, ...overrides);
  const defaults = appearanceDefaults(input);
  const series = object(defaults.series);
  if (input.family !== "line" && at(supplied, "series.stroke") !== undefined)
    series.strokeWidth = 2;
  if (at(supplied, "series.marker.stroke") !== undefined)
    object(series.marker).strokeWidth = 1;
  if (
    ["outside-start", "outside-end"].includes(
      String(at(supplied, "series.label.placement")),
    )
  )
    object(series.label).color = input.theme.colors.textColor;
  return [defaults, ...overrides];
}
