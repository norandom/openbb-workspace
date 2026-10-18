import { Switch } from "../../../../../ds/atoms/Switch";
import { LegendChoiceInput, type LegendChoice } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import "../titles/chartTitlesPanel.css";

export interface ChartMarkersState {
  enabled: boolean;
  shape: string;
  size: number;
  strokeWidth: number;
}
export type ChartMarkersEdit = {
  [Field in keyof ChartMarkersState]: { field: Field; value: ChartMarkersState[Field] };
}[keyof ChartMarkersState];
export interface ChartMarkersPanelProps {
  value: ChartMarkersState;
  onEdit: (edit: ChartMarkersEdit) => void;
  shapes: readonly LegendChoice<string>[];
}

const numericFields = [
  { field: "size", label: "Size", max: 60 },
  { field: "strokeWidth", label: "Stroke Width", max: 10 },
] as const;

export function ChartMarkersPanel({ value, onEdit, shapes }: ChartMarkersPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Markers">
      <div className="chart-caption-toggle">
        <span>Markers</span>
        <Switch aria-label="Markers" checked={value.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })} />
      </div>
      {value.enabled && (
        <div className="chart-caption-fields">
          <LegendChoiceInput label="Shape" value={value.shape} choices={shapes}
            onChange={(value) => onEdit({ field: "shape", value })} />
          {numericFields.map(({ field, label, max }) => (
            <ChartNumberInput key={field} label={label} value={value[field]}
              min={0} max={Math.max(value[field], max)} rangeStep={1} numberStep="any"
              onChange={(value) => onEdit({ field, value })} />
          ))}
        </div>
      )}
    </fieldset>
  );
}
