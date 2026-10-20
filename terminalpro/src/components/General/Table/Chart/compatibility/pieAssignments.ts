export type PieChartType = 'pie' | 'donut' | 'doughnut';
export interface PieValueColumn {
  readonly colId: string;
  readonly selected: boolean;
}
export interface PieAssignmentInput {
  readonly chartType: PieChartType;
  readonly valueColumns: readonly PieValueColumn[];
}
export interface PieRingAssignment {
  readonly outerRadiusOffset: number;
  readonly innerRadiusOffset: number;
  readonly titleInLegend: boolean;
}
export interface PieSeriesAssignment {
  readonly colId: string;
  readonly ring?: PieRingAssignment;
}
export interface PieAssignmentDiagnostic {
  readonly code: 'invalid-input';
  readonly message: string;
}
export type PieAssignmentResult = {
  readonly status: 'resolved';
  readonly chartType: PieChartType;
  readonly seriesType: 'pie' | 'donut';
  readonly assignments: readonly PieSeriesAssignment[];
  readonly diagnostics: readonly PieAssignmentDiagnostic[];
} | {
  readonly status: 'invalid';
  readonly diagnostics: readonly PieAssignmentDiagnostic[];
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): PieAssignmentResult {
  return { status: 'invalid', diagnostics: [{ code: 'invalid-input', message }] };
}

function readSelected(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) return undefined;
    const entry: unknown = value[index];
    if (!record(entry)) return undefined;
    const { colId, selected } = entry;
    if (typeof colId !== 'string' || typeof selected !== 'boolean' || seen.has(colId)) return undefined;
    seen.add(colId);
    if (selected) ids.push(colId);
  }
  return ids;
}

function assign(ids: string[], chartType: PieChartType): PieSeriesAssignment[] {
  if (chartType === 'pie') return ids.slice(0, 1).map(colId => ({ colId }));
  // Original offsets adjust a common available radius in pixels; each field owns a ring.
  return ids.map((colId, index) => ({ colId, ring: {
    outerRadiusOffset: index === 0 ? 0 : -40 * index,
    innerRadiusOffset: -40 * index - (ids.length === 1 ? 40 : 20),
    titleInLegend: ids.length > 1,
  } }));
}

function resolve(input: unknown): PieAssignmentResult {
  if (!record(input)) return invalid('Expected a pie assignment object.');
  const { chartType, valueColumns } = input;
  if (chartType !== 'pie' && chartType !== 'donut' && chartType !== 'doughnut') return invalid('Unsupported pie chart type.');
  const ids = readSelected(valueColumns);
  if (ids === undefined) return invalid('Malformed or duplicate value columns.');
  return { status: 'resolved', chartType, seriesType: chartType === 'pie' ? 'pie' : 'donut',
    assignments: assign(ids, chartType), diagnostics: [] };
}

// Failed reads from caller-owned accessors or proxies must not leak partial assignments.
export function resolvePieAssignments(input: unknown): PieAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid('Pie assignment input could not be read safely.');
  }
}
