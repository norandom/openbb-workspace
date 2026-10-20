import type { ApplicationEditorMode } from "../combo/comboEditorMode";
import { ChartNumberInput } from "../series/ChartNumberInput";
export function HistogramBinControls({ mode }: { mode: Extract<ApplicationEditorMode, { kind: "histogram" }> }) {
  return <div className="chart-caption-fields">
    <ChartNumberInput key={mode.revision} label="Bin count" value={mode.binCount} min={0} max={Math.max(mode.binCount, 20)}
      rangeStep={1} numberStep="any" onChange={value => mode.onEdit({ kind: "binCount", value })} />
  </div>;
}

