import { calculateHistogramBins } from "../compatibility/histogramBins";
import { validateSnapshot } from "../compatibility/snapshot";
import { histogramContextValid, histogramRecord, histogramStyleValid } from "./histogramStyleValidation";
import type { HistogramMappingInput, HistogramProjection, HistogramTranslationFailure } from "./histogramTypes";

export function histogramFailure(message: string, status: "invalid" | "unsupported" = "invalid"): HistogramTranslationFailure {
  return { status, diagnostics: [{ code: `${status}-histogram`, path: [], message }] };
}
export function admitHistogram(input: HistogramMappingInput): HistogramProjection | HistogramTranslationFailure {
  if (!histogramRecord(input)) return histogramFailure("Expected a histogram input.");
  const snapshot = validateSnapshot(input.snapshot, "xy-coordinates");
  if (!snapshot.valid) return { status: "invalid", diagnostics: snapshot.diagnostics };
  if (!histogramRecord(input.binning) || !histogramStyleValid(input) || !histogramContextValid(input.context))
    return histogramFailure("Malformed histogram appearance, binning or context.");
  if ([input.style.axes.x, input.style.axes.y].some(a => a.appearance.fields.type !== "number"))
    return histogramFailure("Histogram requires linear numeric axes.", "unsupported");
  const columns = new Map(snapshot.snapshot.columns.map(c => [c.id, c]));
  const field = snapshot.snapshot.selectedColumnIds.map(id => columns.get(id)).find(c => c?.role === "number");
  const values = snapshot.snapshot.rows.map(row => field ? row.values[field.id] ?? null : null);
  // Preserve H1's accessor diagnostics without invoking supplied option getters.
  const binInput = { values };
  for (const key of ["binCount", "bins"]) {
    const descriptor = Object.getOwnPropertyDescriptor(input.binning, key);
    if (descriptor) Object.defineProperty(binInput, key, descriptor);
  }
  const calculation = calculateHistogramBins(binInput);
  if (calculation.status === "invalid") return { status: "invalid", diagnostics: calculation.diagnostics };
  return { status: "admitted", input: { ...input, snapshot: snapshot.snapshot }, field, calculation };
}
