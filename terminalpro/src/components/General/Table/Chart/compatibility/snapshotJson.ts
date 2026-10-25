import type {
  DiagnosticPath,
  SnapshotDiagnostic,
  SnapshotJson,
} from "./snapshotTypes";
type RecordValue = Record<string, unknown>;
const failures = new WeakMap<object, SnapshotDiagnostic>();
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
function failure(path: DiagnosticPath, message: string): never {
  const diagnostic = { code: "invalid-snapshot", path, message };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}
/** Inspect descriptors before reading: malformed provenance must never invoke getters. */
function copyJson(
  value: unknown,
  path: DiagnosticPath,
  ancestors: Set<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    finite(value)
  )
    return value;
  if (typeof value !== "object" || value === null)
    failure(path, "Expected finite JSON data");
  if (ancestors.has(value)) failure(path, "Cyclic JSON data");
  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null)
    failure(path, "Expected a plain JSON object");
  ancestors.add(value);
  const result: RecordValue | unknown[] = array ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (array && key === "length") continue;
    if (typeof key !== "string") failure(path, "Symbol keys are not JSON data");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const segment = array && /^(0|[1-9]\d*)$/.test(key) ? Number(key) : key;
    const next = [...path, segment];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      failure(next, "Expected an enumerable data property");
    if (
      array &&
      (typeof segment !== "number" || segment >= (value as unknown[]).length)
    )
      failure(next, "Invalid array property");
    Object.defineProperty(result, key, {
      value: copyJson(descriptor.value, next, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (array && Object.keys(result).length !== (value as unknown[]).length)
    failure(path, "Sparse arrays are not JSON data");
  ancestors.delete(value);
  return result;
}

export function copySnapshotJson(
  value: unknown,
  path: DiagnosticPath = [],
): SnapshotJson {
  return copyJson(value, path, new Set()) as SnapshotJson;
}
export function snapshotJsonDiagnostic(
  error: unknown,
): SnapshotDiagnostic | undefined {
  return (typeof error === "object" && error !== null) ||
    typeof error === "function"
    ? failures.get(error)
    : undefined;
}
