import type { CartesianFamily } from "../../echarts/cartesianTypes";
import type { ApplicationAxisId } from "../../application/appearanceModel";
import type { EditorEligibility } from "./types";

export interface EditorPredicateInput {
  readonly family: CartesianFamily;
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
    shadow: input.family !== "line",
    labels: true,
    markers: input.family === "line",
    connectMissingData: input.family === "line",
    axes: {
      category: {
        ...common,
        type: numerical && !input.grouping && !input.categorySeriesSwitched,
        timeFormat: category === "time",
        tickLength: category !== "grouped-category",
        autoRotate: category !== "grouped-category",
      },
      number: {
        ...common,
        type: false,
        timeFormat: false,
        tickLength: true,
        autoRotate: true,
      },
    },
  };
}
