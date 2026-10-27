import type { ChartStorageOutput, RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  SankeyDiagnostic,
  SankeyMetadataKey,
  SankeySelection,
} from "../compatibility/sankeyContracts";
import type { ApplicationSessionInputs } from "./applicationSessionTypes";
import type { SankeySetupEdit } from "./sankeyTypes";

const keys: readonly SankeyMetadataKey[] = [
  "unit",
  "currency",
  "scale",
  "period",
  "measure",
];
const mappings = ["sourceColumnId", "targetColumnId", "valueColumnId"] as const;
export const emptySankeySelection = (): SankeySelection => ({
  sourceColumnId: null,
  targetColumnId: null,
  valueColumnId: null,
  metadata: { unit: null, currency: null, scale: null, period: null, measure: null },
  metadataColumnIds: {},
});
export function storedSankeySetup(
  storage: ChartStorageOutput,
  address: ApplicationSessionInputs["address"],
): unknown {
  const partition = storage[address.stateKey] as RuntimeOptions | undefined;
  return (partition?.sankey as RuntimeOptions | undefined)?.sankeySetup;
}
export const sankeySetupKey = (
  storage: ChartStorageOutput,
  address: ApplicationSessionInputs["address"],
) => JSON.stringify(storedSankeySetup(storage, address) ?? null);
export function sankeyDiagnostic(
  message: string,
  path: (string | number)[] = [],
): SankeyDiagnostic {
  return { code: "sankey-setup", path, message, severity: "error", rowIds: [] };
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("Expected object");
  return raw as Record<string, unknown>;
}
function column(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && value.length > 0);
}
/** Malformed saves remain untouched until a user explicitly replaces a field. */
export function readSankeySetup(raw: unknown): {
  selection: SankeySelection;
  diagnostics: readonly SankeyDiagnostic[];
} {
  if (raw === undefined) return { selection: emptySankeySelection(), diagnostics: [] };
  try {
    const saved = record(raw);
    if (saved.version !== 1) throw Error("Unsupported saved Sankey setup version");
    if (!mappings.every((key) => column(saved[key])))
      throw Error("Invalid saved Sankey mapping");
    const metadata = record(saved.metadata);
    const bindings = record(saved.metadataColumnIds);
    if (
      !keys.every(
        (key) =>
          metadata[key] === null ||
          (key === "scale"
            ? typeof metadata[key] === "number" &&
              Number.isFinite(metadata[key]) &&
              metadata[key] > 0
            : typeof metadata[key] === "string" && metadata[key].trim().length > 0),
      )
    )
      throw Error("Invalid saved Sankey metadata");
    if (
      !Object.entries(bindings).every(
        ([key, value]) =>
          keys.includes(key as SankeyMetadataKey) &&
          typeof value === "string" &&
          value.length > 0,
      )
    )
      throw Error("Invalid saved Sankey metadata column");
    return {
      selection: structuredClone({
        sourceColumnId: saved.sourceColumnId,
        targetColumnId: saved.targetColumnId,
        valueColumnId: saved.valueColumnId,
        metadata,
        metadataColumnIds: bindings,
      }) as unknown as SankeySelection,
      diagnostics: [],
    };
  } catch (error) {
    return {
      selection: emptySankeySelection(),
      diagnostics: [
        sankeyDiagnostic(
          error instanceof Error ? error.message : "Invalid saved Sankey setup",
        ),
      ],
    };
  }
}
export function editSankeySelection(
  selection: SankeySelection,
  edit: SankeySetupEdit,
): SankeySelection {
  if (edit.kind === "mapping") {
    if (!mappings.includes(edit.field) || !column(edit.value))
      throw Error("Invalid Sankey mapping edit");
    return { ...selection, [edit.field]: edit.value };
  }
  if (!keys.includes(edit.field)) throw Error("Invalid Sankey metadata field");
  if (edit.kind === "metadata-column") {
    if (!column(edit.value)) throw Error("Invalid Sankey metadata binding");
    const metadataColumnIds = { ...selection.metadataColumnIds };
    if (edit.value === null) delete metadataColumnIds[edit.field];
    else metadataColumnIds[edit.field] = edit.value;
    return { ...selection, metadataColumnIds };
  }
  const value = edit.value;
  if (
    edit.kind !== "metadata" ||
    (value !== null &&
      (edit.field === "scale"
        ? typeof value !== "number" || !Number.isFinite(value) || value <= 0
        : typeof value !== "string" || !value.trim()))
  )
    throw Error("Invalid Sankey metadata edit");
  return { ...selection, metadata: { ...selection.metadata, [edit.field]: value } };
}
