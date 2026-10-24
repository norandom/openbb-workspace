import type { RadialMappingInput } from "../compatibility/radialContracts";
export interface RadialObservation {
  readonly rowId: string;
  readonly rowIndex: number;
  readonly category: string | number;
  readonly rawValue: number;
  readonly startValue: number;
  readonly endValue: number;
}
export interface RadialDataSeries {
  readonly id: string;
  readonly label: string;
  readonly visible: boolean;
  readonly paletteIndex: number;
  readonly marks: RadialObservation[];
}
export interface RadialData {
  readonly series: RadialDataSeries[];
  readonly categories: readonly (string | number)[];
  readonly extent: [number, number];
}
export function finite(value: number): number {
  if (!Number.isFinite(value)) throw Error("Nonfinite radial arithmetic.");
  return value;
}
function value(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "number") throw Error("Malformed radial observation.");
  return Number.isFinite(raw) ? raw : undefined;
}
function admit(input: RadialMappingInput): RadialDataSeries[] {
  const ids = new Set<string>();
  for (const row of input.snapshot.rows) {
    if (!row.id || ids.has(row.id))
      throw Error("Duplicate or empty radial row ID.");
    if (typeof row.category !== "string" && typeof row.category !== "number")
      throw Error("Malformed radial category.");
    ids.add(row.id);
  }
  ids.clear();
  return input.assignments.map(({ colId }, paletteIndex) => {
    if (
      !colId ||
      ids.has(colId) ||
      !input.snapshot.columns.some((c) => c.id === colId && c.role === "number")
    )
      throw Error("Invalid radial assignment.");
    ids.add(colId);
    return {
      id: colId,
      label: colId,
      visible: input.context.legendSelection?.[colId] !== false,
      paletteIndex,
      marks: [],
    };
  });
}
function accumulate(
  input: RadialMappingInput,
  data: RadialData,
  rowIndex: number,
) {
  const row = input.snapshot.rows[rowIndex];
  const values = data.series.map((s) => value(row.values[s.id]));
  let positive = 0;
  let negative = 0;
  values.forEach((v, i) => {
    if (v === undefined || !data.series[i].visible) return;
    if (v > 0) positive = finite(positive + v);
    else negative = finite(negative + v);
  });
  const denominator = Math.max(positive, Math.abs(negative));
  positive = 0;
  negative = 0;
  values.forEach((rawValue, i) => {
    if (rawValue === undefined || !data.series[i].visible) return;
    if (input.groupType === "normalized" && denominator === 0) return;
    const v =
      input.groupType === "normalized"
        ? finite(rawValue * (100 / denominator))
        : rawValue;
    const isPositive = v > 0 || (v === 0 && !Object.is(v, -0));
    const startValue =
      input.groupType === "grouped" ? 0 : isPositive ? positive : negative;
    const endValue = finite(startValue + v);
    if (isPositive) positive = endValue;
    else negative = endValue;
    data.extent[0] = Math.min(data.extent[0], startValue, endValue);
    data.extent[1] = Math.max(data.extent[1], startValue, endValue);
    data.series[i].marks.push({
      rowId: row.id,
      rowIndex,
      category: row.category,
      rawValue,
      startValue,
      endValue,
    });
  });
}
export function radialData(input: RadialMappingInput): RadialData {
  const series = admit(input);
  const data: RadialData = {
    series,
    categories: input.snapshot.rows.map((r) => r.category),
    extent: [0, 0],
  };
  input.snapshot.rows.forEach((_, i) => accumulate(input, data, i));
  finite(data.extent[1] - data.extent[0]);
  return data;
}
