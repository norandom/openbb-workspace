import { ApplicationEditorGroup } from "../ApplicationEditorGroup";
import type { ApplicationEditorMode } from "../combo/comboEditorMode";
import { LegendChoiceInput } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";

type Mode = Extract<ApplicationEditorMode, { kind: "range" }>;
function BarLabels({ mode }: { mode: Mode }) {
  return (
    <ApplicationEditorGroup label="Label Placement">
      <LegendChoiceInput
        label="Placement"
        value={mode.controls.labelPlacement}
        choices={[
          { value: "inside", label: "Inside" },
          { value: "outside", label: "Outside" },
        ]}
        onChange={(value) => mode.onEdit({ kind: "labelPlacement", value })}
      />
      <ChartNumberInput
        label="Label Padding"
        value={mode.controls.labelPadding}
        min={0}
        max={Math.max(30, mode.controls.labelPadding)}
        rangeStep={1}
        numberStep="any"
        onChange={(value) => mode.onEdit({ kind: "labelPadding", value })}
      />
    </ApplicationEditorGroup>
  );
}
function AreaInterpolation({ mode }: { mode: Mode }) {
  const value = mode.controls.interpolation;
  return (
    <ApplicationEditorGroup label="Interpolation">
      <LegendChoiceInput
        label="Interpolation"
        value={value.type}
        choices={[
          { value: "linear", label: "Linear" },
          { value: "smooth", label: "Smooth" },
          { value: "step", label: "Step" },
        ]}
        onChange={(type) =>
          mode.onEdit({
            kind: "interpolation",
            value:
              type === "smooth"
                ? { type, tension: 1 }
                : type === "step"
                  ? { type, position: "end" }
                  : { type },
          })
        }
      />
      {value.type === "smooth" && (
        <ChartNumberInput
          label="Tension"
          value={value.tension}
          min={0}
          max={1}
          rangeStep={0.05}
          numberStep="any"
          onChange={(tension) =>
            mode.onEdit({ kind: "interpolation", value: { type: "smooth", tension } })
          }
        />
      )}
      {value.type === "step" && (
        <LegendChoiceInput
          label="Step Position"
          value={value.position}
          choices={[
            { value: "start", label: "Start" },
            { value: "middle", label: "Middle" },
            { value: "end", label: "End" },
          ]}
          onChange={(position) =>
            mode.onEdit({ kind: "interpolation", value: { type: "step", position } })
          }
        />
      )}
    </ApplicationEditorGroup>
  );
}
export function RangeControls({ mode }: { mode: Mode }) {
  return mode.family === "rangeBar" ? (
    <BarLabels mode={mode} />
  ) : (
    <AreaInterpolation mode={mode} />
  );
}
