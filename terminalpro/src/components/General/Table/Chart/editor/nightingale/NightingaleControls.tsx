import type {
  NightingaleEditIntent,
  NightingalePolarControls,
} from "../../compatibility/nightingaleContracts";
import { LegendChoiceInput } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";
import "../legend/chartLegendPanel.css";
export function NightingaleControls({
  value,
  fonts,
  weights,
  sizes,
  orientations,
  onEdit,
}: NightingalePolarControls & {
  readonly onEdit: (intent: NightingaleEditIntent) => void;
}) {
  return (
    <fieldset
      className="chart-titles-panel chart-caption-section"
      aria-label="Polar Axis"
    >
      <div className="chart-caption-toggle">
        <span>Polar Axis</span>
      </div>
      <div className="chart-caption-fields">
        <label>
          Color
          <CaptionColorInput
            value={value.color}
            onChange={(value) =>
              onEdit({ panel: "nightingalePolarAxis", edit: { field: "color", value } })
            }
          />
        </label>
        <ChartNumberInput
          label="Thickness"
          value={value.thickness}
          min={0}
          max={Math.max(10, value.thickness)}
          rangeStep={1}
          numberStep="any"
          onChange={(value) =>
            onEdit({
              panel: "nightingalePolarAxis",
              edit: { field: "thickness", value },
            })
          }
        />
        <ChartNumberInput
          label="Inner Radius"
          value={value.innerRadiusRatio}
          min={0}
          max={1}
          rangeStep={0.05}
          numberStep={0.05}
          onChange={(value) =>
            onEdit({
              panel: "nightingalePolarAxis",
              edit: { field: "innerRadiusRatio", value },
            })
          }
        />
        <span>Labels</span>
        <LegendChoiceInput
          label="Font"
          value={value.labels.font}
          choices={fonts}
          onChange={(value) =>
            onEdit({ panel: "nightingalePolarLabels", edit: { field: "font", value } })
          }
        />
        <LegendChoiceInput
          label="Weight"
          value={value.labels.weight}
          choices={weights}
          onChange={(value) =>
            onEdit({
              panel: "nightingalePolarLabels",
              edit: { field: "weight", value },
            })
          }
        />
        <LegendChoiceInput
          label="Size"
          value={value.labels.size}
          choices={sizes}
          onChange={(value) =>
            onEdit({ panel: "nightingalePolarLabels", edit: { field: "size", value } })
          }
        />
        <label>
          Color
          <CaptionColorInput
            value={value.labels.color}
            onChange={(value) =>
              onEdit({
                panel: "nightingalePolarLabels",
                edit: { field: "color", value },
              })
            }
          />
        </label>
        <LegendChoiceInput
          label="Orientation"
          value={value.labels.orientation}
          choices={orientations}
          onChange={(value) =>
            onEdit({
              panel: "nightingalePolarLabels",
              edit: { field: "orientation", value },
            })
          }
        />
      </div>
    </fieldset>
  );
}
