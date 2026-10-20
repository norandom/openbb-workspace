import type { ApplicationEditorMode } from "./comboEditorMode";
import type { ComboSeriesChartType } from "../../compatibility/comboAssignments";
import { Switch } from "../../../../../ds/atoms/Switch";
const types: readonly [ComboSeriesChartType, string][] = [
  ["line", "Line"],
  ["area", "Area"],
  ["stackedArea", "Stacked Area"],
  ["groupedColumn", "Grouped Column"],
  ["stackedColumn", "Stacked Column"],
];
export function ComboAssignmentControls({
  mode,
  colId,
  label,
}: {
  mode: Extract<ApplicationEditorMode, { kind: "combo" }>;
  colId: string;
  label: string;
}) {
  const assignment = mode.assignments.find((item) => item.colId === colId);
  if (!assignment) return null;
  const secondaryAllowed =
    assignment.chartType === "line" || assignment.chartType === "area";
  return (
    <div className="chart-caption-section chart-caption-fields">
      <select
        aria-label={`${label} series type`}
        value={assignment.chartType}
        onChange={(event) =>
          mode.onAssignment(colId, {
            kind: "type",
            value: event.target.value as ComboSeriesChartType,
          })
        }
      >
        {types.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      <div className="chart-setup-switch">
        <Switch
          label={`${label} Secondary Axis`}
          checked={secondaryAllowed && assignment.secondaryAxis === true}
          disabled={!secondaryAllowed}
          onCheckedChange={(value) =>
            mode.onAssignment(colId, { kind: "secondaryAxis", value })
          }
        />
      </div>
    </div>
  );
}
