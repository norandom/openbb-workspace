import type { HierarchySpacingControlsProps } from "../../application/hierarchyEditorTypes";
import { LegendNumberInput } from "../legend/LegendInputs";
import "../titles/chartTitlesPanel.css";

export function HierarchySpacingControls({
  controls,
  onEdit,
}: HierarchySpacingControlsProps) {
  return (
    <fieldset className="chart-caption-section" aria-label="Tile Spacing">
      <div className="chart-caption-fields">
        {controls.map(({ field, label, value, bounds }) => (
          <LegendNumberInput
            key={field}
            label={label}
            value={value}
            bounds={bounds}
            onChange={(value) => onEdit({ field, value })}
          />
        ))}
      </div>
    </fieldset>
  );
}
