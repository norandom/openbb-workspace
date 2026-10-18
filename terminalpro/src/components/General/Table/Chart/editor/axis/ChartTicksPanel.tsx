import { Switch } from "../../../../../ds/atoms/Switch";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";

export interface ChartTicksState {
  enabled: boolean;
  color: string;
  width: number;
  length: number;
}
export type ChartTicksEdit =
  | { field: "enabled"; value: boolean }
  | { field: "color"; value: string }
  | { field: "width" | "length"; value: number };
export interface ChartTicksPanelProps {
  value: ChartTicksState;
  onEdit: (edit: ChartTicksEdit) => void;
  showLength: boolean;
}

const numericFields = [
  { field: "width", label: "Width", min: 0, max: 10 },
  { field: "length", label: "Length", min: 0, max: 30 },
] as const;

export function ChartTicksPanel({ value, onEdit, showLength }: ChartTicksPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Ticks">
      <div className="chart-caption-toggle">
        <span>Ticks</span>
        <Switch aria-label="Ticks" checked={value.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })} />
      </div>
      {value.enabled && (
        <div className="chart-caption-fields">
          <CaptionColorInput value={value.color}
            onChange={(value) => onEdit({ field: "color", value })} />
          {numericFields.filter(({ field }) => field !== "length" || showLength).map(({ field, label, min, max }) => (
            <ChartNumberInput key={field} label={label} value={value[field]}
              min={min} max={Math.max(value[field], max)} rangeStep={1} numberStep="any"
              onChange={(value) => onEdit({ field, value })} />
          ))}
        </div>
      )}
    </fieldset>
  );
}
