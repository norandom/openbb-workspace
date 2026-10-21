import type { SnapshotDiagnostic } from "../compatibility/snapshotTypes";

export interface BoxCapturedCategory {
  readonly category: string | number;
  readonly aggregationKey: string;
}

export type BoxCategoryCaptureResult =
  | { readonly status: "ready"; readonly value: BoxCapturedCategory }
  | {
      readonly status: "unresolved";
      readonly diagnostics: readonly SnapshotDiagnostic[];
    };

function unresolved(message: string): BoxCategoryCaptureResult {
  return {
    status: "unresolved",
    diagnostics: [{ code: "box-category-capture", path: ["category"], message }],
  };
}

function ready(
  category: string | number,
  aggregationKey: string,
): BoxCategoryCaptureResult {
  return { status: "ready", value: { category, aggregationKey } };
}

function captureDate(raw: object): BoxCategoryCaptureResult {
  try {
    if (
      Object.getPrototypeOf(raw) !== Date.prototype ||
      ["toString", "valueOf", Symbol.toPrimitive].some((key) => Object.hasOwn(raw, key))
    ) {
      return unresolved(
        "Use an ordinary native Date without own coercion properties for the category.",
      );
    }
    const timestamp = Date.prototype.getTime.call(raw);
    if (!Number.isFinite(timestamp))
      return unresolved("Replace the invalid Date category with a finite native Date.");
    // Grid aggregates by the raw Date string before statistical grouping by epoch.
    return ready(timestamp, Date.prototype.toString.call(raw));
  } catch {
    return unresolved(
      "Use a readable ordinary native Date or a supported primitive category.",
    );
  }
}

export function captureBoxCategory(
  raw: unknown,
  defaultCategory: boolean,
  defaultRowNumber?: number,
): BoxCategoryCaptureResult {
  if (typeof defaultCategory !== "boolean")
    return unresolved("Select default category using a boolean selector.");
  if (defaultCategory) {
    if (
      typeof defaultRowNumber !== "number" ||
      !Number.isSafeInteger(defaultRowNumber) ||
      defaultRowNumber <= 0
    ) {
      return unresolved(
        "Supply a positive safe integer row ordinal within the selected displayed range.",
      );
    }
    // Default statistical identity is shared; retained aggregation uses each row's ordinal.
    return ready(1, String(defaultRowNumber));
  }
  if (raw === null) return ready("", "null");
  if (raw === undefined) return ready("", "undefined");
  if (typeof raw === "string") return ready(raw, raw);
  if (typeof raw === "number" && Number.isFinite(raw)) return ready(raw, String(raw));
  if (typeof raw === "object") return captureDate(raw);
  return unresolved(
    "Use a string, finite number, null, undefined or ordinary finite native Date category.",
  );
}
