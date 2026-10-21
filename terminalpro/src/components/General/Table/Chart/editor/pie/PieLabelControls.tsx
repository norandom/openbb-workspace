import type { PieLabelControlsProps } from "../../application/pieSessionTypes";
import { ChartLabelsPanel } from "../labels/ChartLabelsPanel";
import { ChartNumberInput } from "../series/ChartNumberInput";

export function PieLabelControls({
  callout, sector, calloutControls, sectorPosition, onIntent,
}: PieLabelControlsProps) {
  return (
    <>
      <ChartLabelsPanel {...callout} label="Callout Labels"
        onEdit={(edit) => onIntent({ panel: "pieLabel", label: "calloutLabel", edit })} />
      {callout.value.enabled && (
        <fieldset className="chart-titles-panel chart-caption-section" aria-label="Callout">
          <span>Callout</span>
          <div className="chart-caption-fields">
            {(["length", "strokeWidth", "offset"] as const).map((field) => (
              <ChartNumberInput key={field} {...calloutControls[field]}
                onChange={(value) => onIntent({ panel: "pieCallout", edit: { field, value } })} />
            ))}
          </div>
        </fieldset>
      )}
      <ChartLabelsPanel {...sector} label="Sector Labels"
        onEdit={(edit) => onIntent({ panel: "pieLabel", label: "sectorLabel", edit })} />
      {sector.value.enabled && (
        <div className="chart-caption-section">
          <ChartNumberInput {...sectorPosition}
            onChange={(value) => onIntent({ panel: "pieSector", edit: { field: "positionRatio", value } })} />
        </div>
      )}
    </>
  );
}
