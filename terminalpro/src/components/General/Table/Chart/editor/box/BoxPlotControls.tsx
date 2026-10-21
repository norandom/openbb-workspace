import type {
  BoxPlotControlValues,
  BoxPlotEditIntent,
} from "../../application/boxPlotSessionTypes";
import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { CaptionColorInput } from "../titles/CaptionColorInput";
export function BoxPlotControls({
  value,
  onEdit,
}: {
  value: BoxPlotControlValues;
  onEdit: (edit: BoxPlotEditIntent["edit"]) => void;
}) {
  const controls = [
    {
      field: "strokeWidth",
      label: "Stroke Width",
      value: value.whisker.strokeWidth,
      max: 10,
      step: 1,
    },
    {
      field: "strokeOpacity",
      label: "Line Opacity",
      value: value.whisker.strokeOpacity,
      max: 1,
      step: 0.05,
    },
    {
      field: "lineDash",
      label: "Line Dash",
      value: value.whisker.lineDash[0] ?? 0,
      max: 30,
      step: 1,
    },
    {
      field: "lineDashOffset",
      label: "Line Dash Offset",
      value: value.whisker.lineDashOffset,
      max: 30,
      step: 1,
    },
  ] as const;
  return (
    <>
      <ApplicationEditorGroup label="Whisker">
        <CaptionColorInput
          value={value.whisker.stroke}
          onChange={(value) => onEdit({ kind: "whisker", field: "stroke", value })}
        />
        {controls.map((control) => (
          <ChartNumberInput
            key={control.field}
            label={control.label}
            value={control.value}
            min={Math.min(0, control.value)}
            max={Math.max(control.max, control.value)}
            rangeStep={control.step}
            numberStep="any"
            onChange={(value) =>
              onEdit({
                kind: "whisker",
                field: control.field,
                value: control.field === "lineDash" ? [value] : value,
              })
            }
          />
        ))}
      </ApplicationEditorGroup>
      <ApplicationEditorGroup label="Cap">
        <ChartNumberInput
          label="Length Ratio"
          value={value.cap.lengthRatio}
          min={0}
          max={Math.max(1, value.cap.lengthRatio)}
          rangeStep={0.05}
          numberStep="any"
          onChange={(value) => onEdit({ kind: "cap", value })}
        />
      </ApplicationEditorGroup>
    </>
  );
}
