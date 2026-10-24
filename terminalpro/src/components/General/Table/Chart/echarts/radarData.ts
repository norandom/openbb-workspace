import type { RadarMappingInput } from "../compatibility/radarContracts";
export interface RadarDataSeries {
  readonly id: string;
  readonly label: string;
  readonly values: readonly (number | null)[];
}
export interface RadarData {
  readonly categories: readonly (string | number)[];
  readonly rowIds: readonly string[];
  readonly series: readonly RadarDataSeries[];
}
/** Capture/setup already aggregated and inverted. Never rescale reported amounts here. */
export function radarData(input: RadarMappingInput): RadarData {
  const { snapshot, assignments } = input;
  const seen = new Set<string>();
  const series = assignments.map(({ colId }) => {
    const column = snapshot.columns.find((c) => c.id === colId && c.role === "number");
    if (!column || seen.has(colId)) throw Error("Invalid Radar assignment.");
    seen.add(colId);
    const values = snapshot.rows.map((row) => {
      const value = row.values[colId];
      if (value === undefined && Object.hasOwn(row.values, colId))
        throw Error("Invalid missing Radar observation.");
      if (value == null) return null;
      if (typeof value !== "number" || !Number.isFinite(value))
        throw Error("Invalid Radar observation.");
      return value;
    });
    return { id: colId, label: column.label, values };
  });
  const rowIds = snapshot.rows.map((r) => r.id);
  if (new Set(rowIds).size !== rowIds.length)
    throw Error("Duplicate Radar row identity.");
  return { categories: snapshot.rows.map((r) => r.category), rowIds, series };
}
