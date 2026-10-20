export type XyChartType = 'scatter' | 'bubble';
export interface XyValueColumn {
  readonly colId: string;
  readonly selected: boolean;
}
export interface XyAssignmentInput {
  readonly chartType: XyChartType;
  readonly valueColumns: readonly XyValueColumn[];
  readonly paired?: boolean;
}
export interface XySeriesAssignment {
  readonly xColId: string;
  readonly yColId: string;
  readonly sizeColId?: string;
}
export interface XyAssignmentDiagnostic {
  readonly code: 'invalid-input';
  readonly message: string;
}
export type XyAssignmentResult = {
  readonly status: 'resolved';
  readonly chartType: XyChartType;
  readonly paired: boolean;
  readonly assignments: readonly XySeriesAssignment[];
  readonly diagnostics: readonly XyAssignmentDiagnostic[];
} | {
  readonly status: 'invalid';
  readonly diagnostics: readonly XyAssignmentDiagnostic[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): XyAssignmentResult {
  return { status: 'invalid', diagnostics: [{ code: 'invalid-input', message }] };
}

function readSelected(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const selectedIds: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return undefined;
    const entry: unknown = value[index];
    if (!record(entry)) return undefined;
    const { colId, selected } = entry;
    if (typeof colId !== 'string' || typeof selected !== 'boolean' || seen.has(colId)) return undefined;
    seen.add(colId);
    if (selected) selectedIds.push(colId);
  }
  return selectedIds;
}

function groupColumns(ids: string[], chartType: XyChartType, paired: boolean): XySeriesAssignment[] {
  const assignments: XySeriesAssignment[] = [];
  const bubble = chartType === 'bubble';
  const width = bubble ? 3 : 2;
  const step = paired ? width : width - 1;
  const start = paired ? 0 : 1;
  for (let index = start; index + step <= ids.length; index += step) {
    const xColId = ids[paired ? index : 0];
    const yColId = ids[paired ? index + 1 : index];
    assignments.push(bubble
      ? { xColId, yColId, sizeColId: ids[index + step - 1] }
      : { xColId, yColId });
  }
  return assignments;
}

function resolve(input: unknown): XyAssignmentResult {
  if (!record(input)) return invalid('Expected an XY assignment object.');
  const { chartType, valueColumns, paired = true } = input;
  if (chartType !== 'scatter' && chartType !== 'bubble') return invalid('Unsupported XY chart type.');
  if (typeof paired !== 'boolean') return invalid('Pairing must be a boolean.');
  const ids = readSelected(valueColumns);
  if (ids === undefined) return invalid('Malformed or duplicate value columns.');
  return { status: 'resolved', chartType, paired,
    assignments: groupColumns(ids, chartType, paired), diagnostics: [] };
}

// Caller-owned saved state may contain accessors or proxies; failed reads cannot leak partial groups.
export function resolveXyAssignments(input: unknown): XyAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid('XY assignment input could not be read safely.');
  }
}
