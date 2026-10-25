import { Switch } from "../../../../../ds/atoms/Switch";
import type { HierarchyGradientLegendPanelProps } from "../../application/hierarchyEditorTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { LegendChoiceInput, LegendNumberInput } from "../legend/LegendInputs";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";
import "../legend/chartLegendPanel.css";

function GradientFields({
  value,
  fonts,
  weights,
  sizes,
  positions,
  bounds,
  onEdit,
}: HierarchyGradientLegendPanelProps) {
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
        onChange={(position) =>
          onEdit({ field: "position", value: position as typeof value.position })
        }
      />
      <div className="chart-caption-toggle">
        <span>Reverse Direction</span>
        <Switch
          aria-label="Reverse Direction"
          checked={value.reverseOrder}
          onCheckedChange={(value) => onEdit({ field: "reverseOrder", value })}
        />
      </div>
      {(
        [
          ["thickness", "Thickness"],
          ["preferredLength", "Preferred Length"],
          ["spacing", "Spacing"],
        ] as const
      ).map(([field, label]) => (
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
export function HierarchyGradientLegendPanel(props: HierarchyGradientLegendPanelProps) {
  return (
    <ApplicationEditorGroup label="Gradient Legend">
      <fieldset
        className="chart-caption-section"
        aria-label="Gradient Legend"
        disabled={!props.applicable}
      >
        <div className="chart-caption-toggle">
          <span>Enabled</span>
          <Switch
            aria-label="Enabled"
            checked={props.value.enabled}
            onCheckedChange={(value) => props.onEdit({ field: "enabled", value })}
          />
        </div>
        {props.value.enabled && <GradientFields {...props} />}
      </fieldset>
    </ApplicationEditorGroup>
  );
}
