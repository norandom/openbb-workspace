import type { PrepareNightingaleSelection } from "../compatibility/nightingaleContracts";
import { resolveNightingaleAppearance } from "./nightingaleAppearance";
import { projectNightingaleEditorState } from "./nightingaleEditorState";
export const prepareNightingaleSelection: PrepareNightingaleSelection = (input) => {
  try {
    const snapshot = input.projection.snapshot;
    const assignments = snapshot.selectedColumnIds
      .filter((id) =>
        snapshot.columns.some((column) => column.id === id && column.role === "number"),
      )
      .map((colId) => ({ colId }));
    if (input.family !== "nightingale") throw Error("Invalid Nightingale family");
    const storedGroupType = input.baseline.model.seriesGroupType;
    const groupType = storedGroupType === undefined ? "stacked" : storedGroupType;
    if (
      groupType !== "grouped" &&
      groupType !== "stacked" &&
      groupType !== "normalized"
    )
      throw Error("Invalid Nightingale Group Type");
    const style = resolveNightingaleAppearance(input);
    return {
      valid: true,
      value: {
        baseline: input.baseline,
        range: input.range,
        setup: input.setup,
        projection: input.projection,
        mapping: {
          snapshot,
          family: input.family,
          groupType,
          assignments,
          style,
          context: {
            observationKind: input.projection.observationKind,
            radialAxisLabel:
              groupType === "normalized" ? (value) => value : input.display.numericAxis,
            display: input.display,
            viewport: input.viewport,
            ...(input.legendSelection
              ? { legendSelection: input.legendSelection }
              : {}),
          },
        },
        editor: projectNightingaleEditorState(style, groupType),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Nightingale selection",
    };
  }
};
