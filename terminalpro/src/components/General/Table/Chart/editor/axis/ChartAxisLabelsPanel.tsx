import { LegendChoiceInput, type LegendChoice } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import { ChartAxisRotationInput } from "./ChartAxisRotationInput";
import "../titles/chartTitlesPanel.css";
import "../legend/chartLegendPanel.css";
import "./chartAxisLabelsPanel.css";

export interface ChartAxisLabelsState {
  font: string;
  weight: string;
  size: number;
  color: string;
  padding: number;
  autoRotate: boolean;
  rotation: number | undefined;
}
export type ChartAxisLabelsEdit = {
  [Field in keyof ChartAxisLabelsState]: { field: Field; value: ChartAxisLabelsState[Field] };
}[keyof ChartAxisLabelsState];
export interface ChartAxisLabelsPanelProps {
  value: ChartAxisLabelsState;
  onEdit: (edit: ChartAxisLabelsEdit) => void;
  fonts: readonly LegendChoice<string>[];
  weights: readonly LegendChoice<string>[];
  sizes: readonly LegendChoice<number>[];
  showAutoRotate: boolean;
}

export function ChartAxisLabelsPanel({ value, onEdit, fonts, weights, sizes, showAutoRotate }: ChartAxisLabelsPanelProps) {
  return (
    <fieldset className="chart-titles-panel chart-caption-section chart-axis-labels" aria-label="Labels">
      <div className="chart-caption-toggle"><span>Labels</span></div>
      <div className="chart-caption-fields">
        <LegendChoiceInput label="Font" value={value.font} choices={fonts}
          onChange={(value) => onEdit({ field: "font", value })} />
        <LegendChoiceInput label="Weight" value={value.weight} choices={weights}
          onChange={(value) => onEdit({ field: "weight", value })} />
        <div className="chart-legend-size-color">
          <LegendChoiceInput label="Size" value={value.size} choices={sizes}
            onChange={(value) => onEdit({ field: "size", value })} />
          <CaptionColorInput value={value.color} onChange={(value) => onEdit({ field: "color", value })} />
        </div>
        <ChartNumberInput label="Padding" value={value.padding} min={0} max={Math.max(value.padding, 30)}
          rangeStep={1} numberStep="any" onChange={(value) => onEdit({ field: "padding", value })} />
        {showAutoRotate && (
          <label className="chart-axis-auto-rotate">
            <input type="checkbox" checked={value.autoRotate}
              onChange={(event) => onEdit({ field: "autoRotate", value: event.target.checked })} />
            <span>Auto Rotate</span>
          </label>
        )}
        {!value.autoRotate && <ChartAxisRotationInput value={value.rotation}
          onChange={(value) => onEdit({ field: "rotation", value })} />}
      </div>
    </fieldset>
  );
}
