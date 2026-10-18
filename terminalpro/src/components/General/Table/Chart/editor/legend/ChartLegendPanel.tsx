import { useState } from "react";
import { Switch } from "../../../../../ds/atoms/Switch";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import {
  LegendChoiceInput,
  LegendNumberInput,
  type LegendBounds,
  type LegendChoice,
} from "./LegendInputs";
import "../titles/chartTitlesPanel.css";
import "./chartLegendPanel.css";

export interface ChartLegendState {
  enabled: boolean;
  font: string;
  weight: string;
  color: string;
  position: string;
  size: number;
  spacing: number;
  markerSize: number;
  markerStroke: number;
  itemSpacing: number;
  horizontalSpacing: number;
  verticalSpacing: number;
}
type NumericField =
  | "spacing"
  | "markerSize"
  | "markerStroke"
  | "itemSpacing"
  | "horizontalSpacing"
  | "verticalSpacing";
export type ChartLegendEdit = {
  [Field in keyof ChartLegendState]: { field: Field; value: ChartLegendState[Field] };
}[keyof ChartLegendState];
export interface ChartLegendPanelProps {
  value: ChartLegendState;
  onEdit: (edit: ChartLegendEdit) => void;
  fonts: readonly LegendChoice<string>[];
  weights: readonly LegendChoice<string>[];
  positions: readonly LegendChoice<string>[];
  sizes: readonly LegendChoice<number>[];
  bounds: Record<NumericField, LegendBounds>;
}
const numericFields: readonly [NumericField, string][] = [
  ["spacing", "Spacing"],
  ["markerSize", "Marker Size"],
  ["markerStroke", "Marker Stroke"],
  ["itemSpacing", "Item Spacing"],
  ["horizontalSpacing", "Horizontal Spacing"],
  ["verticalSpacing", "Vertical Spacing"],
];
function LegendFields({
  value,
  fonts,
  weights,
  positions,
  sizes,
  bounds,
  onEdit,
}: ChartLegendPanelProps) {
  return (
    <div className="chart-caption-fields">
      <LegendChoiceInput
        label="Font"
        value={value.font}
        choices={fonts}
        onChange={(value) => onEdit({ field: "font", value })}
      />
      <LegendChoiceInput
        label="Weight"
        value={value.weight}
        choices={weights}
        onChange={(value) => onEdit({ field: "weight", value })}
      />
      <div className="chart-legend-size-color">
        <LegendChoiceInput
          label="Size"
          value={value.size}
          choices={sizes}
          onChange={(value) => onEdit({ field: "size", value })}
        />
        <CaptionColorInput
          value={value.color}
          onChange={(value) => onEdit({ field: "color", value })}
        />
      </div>
      <LegendChoiceInput
        label="Position"
        value={value.position}
        choices={positions}
        onChange={(value) => onEdit({ field: "position", value })}
      />
      {numericFields.map(([field, label]) => (
        <LegendNumberInput
          key={field}
          label={label}
          value={value[field]}
          bounds={bounds[field]}
          onChange={(value) => onEdit({ field, value })}
        />
      ))}
    </div>
  );
}
export function ChartLegendPanel(props: ChartLegendPanelProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="chart-titles-panel chart-legend-panel">
      <button
        type="button"
        className="chart-titles-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">{expanded ? "⌄" : "›"}</span> Legend
      </button>
      {expanded && (
        <fieldset className="chart-caption-section" aria-label="Legend">
          <div className="chart-caption-toggle">
            <span>Enabled</span>
            <Switch
              aria-label="Enabled"
              checked={props.value.enabled}
              onCheckedChange={(value) => props.onEdit({ field: "enabled", value })}
            />
          </div>
          {props.value.enabled && <LegendFields {...props} />}
        </fieldset>
      )}
    </div>
  );
}
