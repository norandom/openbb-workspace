import type { ApplicationAxisId } from "../../application/appearanceModel";
import { isAreaFamily } from "../../echarts/cartesianAreaTypes";
import { isLineFamily } from "../../echarts/cartesianLineTypes";
import type { CartesianFamily } from "../../echarts/cartesianTypes";
import type { EditorEligibility } from "./types";

export interface EditorPredicateInput {
  readonly family: CartesianFamily | "rangeBar" | "rangeArea" | "waterfall";
  readonly firstDatum: Readonly<Record<string, unknown>> | undefined;
  readonly dimensionIds: readonly string[];
  readonly grouping: boolean;
  readonly categorySeriesSwitched: boolean;
  readonly axisTypes: Readonly<Record<ApplicationAxisId, string>>;
}
/** Source parseFloat eligibility deliberately admits original numeric-prefix dimension values. */
export function deriveEditorEligibility(
  input: EditorPredicateInput,
): EditorEligibility {
  const numerical =
    !!input.firstDatum &&
    input.dimensionIds.every(
      (id) => !Number.isNaN(Number.parseFloat(String(input.firstDatum?.[id]))),
    );
  const category = input.axisTypes.category;
  const common = { position: true, grid: true, ticks: true };
  return {
    legend: true,
    shadow:
      !isLineFamily(input.family) &&
      input.family !== "rangeBar" &&
      input.family !== "waterfall",
    labels: input.family !== "waterfall",
    markers:
      isLineFamily(input.family) ||
      isAreaFamily(input.family) ||
      input.family === "rangeArea",
    connectMissingData: input.family === "line" || input.family === "rangeArea",
    axes: {
      category: {
        ...common,
        type:
          input.family !== "rangeBar" &&
          numerical &&
          !input.grouping &&
          !input.categorySeriesSwitched,
        timeFormat: category === "time",
        ticks: input.family !== "rangeBar" && input.family !== "waterfall",
        tickLength:
          input.family !== "rangeBar" &&
          input.family !== "waterfall" &&
          category !== "grouped-category",
        autoRotate: category !== "grouped-category",
      },
      number: {
        ...common,
        type: false,
        timeFormat: false,
        ticks: input.family !== "rangeBar" && input.family !== "waterfall",
        tickLength: input.family !== "rangeBar" && input.family !== "waterfall",
        autoRotate: true,
      },
    },
  };
}
