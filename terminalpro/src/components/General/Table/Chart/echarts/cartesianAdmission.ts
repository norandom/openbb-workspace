import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type { CartesianMappingContext } from "./cartesianTypes";

const operators = ["sum", "first", "last", "min", "max", "count", "avg"];
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
export const mappingIssue = (
  code: string,
  path: readonly (string | number)[],
  message: string,
): SnapshotDiagnostic => ({ code, path, message });

export function contextDiagnostics(
  context: CartesianMappingContext | undefined,
): SnapshotDiagnostic[] {
  if (context === undefined) return [];
  if (
    !record(context) ||
    !record(context.observations) ||
    !["declared-units", "raw-observations"].includes(
      context.observations.kind as string,
    )
  )
    return [
      mappingIssue(
        "invalid-context",
        ["context", "observations"],
        "An explicit observation policy is required.",
      ),
    ];
  const display = context.display as unknown;
  if (
    !record(display) ||
    ![
      "category",
      "numericAxis",
      "crosshair",
      "legend",
      "seriesLabel",
      "tooltipNumber",
    ].every((key) => typeof display[key] === "function")
  )
    return [
      mappingIssue(
        "invalid-context",
        ["context", "display"],
        "All financial display callbacks are required.",
      ),
    ];
  const viewport = context.viewport;
  if (
    viewport !== undefined &&
    (!record(viewport) ||
      ![viewport.width, viewport.height].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
      ))
  )
    return [
      mappingIssue(
        "invalid-context",
        ["context", "viewport"],
        "Viewport dimensions must be finite positive pixels.",
      ),
    ];
  return [];
}
export function sourceDiagnostics(
  snapshot: ChartSnapshot,
  context: CartesianMappingContext | undefined,
): SnapshotDiagnostic[] {
  const witness = context?.setupProjection;
  if (witness === undefined && snapshot.sourceMode === "flat") return [];
  if (record(witness)) {
    const operator = witness.aggFunc;
    const validOperator = typeof operator === "string" && operators.includes(operator);
    const aggregate =
      witness.kind === "ordinary-aggregate" &&
      snapshot.sourceMode === "grouped" &&
      validOperator;
    const switched =
      witness.kind === "ordinary-switch" &&
      snapshot.sourceMode === "transformed" &&
      (operator === undefined || validOperator);
    if (
      (aggregate || switched) &&
      Object.keys(witness).every((k) => k === "kind" || k === "aggFunc")
    )
      return [];
  }
  return [
    mappingIssue(
      "unsupported-source",
      ["sourceMode"],
      "Non-flat observations require their matching ordinary Set Up projection.",
    ),
  ];
}
export function unitDiagnostics(
  columns: readonly SnapshotColumn[],
  descriptors: readonly SnapshotColumn[],
  raw: boolean,
): SnapshotDiagnostic[] {
  const units = columns.flatMap((c) => (c.unit === undefined ? [] : [c.unit]));
  const scales = columns.flatMap((c) => (c.scale === undefined ? [] : [c.scale]));
  return columns.flatMap((column) => {
    const path = ["columns", descriptors.findIndex((c) => c.id === column.id)];
    if (
      (column.unit !== undefined &&
        (typeof column.unit !== "string" || column.unit.trim() === "")) ||
      (column.scale !== undefined &&
        (typeof column.scale !== "number" ||
          !Number.isFinite(column.scale) ||
          column.scale <= 0))
    )
      return [
        mappingIssue(
          "invalid-unit",
          [
            ...path,
            column.unit !== undefined &&
            (typeof column.unit !== "string" || column.unit.trim() === "")
              ? "unit"
              : "scale",
          ],
          "Present unit metadata must be a nonempty identity and positive scale.",
        ),
      ];
    if (!raw && (column.unit === undefined || column.scale === undefined))
      return [
        mappingIssue(
          "unknown-unit",
          [...path, column.unit === undefined ? "unit" : "scale"],
          "Selected series require an explicit unit and positive scale.",
        ),
      ];
    if (
      (column.unit !== undefined && column.unit !== units[0]) ||
      (column.scale !== undefined && column.scale !== scales[0])
    )
      return [
        mappingIssue(
          "incompatible-unit",
          [
            ...path,
            column.unit !== undefined && column.unit !== units[0] ? "unit" : "scale",
          ],
          "Known units and scales must agree; observations are never converted.",
        ),
      ];
    return [];
  });
}
