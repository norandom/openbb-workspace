import type { SetupProjection, SetupValueOrigin } from "../application/setupTypes";
import type {
  FunnelData,
  FunnelDataResult,
  FunnelFamily,
  FunnelStage,
  FunnelStageIdentity,
} from "../compatibility/funnelContracts";
import type { SnapshotDiagnostic, SnapshotRow } from "../compatibility/snapshotTypes";

function diagnostic(
  code: string,
  path: readonly (string | number)[],
  message: string,
): SnapshotDiagnostic {
  return { code, path, message };
}
function identity(row: SnapshotRow, index: number): FunnelStageIdentity {
  return { index, rowId: row.id, category: row.category, label: String(row.category) };
}
function validOrigin(origin: SetupValueOrigin | undefined): origin is SetupValueOrigin {
  return (
    !!origin &&
    Array.isArray(origin.sourceRowIds) &&
    origin.sourceRowIds.length > 0 &&
    origin.sourceRowIds.every((id) => typeof id === "string" && id.length > 0) &&
    (origin.kind === "source" || origin.kind === "count")
  );
}
function readStage(
  projection: SetupProjection,
  fieldId: string,
  index: number,
  diagnostics: SnapshotDiagnostic[],
): FunnelStage | undefined {
  const row = projection.snapshot.rows[index];
  const base = identity(row, index);
  const own = Object.hasOwn(row.values, fieldId);
  const value = row.values[fieldId];
  const origin = projection.valueOrigins[row.id]?.[fieldId];
  const copiedOrigin = validOrigin(origin)
    ? { ...origin, sourceRowIds: [...origin.sourceRowIds] }
    : undefined;
  if (!own || value === null)
    return {
      ...base,
      kind: "missing",
      reason: own ? "null" : "absent",
      ...(copiedOrigin ? { origin: copiedOrigin } : {}),
    };
  const path = ["rows", index, "values", fieldId];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push(
      diagnostic(
        "funnel-value",
        path,
        "A present Funnel observation must be a finite number.",
      ),
    );
    return;
  }
  if (!copiedOrigin) {
    diagnostics.push(
      diagnostic(
        "funnel-origin",
        path,
        "A numeric stage requires nonempty source-row provenance.",
      ),
    );
    return;
  }
  if (copiedOrigin.sourceColumnId !== fieldId) {
    diagnostics.push(
      diagnostic(
        "funnel-source-column",
        path,
        "This source-column provenance is unsupported for an unswitched Funnel projection.",
      ),
    );
    return;
  }
  return {
    ...base,
    kind: "value",
    value,
    magnitude: Math.abs(value),
    origin: copiedOrigin,
  };
}
function compensated() {
  // Preserve small scaled contributions without ever summing raw financial levels.
  let sum = 0;
  let correction = 0;
  return (value: number) => {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = next - sum - adjusted;
    sum = next;
    return sum;
  };
}
function pyramid(base: FunnelData): FunnelDataResult {
  let maxValue = 0;
  const diagnostics: SnapshotDiagnostic[] = [];
  for (const stage of base.stages) {
    if (stage.kind !== "value") continue;
    if (stage.value < 0)
      diagnostics.push(
        diagnostic(
          "pyramid-negative",
          ["rows", stage.index, "values", base.field.id],
          "Pyramid requires nonnegative observations.",
        ),
      );
    maxValue = Math.max(maxValue, stage.value);
  }
  if (diagnostics.length) return { status: "invalid", diagnostics };
  if (maxValue === 0)
    return {
      status: "invalid",
      diagnostics: [
        diagnostic(
          "pyramid-total",
          ["rows"],
          "Pyramid requires a positive total; all observations are zero.",
        ),
      ],
    };
  const scaled = base.stages.map((stage) =>
    stage.kind === "value" ? stage.value / maxValue : null,
  );
  const addTotal = compensated();
  let scaledTotal = 0;
  let lastPositive = -1;
  scaled.forEach((value, index) => {
    if (value === null) return;
    scaledTotal = addTotal(value);
    if (value > 0) lastPositive = index;
  });
  const addCumulative = compensated();
  let boundary = 0;
  const axialRanges = scaled.map((value, index) => {
    if (value === null) return null;
    const start = boundary;
    const cumulative = addCumulative(value);
    boundary =
      index >= lastPositive
        ? 1
        : Math.max(start, Math.min(1, cumulative / scaledTotal));
    return { start, end: boundary };
  });
  const valid =
    Number.isFinite(scaledTotal) &&
    scaledTotal > 0 &&
    axialRanges.every(
      (range) =>
        range === null ||
        (Number.isFinite(range.start) &&
          Number.isFinite(range.end) &&
          range.start >= 0 &&
          range.end <= 1 &&
          range.end >= range.start),
    );
  if (!valid)
    return {
      status: "invalid",
      diagnostics: [
        diagnostic(
          "pyramid-total",
          ["rows"],
          "Pyramid could not produce finite positive-total axial ranges.",
        ),
      ],
    };
  return {
    status: "ready",
    value: { ...base, family: "pyramid", maxValue, scaledTotal, axialRanges },
  };
}
export function buildFunnelData(
  projection: SetupProjection,
  family: FunnelFamily,
): FunnelDataResult {
  if (projection.setupProjection?.kind === "ordinary-switch")
    return {
      status: "invalid",
      diagnostics: [
        diagnostic(
          "funnel-orientation",
          ["setupProjection", "kind"],
          "Funnel requires an unswitched ordinary projection.",
        ),
      ],
    };
  const { snapshot } = projection;
  const selected = snapshot.selectedColumnIds
    .map((id) => snapshot.columns.find((column) => column.id === id))
    .find((column) => column?.role === "number");
  const identities = snapshot.rows.map(identity);
  if (!selected) return { status: "empty", reason: "no-series", stages: identities };
  const field = structuredClone(selected);
  if (!snapshot.rows.length)
    return { status: "empty", reason: "no-rows", stages: identities, field };
  const diagnostics: SnapshotDiagnostic[] = [];
  const stages: FunnelStage[] = [];
  snapshot.rows.forEach((_, index) => {
    const stage = readStage(projection, field.id, index, diagnostics);
    if (stage) stages.push(stage);
  });
  if (diagnostics.length) return { status: "invalid", diagnostics };
  if (!stages.some((stage) => stage.kind === "value"))
    return { status: "empty", reason: "no-values", stages: identities, field };
  const base = { family, field, observationKind: projection.observationKind, stages };
  if (family === "pyramid") return pyramid(base);
  let maxAbs = 0;
  for (const stage of stages)
    if (stage.kind === "value") maxAbs = Math.max(maxAbs, stage.magnitude);
  const magnitudeRatios = stages.map((stage) =>
    stage.kind === "missing" ? null : maxAbs === 0 ? 0 : stage.magnitude / maxAbs,
  );
  return { status: "ready", value: { ...base, family, maxAbs, magnitudeRatios } };
}
