import type { PrepareRadarSelection } from "../compatibility/radarContracts";
import { resolveRadarAppearance } from "./radarAppearance";
import { projectRadarEditorState } from "./radarEditorState";
export const prepareRadarSelection: PrepareRadarSelection = (input) => {
  try {
    const snapshot = input.projection.snapshot;
    const assignments = snapshot.selectedColumnIds
      .filter((id) =>
        snapshot.columns.some((column) => column.id === id && column.role === "number"),
      )
      .map((colId) => ({ colId }));
    const style = resolveRadarAppearance(input);
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
          assignments,
          style,
          context: {
            observations: { kind: "raw-observations" },
            display: input.display,
            viewport: input.viewport,
            ...(input.legendSelection
              ? { legendSelection: input.legendSelection }
              : {}),
          },
        },
        editor: projectRadarEditorState(style, input.family),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Radar selection",
    };
  }
};
