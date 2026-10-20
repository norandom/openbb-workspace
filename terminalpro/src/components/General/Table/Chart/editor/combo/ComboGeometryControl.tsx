import type { ApplicationEditorMode } from "./comboEditorMode";
import type { ComboGeometry } from "../../echarts/comboTypes";
const geometries: readonly [ComboGeometry, string][] = [
  ["area", "Area"],
  ["bar", "Bar"],
  ["line", "Line"],
];
export function ComboGeometryControl({
  mode,
}: {
  mode: Extract<ApplicationEditorMode, { kind: "combo" }>;
}) {
  return (
    <div className="chart-caption-section chart-caption-fields">
      <label>
        Series Type
        <select
          aria-label="Series Type"
          value={mode.geometry}
          onChange={(event) =>
            mode.onGeometry(event.target.value as ComboGeometry)
          }
        >
          {geometries
            .filter(([value]) => mode.activeGeometries.includes(value))
            .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
