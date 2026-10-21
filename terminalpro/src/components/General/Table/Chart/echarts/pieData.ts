import {
  aggregateSetupRows,
  type SetupObservationGroup,
} from "../application/setupAggregation";
import type { PieSeriesAssignment } from "../compatibility/pieAssignments";
import { validateSnapshot } from "../compatibility/snapshot";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { escapeHtml } from "./cartesianDisplay";
import type { PieDatum, PieMappingInput, PieRing } from "./pieTypes";

function datum(
  input: PieMappingInput,
  assignment: PieSeriesAssignment,
  descriptor: SnapshotColumn,
  group: SetupObservationGroup,
  paletteIndex: number,
): PieDatum | undefined {
  const row = group.row;
  const rawValue = row.values[assignment.colId];
  if (rawValue === null || rawValue === undefined) return;
  const name = `pie-item:${JSON.stringify([assignment.colId, row.id])}`;
  const display = input.context.display;
  const category = String(display.legend(row.category));
  const prefix =
    assignment.ring?.titleInLegend && descriptor.label
      ? `${descriptor.label} - `
      : "";
  return {
    id: name,
    name,
    value: 0,
    enabled: input.context.legendSelection?.[name] !== false,
    legendText: `${prefix}${category}`,
    calloutText: String(display.seriesLabel(row.category)),
    sectorText: String(display.seriesLabel(rawValue)),
    tooltipText: `${input.style.application.tooltip.mode === "compact" ? "" : `${escapeHtml(category)}<br/>`}${escapeHtml(descriptor.label)}: ${escapeHtml(rawValue.toLocaleString())}`,
    metadata: {
      colId: assignment.colId,
      rowId: row.id,
      sourceRowIds: [...group.sourceRowIds],
      category: row.category,
      descriptor: structuredClone(descriptor),
      rawValue,
      paletteIndex,
    },
  };
}
function fractions(data: readonly PieDatum[]): PieDatum[] {
  // Scale first: two valid MAX_VALUE observations must not overflow their denominator.
  const largest = data.reduce(
    (max, d) => Math.max(max, d.enabled ? d.metadata.rawValue : 0),
    0,
  );
  const scaled = data.map((d) =>
    largest && d.enabled ? Math.max(d.metadata.rawValue, 0) / largest : 0,
  );
  const total = scaled.reduce((sum, n) => sum + n, 0);
  return data.map((d, i) => ({ ...d, value: total ? scaled[i] / total : 0 }));
}
export function pieData(input: PieMappingInput): PieRing[] {
  const assignments = input.assignment.assignments;
  const groups = aggregateSetupRows(
    input.snapshot.rows,
    assignments.map((a) => a.colId),
    input.context.aggFunc,
  );
  if (
    !validateSnapshot(
      { ...input.snapshot, rows: groups.map((g) => g.row) },
      "pie-observations",
    ).valid
  )
    throw Error("Invalid aggregated pie observations");
  const columns = new Map(input.snapshot.columns.map((c) => [c.id, c]));
  return assignments.map((assignment) => {
    const descriptor = columns.get(assignment.colId)!;
    const data = fractions(
      groups.flatMap((g, i) => {
        const value = datum(input, assignment, descriptor, g, i);
        return value ? [value] : [];
      }),
    );
    return {
      id: `pie-ring:${JSON.stringify(assignment.colId)}`,
      assignment,
      data,
      positive: data.some((d) => d.value > 0),
    };
  });
}
