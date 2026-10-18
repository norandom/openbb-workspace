import { Switch } from "../../../../../ds/atoms/Switch";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";

export interface ChartBackgroundState {
  visible: boolean;
  fill: string;
}
export type ChartBackgroundEdit =
  | { field: "visible"; value: boolean }
  | { field: "fill"; value: string };
export interface ChartBackgroundPanelProps {
  value: ChartBackgroundState;
  onEdit: (edit: ChartBackgroundEdit) => void;
}
export function ChartBackgroundPanel({ value, onEdit }: ChartBackgroundPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Background">
      <div className="chart-caption-toggle">
        <span>Background</span>
        <Switch
          aria-label="Background"
          checked={value.visible}
          onCheckedChange={(value) => onEdit({ field: "visible", value })}
        />
      </div>
      {value.visible && (
        <div className="chart-caption-fields">
          <CaptionColorInput
            value={value.fill}
            onChange={(value) => onEdit({ field: "fill", value })}
          />
        </div>
      )}
    </fieldset>
  );
}
