import type { SnapshotDiagnostic } from "./snapshotTypes";

export interface RangeCategoryProvenance {
  readonly categoryColumnId: string;
  readonly columnChartDataType: string | null;
  readonly firstCategoryIsDate: boolean;
  readonly kind: "category" | "number" | "time";
}
type Resolution =
  | { readonly valid: true; readonly kind: RangeCategoryProvenance["kind"] }
  | { readonly valid: false; readonly diagnostic: SnapshotDiagnostic };
function diagnostic(path: readonly string[], message: string): SnapshotDiagnostic {
  return { code: "range-category-provenance", path, message };
}

/** Reuse the retained raw facts with the current model after an axis editor change. */
export function resolveRangeCategoryKind(
  facts: Pick<RangeCategoryProvenance, "columnChartDataType" | "firstCategoryIsDate">,
  currentModelOverride: unknown,
): Resolution {
  if (currentModelOverride != null && typeof currentModelOverride !== "string")
    return {
      valid: false,
      diagnostic: diagnostic(
        ["originalModel", "categoryAxisType"],
        "Expected a string or null category axis override",
      ),
    };
  const effective = currentModelOverride ?? facts.columnChartDataType;
  const kind = effective
    ? effective === "time" || effective === "number"
      ? effective
      : "category"
    : facts.firstCategoryIsDate
      ? "time"
      : "category";
  return { valid: true, kind };
}

export function rangeCategoryModelOverride(model: unknown): unknown {
  return typeof model === "object" && model !== null && !Array.isArray(model)
    ? (model as Record<string, unknown>).categoryAxisType
    : undefined;
}

/** Input must already be descriptor-copied JSON; validation never reads incoming getters. */
export function checkRangeCategoryProvenance(
  snapshot: Record<string, unknown>,
): SnapshotDiagnostic | undefined {
  if (!Object.hasOwn(snapshot, "rangeCategory")) return;
  const facts = snapshot.rangeCategory;
  if (typeof facts !== "object" || facts === null || Array.isArray(facts))
    return diagnostic(["rangeCategory"], "Expected category capture provenance");
  const record = facts as Record<string, unknown>;
  for (const key of [
    "categoryColumnId",
    "columnChartDataType",
    "firstCategoryIsDate",
    "kind",
  ]) {
    if (!Object.hasOwn(record, key))
      return diagnostic(
        ["rangeCategory", key],
        "Expected an own category provenance field",
      );
  }
  if (
    typeof record.categoryColumnId !== "string" ||
    record.categoryColumnId !== snapshot.categoryColumnId
  )
    return diagnostic(
      ["rangeCategory", "categoryColumnId"],
      "Category provenance must match the selected category",
    );
  if (
    record.columnChartDataType !== null &&
    typeof record.columnChartDataType !== "string"
  )
    return diagnostic(
      ["rangeCategory", "columnChartDataType"],
      "Expected string or null Grid chart metadata",
    );
  if (typeof record.firstCategoryIsDate !== "boolean")
    return diagnostic(
      ["rangeCategory", "firstCategoryIsDate"],
      "Expected boolean first raw Date evidence",
    );
  const resolved = resolveRangeCategoryKind(
    record as unknown as RangeCategoryProvenance,
    rangeCategoryModelOverride(snapshot.originalModel),
  );
  if (!resolved.valid) return resolved.diagnostic;
  if (record.kind !== resolved.kind)
    return diagnostic(
      ["rangeCategory", "kind"],
      "Category kind must agree with captured facts and model",
    );
}
