import { resolveRadialAssignments } from "../compatibility/radialAssignments";
import type { PrepareRadialSelection } from "../compatibility/radialContracts";
import { resolveRadialAppearance } from "./radialAppearance";
import { projectRadialEditorState } from "./radialEditorState";
export const prepareRadialSelection: PrepareRadialSelection = (input) => {
  try {
    const snapshot = input.projection.snapshot;
    const resolved = resolveRadialAssignments({
      chartType: input.family,
      valueColumns: snapshot.selectedColumnIds
        .filter((id) =>
          snapshot.columns.some(
            (column) => column.id === id && column.role === "number",
          ),
        )
        .map((colId) => ({ colId, selected: true })),
    });
    if (resolved.status !== "resolved")
      throw Error(resolved.diagnostics[0].message);
    const assignments = resolved.assignments;
    if (input.family !== "radialColumn" && input.family !== "radialBar")
      throw Error("Invalid Radial family");
    const storedGroupType = input.baseline.model.seriesGroupType;
    const groupType =
      storedGroupType === undefined ? "grouped" : storedGroupType;
    if (
      groupType !== "grouped" &&
      groupType !== "stacked" &&
      groupType !== "normalized"
    )
      throw Error("Invalid Radial Group Type");
    const style = resolveRadialAppearance(input);
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
            numericAxisLabel:
              groupType === "normalized"
                ? (value) => value
                : input.display.numericAxis,
            display: input.display,
            viewport: input.viewport,
            ...(input.legendSelection
              ? { legendSelection: input.legendSelection }
              : {}),
          },
        },
        editor: projectRadialEditorState(style, groupType),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error ? error.message : "Invalid Radial selection",
    };
  }
};
