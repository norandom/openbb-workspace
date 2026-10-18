import { LegendChoiceInput, type LegendChoice } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";
import "../legend/chartLegendPanel.css";

export interface ChartAxisFieldsState {
  type: string;
  timeFormat: string;
  position: string;
  color: string;
  thickness: number;
}
export type ChartAxisFieldsEdit =
  | { field: "type" | "timeFormat" | "position" | "color"; value: string }
  | { field: "thickness"; value: number };
export interface ChartAxisFieldsPanelProps {
  value: ChartAxisFieldsState;
  onEdit: (edit: ChartAxisFieldsEdit) => void;
  types?: readonly LegendChoice<string>[];
  timeFormats?: readonly LegendChoice<string>[];
  positions?: readonly LegendChoice<string>[];
}

export function ChartAxisFieldsPanel({
  value,
  onEdit,
  types,
  timeFormats,
  positions,
}: ChartAxisFieldsPanelProps) {
  return (
    <div className="chart-titles-panel chart-legend-panel chart-caption-section chart-caption-fields">
      {types !== undefined && (
        <LegendChoiceInput label="Axis Type" value={value.type} choices={types}
          onChange={(value) => onEdit({ field: "type", value })} />
      )}
      {timeFormats !== undefined && (
        <LegendChoiceInput label="Time Format" value={value.timeFormat} choices={timeFormats}
          onChange={(value) => onEdit({ field: "timeFormat", value })} />
      )}
      {positions !== undefined && (
        <LegendChoiceInput label="Position" value={value.position} choices={positions}
          onChange={(value) => onEdit({ field: "position", value })} />
      )}
      <CaptionColorInput value={value.color}
        onChange={(value) => onEdit({ field: "color", value })} />
      <ChartNumberInput label="Thickness" value={value.thickness} min={0}
        max={Math.max(value.thickness, 10)} rangeStep={1} numberStep="any"
        onChange={(value) => onEdit({ field: "thickness", value })} />
    </div>
  );
}
