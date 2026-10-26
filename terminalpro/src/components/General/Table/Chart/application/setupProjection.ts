import { validateSnapshot } from "../compatibility/snapshot";
import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotPolicy,
  SnapshotRow,
} from "../compatibility/snapshotTypes";
import { aggregateBoxSetupRows } from "./boxPlotSetupProjection";
import { aggregateSetupRows, type SetupObservationGroup } from "./setupAggregation";
import {
  DEFAULT_SETUP_CATEGORY,
  invalidSetup,
  SETUP_AGGREGATIONS,
  type SetupProjection,
  type SetupResult,
  type SetupSelection,
  type SetupValueOrigin,
} from "./setupTypes";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function retainOrdinarySetupCapture(
  input: unknown,
  policy?: import("../compatibility/snapshotTypes").SnapshotPolicy,
): SetupResult<ChartSnapshot> {
  const checked = validateSnapshot(input, policy);
  if (!checked.valid) return { status: "invalid", diagnostics: checked.diagnostics };
  if (checked.snapshot.sourceMode !== "flat")
    return invalidSetup("Set Up requires the complete original ordinary flat capture");
  return { status: "ready", value: freeze(checked.snapshot) };
}
function selectedColumns(
  source: ChartSnapshot,
  selection: SetupSelection,
  allowEmpty = false,
  allowDefaultAggregate = false,
): SnapshotColumn[] | undefined {
  if (
    !selection ||
    selection.categoryId !== source.categoryColumnId ||
    typeof selection.switchCategorySeries !== "boolean"
  )
    return;
  if (
    selection.aggFunc !== undefined &&
    !SETUP_AGGREGATIONS.includes(selection.aggFunc)
  )
    return;
  if (
    selection.categoryId === DEFAULT_SETUP_CATEGORY &&
    selection.aggFunc !== undefined &&
    !allowDefaultAggregate
  )
    return;
  if (
    !Array.isArray(selection.seriesIds) ||
    (!allowEmpty && !selection.seriesIds.length) ||
    new Set(selection.seriesIds).size !== selection.seriesIds.length
  )
    return;
  const columns = selection.seriesIds.map((id) =>
    source.columns.find(
      (c) =>
        c.id === id && c.role === "number" && source.selectedColumnIds.includes(id),
    ),
  );
  return columns.every((c) => c !== undefined)
    ? (columns as SnapshotColumn[])
    : undefined;
}
function incompatible(columns: readonly SnapshotColumn[]) {
  const units = new Set(columns.flatMap((c) => (c.unit === undefined ? [] : [c.unit])));
  const scales = new Set(
    columns.flatMap((c) => (c.scale === undefined ? [] : [c.scale])),
  );
  return units.size > 1 || scales.size > 1;
}
function aggregateColumns(
  columns: readonly SnapshotColumn[],
  count: boolean,
): SnapshotColumn[] {
  return columns.map((c) =>
    count ? { ...c, unit: "observation-count", scale: 1 } : c,
  );
}
function origin(
  column: SnapshotColumn,
  group: SetupObservationGroup,
  count: boolean,
): SetupValueOrigin {
  return {
    sourceRowIds: group.sourceRowIds,
    sourceColumnId: column.id,
    kind: count ? "count" : "source",
    ...(column.unit === undefined ? {} : { unit: column.unit }),
    ...(column.scale === undefined ? {} : { scale: column.scale }),
  };
}
function ordinary(
  source: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  groups: readonly SetupObservationGroup[],
  count: boolean,
) {
  const valueOrigins: Record<string, Record<string, SetupValueOrigin>> = Object.create(
    null,
  );
  const rows = groups.map((group) => {
    const values: Record<string, number | null> = Object.create(null);
    valueOrigins[group.row.id] = Object.create(null);
    for (const c of columns) {
      if (Object.hasOwn(group.row.values, c.id)) values[c.id] = group.row.values[c.id];
      valueOrigins[group.row.id][c.id] = origin(c, group, count);
    }
    return { ...group.row, values };
  });
  return {
    rows,
    columns: [
      source.columns.find((c) => c.id === source.categoryColumnId) as SnapshotColumn,
      ...aggregateColumns(columns, count),
    ],
    categoryColumnId: source.categoryColumnId,
    valueOrigins,
  };
}
function inverted(
  source: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  groups: readonly SetupObservationGroup[],
  count: boolean,
) {
  const effective = aggregateColumns(columns, count);
  if (!columns.length) return ordinary(source, columns, [], count);
  const homogeneous = effective.every(
    (c) => c.unit === effective[0].unit && c.scale === effective[0].scale,
  );
  const numeric: SnapshotColumn[] = groups.map((g, i) => ({
    id: `${source.categoryColumnId}:${i}`,
    label: String(g.row.category),
    role: "number",
    ...(homogeneous && effective[0].unit !== undefined
      ? { unit: effective[0].unit }
      : {}),
    ...(homogeneous && effective[0].scale !== undefined
      ? { scale: effective[0].scale }
      : {}),
  }));
  const valueOrigins: Record<string, Record<string, SetupValueOrigin>> = Object.create(
    null,
  );
  const rows: SnapshotRow[] = columns.map((c) => {
    const id = `setup:switch:${JSON.stringify(c.id)}`;
    const values: Record<string, number | null> = Object.create(null);
    valueOrigins[id] = Object.create(null);
    groups.forEach((g, i) => {
      if (Object.hasOwn(g.row.values, c.id)) values[numeric[i].id] = g.row.values[c.id];
      valueOrigins[id][numeric[i].id] = origin(c, g, count);
    });
    return { id, category: c.label, values };
  });
  return {
    rows,
    columns: [
      { id: DEFAULT_SETUP_CATEGORY, label: "", role: "category" as const },
      ...numeric,
    ],
    categoryColumnId: DEFAULT_SETUP_CATEGORY,
    valueOrigins,
  };
}
/** Every projection starts from the retained flat capture, never from a prior aggregate. */
export function projectOrdinarySetup(
  input: ChartSnapshot,
  selection: SetupSelection,
  axisPolicy: "single-axis" | "combo-per-axis" | SnapshotPolicy = "single-axis",
): SetupResult<SetupProjection> {
  if (
    ![
      "funnel-observations",
      "heatmap-observations",
      "single-axis",
      "combo-per-axis",
      "waterfall-observations",
      "xy-coordinates",
      "histogram-observations",
      "pie-observations",
      "radar-observations",
      "nightingale-observations",
      "radial-observations",
      "box-observations",
      "statistical-observations",
    ].includes(axisPolicy)
  )
    return invalidSetup("Invalid setup axis policy");
  const statistical =
    axisPolicy === "box-observations" || axisPolicy === "statistical-observations";
  if (statistical && selection.switchCategorySeries)
    return invalidSetup("Box charts cannot switch category and series");
  if (
    axisPolicy !== "single-axis" &&
    axisPolicy !== "pie-observations" &&
    axisPolicy !== "radar-observations" &&
    axisPolicy !== "nightingale-observations" &&
    axisPolicy !== "radial-observations" &&
    selection.switchCategorySeries
  )
    return invalidSetup("Combination charts cannot switch category and series");
  const policy =
    axisPolicy === "single-axis" || axisPolicy === "combo-per-axis"
      ? undefined
      : axisPolicy;
  const retained = retainOrdinarySetupCapture(input, policy);
  if (retained.status !== "ready") return retained;
  const source = retained.value;
  const columns = selectedColumns(source, selection, policy !== undefined, statistical);
  if (!columns)
    return invalidSetup(
      "Selection requires captured category and unique captured numerical series",
    );
  const count = selection.aggFunc === "count";
  const singleAxis =
    axisPolicy === "single-axis" || axisPolicy === "waterfall-observations";
  // Check effective units before transpose; counts derive their own comparable unit.
  if (singleAxis && incompatible(aggregateColumns(columns, count)))
    return invalidSetup("Known source units or scales contradict one numerical axis");
  const grouped = statistical
    ? aggregateBoxSetupRows(source.rows, selection.seriesIds, selection.aggFunc)
    : {
        status: "ready" as const,
        value: aggregateSetupRows(source.rows, selection.seriesIds, selection.aggFunc),
      };
  if (grouped.status !== "ready") return grouped;
  const groups =
    axisPolicy === "radar-observations" ||
    axisPolicy === "nightingale-observations" ||
    axisPolicy === "radial-observations"
      ? grouped.value.map((group) => ({
          ...group,
          row: {
            ...group.row,
            values: Object.fromEntries(
              Object.entries(group.row.values).map(([id, value]) => [
                id,
                value === null || Number.isFinite(value) ? value : null,
              ]),
            ),
          },
        }))
      : grouped.value;
  const output = selection.switchCategorySeries
    ? inverted(source, columns, groups, count)
    : ordinary(source, columns, groups, count);
  const sourceMode = selection.switchCategorySeries
    ? "transformed"
    : selection.aggFunc
      ? "grouped"
      : "flat";
  const checked = validateSnapshot(
    {
      ...source,
      rows: output.rows,
      columns: output.columns,
      categoryColumnId: output.categoryColumnId,
      selectedColumnIds: output.columns.map((c) => c.id),
      sourceMode,
    },
    policy,
  );
  if (!checked.valid) return { status: "invalid", diagnostics: checked.diagnostics };
  const setupProjection = selection.switchCategorySeries
    ? {
        kind: "ordinary-switch" as const,
        ...(selection.aggFunc ? { aggFunc: selection.aggFunc } : {}),
      }
    : selection.aggFunc
      ? { kind: "ordinary-aggregate" as const, aggFunc: selection.aggFunc }
      : undefined;
  return {
    status: "ready",
    value: {
      snapshot: checked.snapshot,
      ...(setupProjection ? { setupProjection } : {}),
      valueOrigins: output.valueOrigins,
      observationKind: count ? "count" : "raw-observations",
      axisUnits: !singleAxis
        ? "deferred"
        : aggregateColumns(columns, count).every(
              (c) => c.unit !== undefined && c.scale !== undefined,
            )
          ? "consistent"
          : "unknown",
    },
  };
}
