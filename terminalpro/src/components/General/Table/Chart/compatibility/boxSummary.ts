import type { SnapshotDiagnostic } from './snapshotTypes';

export interface BoxSummary {
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
}
export type BoxSummaryResult =
  | { readonly status: 'resolved'; readonly count: number;
      readonly summary: BoxSummary | null }
  | { readonly status: 'invalid'; readonly diagnostics: readonly SnapshotDiagnostic[] };

function invalid(message: string, path: readonly (string | number)[] = []): BoxSummaryResult {
  return { status: 'invalid', diagnostics: [{ code: 'invalid-input', path, message }] };
}

function quartile(values: readonly number[], probability: number): number {
  const position = (values.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  // Preserve the original proxy's arithmetic, including its overflow behavior.
  return lower + 1 < values.length
    ? values[lower] + fraction * (values[lower + 1] - values[lower])
    : values[lower];
}

function resolve(values: unknown): BoxSummaryResult {
  if (!Array.isArray(values)) return invalid('Expected a dense array of finite numbers or null.');
  const count = values.length;
  if (!Number.isSafeInteger(count) || count < 0) return invalid('Invalid array length.');
  const observations: number[] = [];
  for (let index = 0; index < count; index++) {
    if (!Object.hasOwn(values, index)) return invalid('Missing observation.', [index]);
    const value: unknown = values[index];
    if (value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return invalid('Expected a finite number or null.', [index]);
    }
    observations.push(value);
  }
  if (observations.length === 0) return { status: 'resolved', count: 0, summary: null };
  observations.sort((left, right) => left - right);
  const summary: BoxSummary = {
    min: observations[0], q1: quartile(observations, 0.25),
    median: quartile(observations, 0.5), q3: quartile(observations, 0.75),
    max: observations[observations.length - 1],
  };
  if (!Object.values(summary).every(Number.isFinite)) return invalid('Box summary arithmetic is nonfinite.');
  return { status: 'resolved', count: observations.length, summary };
}

export function calculateBoxSummary(values: unknown): BoxSummaryResult {
  try {
    return resolve(values);
  } catch {
    return invalid('Box summary input could not be read safely.');
  }
}
