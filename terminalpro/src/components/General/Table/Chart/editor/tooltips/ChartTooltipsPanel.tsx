import { Switch } from "../../../../../ds/atoms/Switch";
import "../titles/chartTitlesPanel.css";

export interface ChartTooltipsState {
  enabled: boolean;
  mode: string;
}
export type ChartTooltipsEdit =
  | { field: "enabled"; value: boolean }
  | { field: "mode"; value: string };
export interface ChartTooltipsPanelProps {
  value: ChartTooltipsState;
  onEdit: (edit: ChartTooltipsEdit) => void;
  modes: readonly { value: string; label: string }[];
}
export function ChartTooltipsPanel({ value, onEdit, modes }: ChartTooltipsPanelProps) {
  const known = modes.some((mode) => mode.value === value.mode);
  return (
    <fieldset
      className="chart-titles-panel chart-caption-section"
      aria-label="Tooltips"
    >
      <div className="chart-caption-toggle">
        <span>Tooltips</span>
        <Switch
          aria-label="Tooltips"
          checked={value.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })}
        />
      </div>
      {value.enabled && (
        <div className="chart-caption-fields">
          <label className="chart-caption-row">
            <span>Tooltip Mode</span>
            <select
              aria-label="Tooltip Mode"
              value={value.mode}
              onChange={(event) => onEdit({ field: "mode", value: event.target.value })}
            >
              {!known && <option value={value.mode}>{value.mode}</option>}
              {modes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </fieldset>
  );
}
