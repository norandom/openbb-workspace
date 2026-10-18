import { Switch } from "../../../../../ds/atoms/Switch";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";

export interface ChartShadowState {
  enabled: boolean;
  color: string;
  blur: number;
  xOffset: number;
  yOffset: number;
}
export type ChartShadowEdit =
  | { field: "enabled"; value: boolean }
  | { field: "color"; value: string }
  | { field: "blur" | "xOffset" | "yOffset"; value: number };
export interface ChartShadowPanelProps {
  value: ChartShadowState;
  onEdit: (edit: ChartShadowEdit) => void;
}

const numericFields = [
  { field: "blur", label: "Blur", min: 0, max: 20 },
  { field: "xOffset", label: "X Offset", min: -10, max: 10 },
  { field: "yOffset", label: "Y Offset", min: -10, max: 10 },
] as const;

export function ChartShadowPanel({ value, onEdit }: ChartShadowPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Shadow">
      <div className="chart-caption-toggle">
        <span>Shadow</span>
        <Switch aria-label="Shadow" checked={value.enabled}
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
