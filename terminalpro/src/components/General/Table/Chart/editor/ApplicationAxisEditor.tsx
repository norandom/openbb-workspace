import { horizontalAxisId } from "../compatibility/editorBindings/metadata";
import type { ApplicationAxisId } from "../application/appearanceModel";
import type {
  ApplicationAxisStructureEvent,
  ApplicationEditorIntent,
  ApplicationEditorState,
} from "../compatibility/editorBindings/types";
import {
  ChartAxisFieldsPanel,
  type ChartAxisFieldsEdit,
} from "./axis/ChartAxisFieldsPanel";
import { ChartAxisLabelsPanel } from "./axis/ChartAxisLabelsPanel";
import { ChartGridLinesPanel } from "./axis/ChartGridLinesPanel";
import { ChartTicksPanel } from "./axis/ChartTicksPanel";
import { ApplicationEditorGroup } from "./ApplicationEditorGroup";

interface Props {
  axis: ApplicationAxisId;
  state: ApplicationEditorState;
  onIntent: (intent: ApplicationEditorIntent) => void;
  onAxisStructure: (event: ApplicationAxisStructureEvent) => void;
}
export function ApplicationAxisEditor({
  axis,
  state,
  onIntent,
  onAxisStructure,
}: Props) {
  const values = state.axes[axis];
  const eligibility = state.eligibility.axes[axis];
  function editAxis(edit: ChartAxisFieldsEdit) {
    if (edit.field === "color")
      onIntent({ panel: "axis", axis, edit: { field: "color", value: edit.value } });
    else if (edit.field === "thickness") onIntent({ panel: "axis", axis, edit });
    else
      onAxisStructure({
        panel: "axisStructure",
        axis,
        edit: { field: edit.field, value: edit.value },
      });
  }
  return (
    <ApplicationEditorGroup
      label={axis === horizontalAxisId(state.axes) ? "Horizontal Axis" : "Vertical Axis"}
    >
      <ChartAxisFieldsPanel {...values.fields} onEdit={editAxis} />
      {eligibility.grid && (
        <ChartGridLinesPanel
          {...values.grid}
          onEdit={(edit) => onIntent({ panel: "grid", axis, edit })}
        />
      )}
      {eligibility.ticks && (
        <ChartTicksPanel
          {...values.ticks}
          onEdit={(edit) => onIntent({ panel: "ticks", axis, edit })}
        />
      )}
      <ChartAxisLabelsPanel
        {...values.labels}
        onEdit={(edit) => onIntent({ panel: "axisLabels", axis, edit })}
      />
    </ApplicationEditorGroup>
  );
}
