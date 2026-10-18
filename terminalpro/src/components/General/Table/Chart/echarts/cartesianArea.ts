import { areaSpans, finiteSum } from "./cartesianAreaSpans";
import type { AreaProjection, AreaProjectionInput } from "./cartesianAreaTypes";

type Value = number | null;

function processedRows(input: AreaProjectionInput): Value[][] {
  const substitute = input.columns.length > 1 && input.family !== "area"
    && (input.family === "normalizedArea" || input.connectMissingData);
  return input.snapshot.rows.map(row => input.columns.map(column => {
    if (input.legendSelection?.[column.id] === false) return 0;
    const value = row.values[column.id];
    return typeof value === "number" && Number.isFinite(value) ? value : substitute ? 0 : null;
  }));
}

function normalizeRow(row: readonly Value[], previous: readonly Value[] | undefined) {
  const largest = row.reduce<number>((max, value) => Math.max(max, Math.abs(value ?? 0)), 0);
  // Preserve original rounding for ordinary values; scale only to avoid overflow.
  const scale = largest > Number.MAX_VALUE / Math.max(100, row.length) ? largest : 1;
  const values = row.map(value => value === null ? null : value / scale);
  const cumulative: Value[] = [];
  let prefix = 0;
  let window = 0;
  let extent = 0;
  values.forEach((value, i) => {
    prefix += value ?? 0;
    cumulative.push(value === null ? null : prefix);
    if (value !== null && (!previous || previous[i] !== null)) window += value;
    extent = Math.max(extent, Math.abs(value ?? 0), Math.abs(prefix), Math.abs(window));
  });
  const normalize = (value: Value) => value === null || extent === 0 ? null : value * 100 / extent;
  return { stack: values.map(normalize), cumulative: cumulative.map(normalize) };
}

function endpoints(rows: readonly (readonly Value[])[], index: number, independent: boolean): Value[] {
  return rows.map(row => row[index] === null ? null
    : independent ? row[index] : finiteSum(row.slice(0, index + 1)));
}

function finiteExtent(series: AreaProjection["series"]): AreaProjection["extent"] {
  let min = 0;
  let max = 0;
  const include = (value: Value) => {
    if (value === null) return;
    min = Math.min(min, value);
    max = Math.max(max, value);
  };
  for (const item of series) {
    item.markers.forEach(include);
    item.strokes.forEach(span => span.forEach(point => include(point.value)));
    item.fills.forEach(span => span.forEach(point => { include(point.lower); include(point.upper); }));
  }
  return { min, max };
}

/** Financial observations remain immutable; processed labels and geometry are separate. */
export function projectArea(input: AreaProjectionInput): AreaProjection {
  const labels = processedRows(input);
  const normalized = input.family === "normalizedArea";
  const independent = input.family === "area" || (!normalized && input.columns.length === 1);
  const normalizedRows = normalized ? labels.map((row, i) => normalizeRow(row, labels[i - 1])) : null;
  const rows = normalizedRows?.map(row => row.stack) ?? labels;
  const series = input.columns.map((column, index) => {
    const visible = input.legendSelection?.[column.id] !== false;
    const cumulative = normalizedRows?.map(row => row.cumulative[index]) ?? endpoints(rows, index, independent);
    const markers = labels.map((row, rowIndex) => !visible || row[index] === null
      ? null : cumulative[rowIndex] ?? 0);
    return {
      id: column.id,
      markers,
      labelValues: labels.map(row => visible ? row[index] : null),
      ...(visible ? areaSpans(rows, index, input.connectMissingData, independent) : { strokes: [], fills: [] }),
    };
  });
  return { series, extent: finiteExtent(series) };
}
