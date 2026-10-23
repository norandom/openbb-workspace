import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { selectOptionBaseline } from "../compatibility/optionState";
import { composeAppearanceOptions } from "./appearanceComposition";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { at, object } from "./effectiveAppearanceValues";
import type { WaterfallAppearanceInput } from "./waterfallTypes";

/** Theme arrays replace lower arrays; a short saved dash must not retain old entries. */
function layerMerge(...layers: RuntimeOptions[]): RuntimeOptions {
  const result: RuntimeOptions = {};
  for (const layer of layers)
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined) continue;
      const previous = result[key];
      result[key] =
        value !== null && typeof value === "object" && !Array.isArray(value)
          ? layerMerge(
              previous !== null &&
                typeof previous === "object" &&
                !Array.isArray(previous)
                ? previous
                : {},
              object(value),
            )
          : value;
    }
  return result;
}

function defaults(input: WaterfallAppearanceInput): RuntimeOptions {
  const item = Object.fromEntries(
    (["positive", "negative", "total"] as const).map((sign) => [
      sign,
      {
        ...input.paint[sign],
        name: sign[0].toUpperCase() + sign.slice(1),
        strokeWidth: 0,
        strokeOpacity: 1,
        fillOpacity: 1,
        lineDash: [0],
        lineDashOffset: 0,
        label: {
          enabled: false,
          fontFamily: "Verdana, sans-serif",
          fontSize: 12,
          fontWeight: 400,
          color: input.theme.colors.textColor,
          placement: "inside-center",
          spacing: 0,
        },
      },
    ]),
  );
  return {
    legend: { enabled: true },
    series: {
      direction: "vertical",
      visible: true,
      tooltip: { enabled: true },
      item,
      line: {
        enabled: true,
        stroke: input.paint.connectorStroke,
        strokeWidth: 2,
        strokeOpacity: 1,
        lineDash: [0],
        lineDashOffset: 0,
      },
    },
  };
}

export function prepareWaterfallAppearance(source: WaterfallAppearanceInput) {
  const copied = selectOptionBaseline({
    kind: "synchronize",
    stateAddress: "waterfall-appearance",
    previous: {
      stateAddress: "waterfall-appearance",
      chartType: "waterfall",
      model: {},
      options: source,
    },
  });
  if (!copied.valid) throw Error(copied.error);
  const input = copied.value.options as unknown as WaterfallAppearanceInput;
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const common = layerMerge(
    object(input.theme.overrides.common),
    object(composed.value.common),
  );
  const family = layerMerge(
    object(input.theme.overrides.waterfall),
    object(composed.value.waterfall),
  );
  const supplied = layerMerge(common, family);
  const base = defaults(input);
  // The retained engine tests explicit item.stroke, independently for each sign.
  for (const sign of ["positive", "negative", "total"])
    if (at(supplied, `series.item.${sign}.stroke`) !== undefined)
      object(at(base, `series.item.${sign}`)).strokeWidth = 2;
  const layers = [
    merge({}, appearanceDefaults({ ...input, family: "waterfall" }), base),
    common,
    family,
  ];
  return { input, layers, series: object(layerMerge(...layers).series) };
}
