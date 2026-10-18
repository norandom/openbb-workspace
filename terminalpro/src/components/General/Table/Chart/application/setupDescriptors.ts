import { validateSnapshot } from "../compatibility/snapshot";
import type { SnapshotColumn } from "../compatibility/snapshotTypes";
import { invalidSetup, type SetupResult } from "./setupTypes";

/** Caller resolves roles from real definitions; labels never supply units or scaling. */
export function createSetupDescriptors(
  columns: readonly SnapshotColumn[],
  categoryColumnId: string,
): SetupResult<readonly SnapshotColumn[]> {
  const category = columns.find(
    (c) => c.id === categoryColumnId && c.role === "category",
  );
  if (!category || new Set(columns.map((c) => c.id)).size !== columns.length)
    return invalidSetup("Expected unique column IDs and a declared chosen category");
  const descriptors = [category, ...columns.filter((c) => c.role === "number")];
  const checked = validateSnapshot({
    stateAddress: "descriptor-validation",
    dataRevision: 0,
    originalModel: {},
    selectedRange: {},
    sourceMode: "flat",
    columns: descriptors,
    categoryColumnId,
    selectedColumnIds: descriptors.map((c) => c.id),
    rows: [],
  });
  return checked.valid
    ? { status: "ready", value: checked.snapshot.columns }
    : { status: "invalid", diagnostics: checked.diagnostics };
}
