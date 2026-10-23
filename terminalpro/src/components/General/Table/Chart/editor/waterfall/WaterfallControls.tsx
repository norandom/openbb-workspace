import { useState } from "react";
import type {
  WaterfallControlsProps,
  WaterfallSign,
} from "../../application/waterfallTypes";
import { ChartLabelsPanel } from "../labels/ChartLabelsPanel";
import { LegendChoiceInput } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { ChartSeriesStylePanel } from "../series/ChartSeriesStylePanel";
import { CaptionColorInput } from "../titles/CaptionColorInput";

export function WaterfallControls({
  value,
  onEdit,
}: WaterfallControlsProps): React.ReactElement {
  const [sign, setSign] = useState<WaterfallSign>("positive");
  const item = value.items[sign];
  return (
    <>
      <fieldset className="chart-caption-section" aria-label="Connector Line">
        <legend>Connector Line</legend>
        <CaptionColorInput
          value={value.connector.stroke}
          onChange={(value) => onEdit({ kind: "connector", field: "stroke", value })}
        />
        {(["strokeWidth", "strokeOpacity", "lineDash"] as const).map((field) => {
          const current =
            field === "lineDash"
              ? (value.connector.lineDash[0] ?? 0)
              : value.connector[field];
          return (
            <ChartNumberInput
              key={field}
              label={
                field === "strokeWidth"
                  ? "Stroke Width"
                  : field === "strokeOpacity"
                    ? "Stroke Opacity"
                    : "Line Dash"
              }
              value={current}
              min={0}
              max={field === "strokeOpacity" ? 1 : Math.max(current, 10)}
              rangeStep={field === "strokeOpacity" ? 0.05 : 1}
              numberStep="any"
              onChange={(value) => onEdit({ kind: "connector", field, value })}
            />
          );
        })}
      </fieldset>
      <fieldset className="chart-caption-section" aria-label="Series Items">
        <legend>Series Items</legend>
        <LegendChoiceInput
          label="Series Item"
          value={sign}
          choices={[
            { value: "positive", label: "Positive" },
            { value: "negative", label: "Negative" },
          ]}
          onChange={setSign}
        />
        <ChartSeriesStylePanel
          {...item.series}
          onEdit={(edit) => onEdit({ kind: "item", sign, ...edit })}
        />
        <ChartLabelsPanel
          {...item.labels}
          onEdit={(edit) => onEdit({ kind: "label", sign, edit })}
        />
      </fieldset>
    </>
  );
}
