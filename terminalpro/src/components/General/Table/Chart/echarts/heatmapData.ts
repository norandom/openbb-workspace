import type { SetupProjection } from "../application/setupTypes";

export interface HeatmapAxisItem {
  readonly id: string;
  readonly label: string;
}
export interface HeatmapCell {
  readonly x: number;
  readonly y: number;
  readonly rowId: string;
  readonly columnId: string;
  readonly value: number;
}
export interface HeatmapData {
  readonly x: readonly HeatmapAxisItem[];
  readonly y: readonly HeatmapAxisItem[];
  readonly cells: readonly HeatmapCell[];
  readonly extent: readonly [number, number] | null;
}

export function buildHeatmapData(projection: SetupProjection): HeatmapData {
  const { snapshot } = projection;
  const x = snapshot.selectedColumnIds.flatMap((id) => {
    const column = snapshot.columns.find((item) => item.id === id);
    return column?.role === "number" ? [{ id: column.id, label: column.label }] : [];
  });
  const y = snapshot.rows.map((row) => ({
    id: row.id,
    label: String(row.category),
  }));
  const cells: HeatmapCell[] = [];
  let extent: [number, number] | null = null;
  snapshot.rows.forEach((row, rowIndex) => {
    x.forEach((column, columnIndex) => {
      if (!Object.hasOwn(row.values, column.id)) return;
      const value = row.values[column.id];
      if (value === null) return;
      // Missing observations differ from malformed validated input; never impute zero.
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("Heatmap requires present numeric observations to be finite");
      cells.push({
        x: columnIndex,
        y: rowIndex,
        rowId: row.id,
        columnId: column.id,
        value,
      });
      extent = extent
        ? [Math.min(extent[0], value), Math.max(extent[1], value)]
        : [value, value];
    });
  });
  return { x, y, cells, extent };
}
