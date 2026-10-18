import { Switch } from "../../../../../ds/atoms/Switch";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";

export interface ChartGridLinesState {
  enabled: boolean;
  color: string;
  thickness: number;
  lineDash: number;
}
export type ChartGridLinesEdit =
  | { field: "enabled"; value: boolean }
  | { field: "color"; value: string }
  | { field: "thickness" | "lineDash"; value: number };
export interface ChartGridLinesPanelProps {
  value: ChartGridLinesState;
  onEdit: (edit: ChartGridLinesEdit) => void;
}

const numericFields = [
  { field: "thickness", label: "Thickness", min: 0, max: 10 },
  { field: "lineDash", label: "Line Dash", min: 0, max: 30 },
] as const;

export function ChartGridLinesPanel({ value, onEdit }: ChartGridLinesPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Grid Lines">
      <div className="chart-caption-toggle">
        <span>Grid Lines</span>
        <Switch aria-label="Grid Lines" checked={value.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })} />
      </div>
      {value.enabled && (
        <div className="chart-caption-fields">
          <CaptionColorInput value={value.color}
            onChange={(value) => onEdit({ field: "color", value })} />
          {numericFields.map(({ field, label, min, max }) => (
            <ChartNumberInput key={field} label={label} value={value[field]}
              min={min} max={Math.max(value[field], max)} rangeStep={1} numberStep="any"
              onChange={(value) => onEdit({ field, value })} />
          ))}
        </div>
      )}
    </fieldset>
  );
}
