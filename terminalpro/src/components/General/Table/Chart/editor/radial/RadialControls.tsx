import type {
  RadialEditIntent,
  RadialPolarControls,
} from "../../compatibility/radialContracts";
import "../legend/chartLegendPanel.css";
import { LegendChoiceInput } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
import "../titles/chartTitlesPanel.css";
export function RadialControls({
  value,
  fonts,
  weights,
  sizes,
  orientations,
  onEdit,
}: RadialPolarControls & {
  readonly onEdit: (intent: RadialEditIntent) => void;
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
              onEdit({
                panel: "radialPolarAxis",
                edit: { field: "color", value },
              })
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
              panel: "radialPolarAxis",
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
              panel: "radialPolarAxis",
              edit: { field: "innerRadiusRatio", value },
            })
          }
        />
        {(
          [
            ["paddingInner", "Group Padding"],
            ["groupPaddingInner", "Series Padding"],
          ] as const
        ).map(([field, label]) => (
          <ChartNumberInput
            key={field}
            label={label}
            value={value[field]}
            min={0}
            max={1}
            rangeStep={0.05}
            numberStep={0.05}
            onChange={(value) =>
              onEdit({ panel: "radialPolarAxis", edit: { field, value } })
            }
          />
        ))}
        <span>Labels</span>
        <LegendChoiceInput
          label="Font"
          value={value.labels.font}
          choices={fonts}
          onChange={(value) =>
            onEdit({
              panel: "radialPolarLabels",
              edit: { field: "font", value },
            })
          }
        />
        <LegendChoiceInput
          label="Weight"
          value={value.labels.weight}
          choices={weights}
          onChange={(value) =>
            onEdit({
              panel: "radialPolarLabels",
              edit: { field: "weight", value },
            })
          }
        />
        <LegendChoiceInput
          label="Size"
          value={value.labels.size}
          choices={sizes}
          onChange={(value) =>
            onEdit({
              panel: "radialPolarLabels",
              edit: { field: "size", value },
            })
          }
        />
        <label>
          Color
          <CaptionColorInput
            value={value.labels.color}
            onChange={(value) =>
              onEdit({
                panel: "radialPolarLabels",
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
              panel: "radialPolarLabels",
              edit: { field: "orientation", value },
            })
          }
        />
      </div>
    </fieldset>
  );
}
