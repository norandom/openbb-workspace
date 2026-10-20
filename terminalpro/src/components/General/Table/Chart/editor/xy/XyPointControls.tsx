import type { ApplicationEditorMode } from "../combo/comboEditorMode";
import { LegendChoiceInput } from "../legend/LegendInputs";
import { ChartNumberInput } from "../series/ChartNumberInput";
import { xyShapes } from "../../echarts/xyAdmission";
export function XyPointControls({ mode }: { mode: Extract<ApplicationEditorMode, { kind: "xy" }> }) {
  const bubble = mode.chartType === "bubble";
  const marker = mode.style.series.markers;
  const controls = [
    { kind: "size" as const, label: bubble ? "Min Size" : "Size", value: marker.size, max: 60 },
    ...(bubble ? [{ kind: "maxSize" as const, label: "Max Size", value: mode.style.maxSize, max: 60 }] : []),
    { kind: "strokeWidth" as const, label: "Stroke Width", value: marker.strokeWidth, max: 10 },
  ];
  return <div className="chart-caption-fields">
    <LegendChoiceInput label="Shape" value={marker.shape}
      choices={xyShapes.map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
      onChange={(value) => mode.onEdit({ kind: "shape", value })} />
    {controls.map(({ kind, label, value, max }) => <ChartNumberInput key={kind}
      label={label} value={value} min={0} max={Math.max(value, max)}
      rangeStep={1} numberStep="any" onChange={(value) => mode.onEdit({ kind, value })} />)}
  </div>;
}
