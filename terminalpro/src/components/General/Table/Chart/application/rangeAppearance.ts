import merge from "lodash.merge";
import type { RangeApplicationInput } from "../echarts/rangeApplicationTypes";
import type { RangeCategoryKind } from "../echarts/rangeCategoryTypes";
import { composeAppearanceOptions } from "./appearanceComposition";
import { resolveCommonAppearance } from "./effectiveAppearance";
import { resolveAppearanceAxis } from "./effectiveAppearanceAxes";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";
import { number, object } from "./effectiveAppearanceValues";
import {
  rangeAxisLabelPolicy,
  rangeAxisPolicy,
  rangeAxisRead,
  rangeConcreteAxes,
  rangeNumericPolicy,
} from "./rangeAxisAppearance";

export type RangeAppearanceInput = Pick<
  RangeApplicationInput,
  | "family"
  | "baseline"
  | "generated"
  | "theme"
  | "axisRuntime"
  | "legendEnabled"
  | "precision"
>;

export function resolveRangeAppearance(
  input: RangeAppearanceInput,
  seriesIds: readonly string[],
  kind: RangeCategoryKind,
  horizontal: boolean,
) {
  const composed = composeAppearanceOptions(input);
  if (!composed.valid) throw Error(composed.error);
  const key = input.family === "rangeBar" ? "range-bar" : "range-area";
  const source = { ...input, seriesIds };
  const layers = [
    appearanceDefaults(source),
    merge({}, object(input.theme.overrides.common), object(composed.value.common)),
    merge({}, object(input.theme.overrides[key]), object(composed.value[key])),
  ];
  const axisRuntime = rangeConcreteAxes(layers, input.axisRuntime, kind, horizontal);
  const common = resolveCommonAppearance({ ...source, axisRuntime }, layers);
  const categoryAxis = axisRuntime.axes[0];
  const valueAxis = axisRuntime.axes[1];
  const paint = (axis: typeof categoryAxis) =>
    resolveAppearanceAxis(
      [
        ...layers,
        {
          axes: { [axis.type]: { [axis.position]: axis.options } },
        },
      ],
      axis,
    );
  const application = {
    ...common,
    legend: { ...common.legend, enabled: input.legendEnabled ?? common.legend.enabled },
    axes: {
      category: rangeAxisLabelPolicy(layers, categoryAxis, paint(categoryAxis)),
      number: rangeAxisLabelPolicy(layers, valueAxis, paint(valueAxis)),
    },
  };
  return {
    application,
    axisRuntime,
    categoryPolicy: rangeAxisPolicy(layers, categoryAxis),
    valuePolicy: rangeNumericPolicy(rangeAxisPolicy(layers, valueAxis)),
    band: {
      paddingInner: number(
        rangeAxisRead(layers, categoryAxis, "paddingInner") ?? 0.3,
        0,
        1,
      ),
      paddingOuter: number(
        rangeAxisRead(layers, categoryAxis, "paddingOuter") ??
          (input.family === "rangeBar" ? 0.15 : 0),
        0,
        0.5,
      ),
      groupPaddingInner: number(
        rangeAxisRead(layers, categoryAxis, "groupPaddingInner") ?? 0.2,
        0,
        1,
      ),
    },
  };
}
export type RangeAppearance = ReturnType<typeof resolveRangeAppearance>;
