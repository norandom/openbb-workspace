import type {
  SankeyDiagnostic,
  SankeyMetadata,
  SankeyMetadataKey,
} from "./sankeyContracts";
import type { DiagnosticPath } from "./snapshotTypes";

export type SankeyData = Record<string, unknown>;
export const metadataKeys: readonly SankeyMetadataKey[] = [
  "unit",
  "currency",
  "scale",
  "period",
  "measure",
];
export const isData = (value: unknown): value is SankeyData =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
export const nonblank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const failures = new WeakMap<object, SankeyDiagnostic>();
export function sankeyFail(
  path: DiagnosticPath,
  message: string,
  rowIds: readonly string[] = [],
  code = "invalid-sankey",
): never {
  const diagnostic: SankeyDiagnostic = {
    code,
    path,
    message,
    rowIds,
    severity: "error",
  };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}
export function sankeyFailure(error: unknown): SankeyDiagnostic | undefined {
  return (typeof error === "object" && error !== null) || typeof error === "function"
    ? failures.get(error)
    : undefined;
}
export function freezeSankey<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeSankey(child);
    Object.freeze(value);
  }
  return value;
}
export function checkMetadata(
  value: unknown,
  path: DiagnosticPath,
  rowIds: readonly string[] = [],
): asserts value is SankeyMetadata {
  if (!isData(value))
    sankeyFail(
      path,
      "Expected explicit unit, currency, scale, period and measure fields",
      rowIds,
    );
  for (const key of metadataKeys) {
    const item = value[key];
    if (item === null) continue;
    if (key === "scale" ? !finite(item) || item <= 0 : !nonblank(item))
      sankeyFail(
        [...path, key],
        key === "scale"
          ? "Scale must be a finite positive number or null"
          : "Metadata must be a nonblank string or null",
        rowIds,
      );
  }
  if (value.currency !== null && !/^[A-Z]{3}$/.test(value.currency as string))
    sankeyFail(
      [...path, "currency"],
      "Currency must be an uppercase three-letter code",
      rowIds,
    );
  if (value.currency !== null && value.unit !== null && value.unit !== "currency")
    sankeyFail(
      [...path, "currency"],
      "Nonmonetary units require null currency",
      rowIds,
    );
}
export function commonMetadata(
  declared: SankeyMetadata,
  rows: readonly { readonly id: string; readonly metadata: SankeyMetadata }[],
): SankeyMetadata {
  const common = { ...declared };
  for (const key of metadataKeys) {
    let known: string | number | null = declared[key];
    for (const row of rows) {
      const value = row.metadata[key];
      if (value !== null && known !== null && value !== known)
        sankeyFail(
          ["rows", rows.indexOf(row), "metadata", key],
          `Conflicting ${key} metadata`,
          rows.filter((r) => r.metadata[key] !== null).map((r) => r.id),
        );
      if (value !== null) known = value;
    }
    Object.assign(common, { [key]: known });
  }
  checkMetadata(common, ["metadata"]);
  return common;
}
export function completeMetadata(metadata: SankeyMetadata): boolean {
  return (
    metadata.unit !== null &&
    metadata.scale !== null &&
    metadata.period !== null &&
    metadata.measure !== null &&
    (metadata.unit !== "currency" || metadata.currency !== null)
  );
}
