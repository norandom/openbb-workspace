import type {
  HeatmapAxisId,
  HeatmapEditIntent,
  HeatmapEditorState,
} from "../../application/heatmapTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartAxisFieldsPanel } from "../axis/ChartAxisFieldsPanel";
import { ChartAxisLabelsPanel } from "../axis/ChartAxisLabelsPanel";
import { ChartTicksPanel } from "../axis/ChartTicksPanel";
export interface HeatmapAxisEditorProps {
  readonly axis: HeatmapAxisId;
  readonly state: HeatmapEditorState;
  readonly onEdit: (intent: HeatmapEditIntent) => void;
}
export function HeatmapAxisEditor({ axis, state, onEdit }: HeatmapAxisEditorProps) {
  const values = state.axes[axis];
  return (
    <ApplicationEditorGroup label={axis === "x" ? "Horizontal Axis" : "Vertical Axis"}>
      <ChartAxisFieldsPanel
        {...values.fields}
        onEdit={(edit) => {
          if (edit.field === "color")
            onEdit({
              panel: "heatmapAxis",
              axis,
              edit: { field: "color", value: edit.value },
            });
          else if (edit.field === "thickness")
            onEdit({ panel: "heatmapAxis", axis, edit });
        }}
      />
      <ChartTicksPanel
        {...values.ticks}
        onEdit={(edit) => onEdit({ panel: "heatmapTicks", axis, edit })}
      />
      <ChartAxisLabelsPanel
        {...values.labels}
        onEdit={(edit) => onEdit({ panel: "heatmapAxisLabels", axis, edit })}
      />
    </ApplicationEditorGroup>
  );
}
