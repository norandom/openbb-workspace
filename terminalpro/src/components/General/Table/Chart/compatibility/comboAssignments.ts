export type ComboChartType = 'columnLineCombo' | 'areaColumnCombo' | 'customCombo';
export type ComboSeriesChartType = 'line' | 'groupedColumn' | 'stackedColumn' | 'area' | 'stackedArea';
export interface ComboValueColumn { colId: string; selected: boolean }
export interface ComboSeriesAssignment {
  colId: string;
  chartType: ComboSeriesChartType;
  secondaryAxis?: boolean;
}
export interface ComboAssignmentInput {
  chartType: ComboChartType;
  valueColumns: readonly ComboValueColumn[];
  seriesChartTypes?: readonly { colId: string; chartType: string; secondaryAxis?: boolean }[];
}
export interface ComboAssignmentDiagnostic {
  code: 'invalid-input' | 'empty-custom-assignments' | 'missing-assignment' | 'unsupported-series-type';
  message: string;
  colId?: string;
}
export type ComboAssignmentResult = {
  status: 'resolved';
  chartType: ComboChartType;
  seriesChartTypes: ComboSeriesAssignment[];
  diagnostics: ComboAssignmentDiagnostic[];
} | { status: 'invalid'; diagnostics: ComboAssignmentDiagnostic[] };

const comboTypes = new Set(['columnLineCombo', 'areaColumnCombo', 'customCombo']);
const seriesTypes = new Set(['line', 'groupedColumn', 'stackedColumn', 'area', 'stackedArea']);
const primaryOnly = new Set(['groupedColumn', 'stackedColumn', 'stackedArea']);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(message: string): ComboAssignmentResult {
  return { status: 'invalid', diagnostics: [{ code: 'invalid-input', message }] };
}

function readColumns(value: unknown): ComboValueColumn[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const columns: ComboValueColumn[] = [];
  for (const entry of value) {
    if (!record(entry)) return undefined;
    const { colId, selected } = entry;
    if (typeof colId !== 'string' || typeof selected !== 'boolean') return undefined;
    columns.push({ colId, selected });
  }
  return columns;
}

function readAssignments(value: unknown): ComboAssignmentInput['seriesChartTypes'] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const assignments: NonNullable<ComboAssignmentInput['seriesChartTypes']>[number][] = [];
  for (const entry of value) {
    if (!record(entry)) return null;
    const { colId, chartType, secondaryAxis } = entry;
    if (typeof colId !== 'string' || typeof chartType !== 'string') return null;
    if (secondaryAxis !== undefined && typeof secondaryAxis !== 'boolean') return null;
    assignments.push({ colId, chartType, ...(secondaryAxis === undefined ? {} : { secondaryAxis }) });
  }
  return assignments;
}

function customAssignments(
  columns: ComboValueColumn[],
  saved: NonNullable<ComboAssignmentInput['seriesChartTypes']>,
  diagnostics: ComboAssignmentDiagnostic[],
): ComboSeriesAssignment[] {
  if (!saved.length) diagnostics.push({ code: 'empty-custom-assignments', message: 'Custom combo has no saved assignments.' });
  const first = new Map<string, ComboSeriesAssignment>();
  for (const entry of saved) {
    const supported = seriesTypes.has(entry.chartType);
    if (!supported) diagnostics.push({ code: 'unsupported-series-type', colId: entry.colId,
      message: `Unsupported series type ${entry.chartType}; using line.` });
    const chartType = (supported ? entry.chartType : 'line') as ComboSeriesChartType;
    const assignment: ComboSeriesAssignment = { colId: entry.colId, chartType };
    if (primaryOnly.has(chartType)) assignment.secondaryAxis = false;
    else if (entry.secondaryAxis !== undefined) assignment.secondaryAxis = entry.secondaryAxis;
    if (!first.has(entry.colId)) first.set(entry.colId, assignment);
  }
  return columns.map(({ colId, selected }) => {
    const provided = first.get(colId);
    if (provided) return { ...provided };
    if (selected) diagnostics.push({ code: 'missing-assignment', colId, message: 'Selected column has no saved assignment; using primary line.' });
    return { colId, chartType: 'line', secondaryAxis: false };
  });
}

function resolve(input: unknown): ComboAssignmentResult {
  if (!record(input)) return invalid('Expected a combo assignment object.');
  const { chartType, valueColumns, seriesChartTypes } = input;
  if (typeof chartType !== 'string' || !comboTypes.has(chartType)) return invalid('Unsupported combo chart type.');
  const columns = readColumns(valueColumns);
  const saved = readAssignments(seriesChartTypes);
  if (!columns || saved == null) return invalid('Malformed value columns or series assignments.');
  const diagnostics: ComboAssignmentDiagnostic[] = [];
  if (chartType === 'customCombo' || saved.length > 0) {
    return { status: 'resolved', chartType: 'customCombo',
      seriesChartTypes: customAssignments(columns, saved, diagnostics), diagnostics };
  }
  const selected = columns.filter(column => column.selected);
  const split = Math.ceil(selected.length / 2);
  const firstType = chartType === 'columnLineCombo' ? 'groupedColumn' : 'stackedArea';
  const secondType = chartType === 'columnLineCombo' ? 'line' : 'groupedColumn';
  return { status: 'resolved', chartType: chartType as ComboChartType, diagnostics,
    seriesChartTypes: selected.map(({ colId }, index) => ({
      colId, chartType: index < split ? firstType : secondType, secondaryAxis: false,
    })) };
}

// Saved chart state is caller-owned; malformed getters/proxies must not escape into rendering.
export function resolveComboAssignments(input: unknown): ComboAssignmentResult {
  try {
    return resolve(input);
  } catch {
    return invalid('Combo assignment input could not be read safely.');
  }
}
