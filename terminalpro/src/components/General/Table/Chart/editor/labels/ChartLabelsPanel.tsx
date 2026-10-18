import { Switch } from "../../../../../ds/atoms/Switch";
import { LegendChoiceInput, type LegendChoice } from "../legend/LegendInputs";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";
import "../legend/chartLegendPanel.css";

export interface ChartLabelsState {
  enabled: boolean;
  font: string;
  weight: string;
  size: number;
  color: string;
}
export type ChartLabelsEdit = {
  [Field in keyof ChartLabelsState]: { field: Field; value: ChartLabelsState[Field] };
}[keyof ChartLabelsState];
export interface ChartLabelsPanelProps {
  value: ChartLabelsState;
  onEdit: (edit: ChartLabelsEdit) => void;
  fonts: readonly LegendChoice<string>[];
  weights: readonly LegendChoice<string>[];
  sizes: readonly LegendChoice<number>[];
}

export function ChartLabelsPanel({
  value, onEdit, fonts, weights, sizes,
}: ChartLabelsPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section" aria-label="Labels">
      <div className="chart-caption-toggle">
        <span>Labels</span>
        <Switch aria-label="Labels" checked={value.enabled}
          onCheckedChange={(value) => onEdit({ field: "enabled", value })} />
      </div>
      {value.enabled && (
        <div className="chart-caption-fields">
          <LegendChoiceInput label="Font" value={value.font} choices={fonts}
            onChange={(value) => onEdit({ field: "font", value })} />
          <LegendChoiceInput label="Weight" value={value.weight} choices={weights}
            onChange={(value) => onEdit({ field: "weight", value })} />
          <div className="chart-legend-size-color">
            <LegendChoiceInput label="Size" value={value.size} choices={sizes}
              onChange={(value) => onEdit({ field: "size", value })} />
            <CaptionColorInput value={value.color}
              onChange={(value) => onEdit({ field: "color", value })} />
          </div>
        </div>
      )}
    </fieldset>
  );
}
