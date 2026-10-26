import { Switch } from "../../../../../ds/atoms/Switch";
import type {
  FunnelDropOffEdit,
  FunnelEditorState,
} from "../../application/funnelEditorTypes";
import { ChartSeriesStylePanel } from "../series/ChartSeriesStylePanel";
export interface FunnelDropOffPanelProps {
  readonly state: NonNullable<FunnelEditorState["dropOff"]>;
  readonly onEdit: (edit: FunnelDropOffEdit) => void;
}
export function FunnelDropOffPanel({ state, onEdit }: FunnelDropOffPanelProps) {
  return (
    <fieldset
      className="chart-titles-panel chart-caption-section"
      aria-label="Drop-Off"
    >
      <div className="chart-caption-toggle">
        <span>Drop-Off</span>
        <Switch
          aria-label="Drop-Off"
          checked={state.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })}
        />
      </div>
      {state.enabled && (
        <ChartSeriesStylePanel controls={state.controls} onEdit={onEdit} />
      )}
    </fieldset>
  );
}
