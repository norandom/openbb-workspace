import type { NightingaleMappingInput } from "../compatibility/nightingaleContracts";
export interface NightingaleDataSeries {
  readonly id: string;
  readonly label: string;
  readonly values: readonly (number | null)[];
  readonly scaled: readonly (number | null)[];
}
export interface NightingaleData {
  readonly categories: readonly (string | number)[];
  readonly rowIds: readonly string[];
  readonly series: readonly NightingaleDataSeries[];
  readonly extent: readonly [number, number];
}
function observation(value: unknown): number | null {
  if (value == null || (typeof value === "number" && !Number.isFinite(value)))
    return null;
  if (typeof value !== "number") throw Error("Invalid Nightingale observation.");
  return value;
}
/** Setup has already aggregated/inverted. Normalize only geometry, never financial values. */
export function nightingaleData(input: NightingaleMappingInput): NightingaleData {
  const { snapshot, assignments } = input;
  const rowIds = snapshot.rows.map((r) => r.id);
  if (new Set(rowIds).size !== rowIds.length) throw Error("Duplicate row identity.");
  const seen = new Set<string>();
  const series = assignments.map(({ colId }) => {
    const column = snapshot.columns.find((c) => c.id === colId && c.role === "number");
    if (!column || seen.has(colId)) throw Error("Invalid Nightingale assignment.");
    seen.add(colId);
    return {
      id: colId,
      label: column.label,
      values: snapshot.rows.map((r) => observation(r.values[colId])),
    };
  });
  const visible = series.filter((s) => input.context.legendSelection?.[s.id] !== false);
  const totals = snapshot.rows.map((_, i) =>
    visible.reduce(
      (t, s) => {
        const v = s.values[i];
        if (v !== null) t[v < 0 ? 0 : 1] += v;
        return t;
      },
      [0, 0],
    ),
  );
  const scaled = series.map((s) => ({
    ...s,
    scaled: s.values.map((v, i) => {
      const denominator = Math.max(Math.abs(totals[i][0]), totals[i][1]);
      return v === null
        ? null
        : input.groupType === "normalized" && denominator > 0
          ? (v / denominator) * 100
          : v;
    }),
  }));
  const extents =
    input.groupType === "grouped"
      ? visible.flatMap((s) => s.values.filter((v): v is number => v !== null))
      : totals.flatMap((t) =>
          input.groupType === "normalized"
            ? t.map((v) =>
                Math.max(Math.abs(t[0]), t[1]) > 0
                  ? (v / Math.max(Math.abs(t[0]), t[1])) * 100
                  : v,
              )
            : t,
        );
  return {
    categories: snapshot.rows.map((r) => r.category),
    rowIds,
    series: scaled,
    extent: extents.reduce<[number, number]>(
      (extent, value) => [Math.min(extent[0], value), Math.max(extent[1], value)],
      [0, 0],
    ),
  };
}
