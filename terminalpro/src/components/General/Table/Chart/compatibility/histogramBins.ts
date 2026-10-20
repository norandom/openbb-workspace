import type { HistogramBinInput, HistogramBinResult, HistogramInterval } from './histogramTypes';
import type { DiagnosticPath, SnapshotDiagnostic } from './snapshotTypes';

const intervalLimit = 10000;
const failures = new WeakMap<object, SnapshotDiagnostic>();
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function fail(path: DiagnosticPath, message: string): never {
  const diagnostic = { code: 'invalid-histogram', path, message };
  failures.set(diagnostic, diagnostic);
  throw diagnostic;
}

function property(value: object, key: string, path: DiagnosticPath): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return undefined;
  if (!('value' in descriptor) || (key !== 'length' && !descriptor.enumerable)) {
    fail(path, 'Expected an enumerable data property.');
  }
  return descriptor.value;
}

function entries(value: unknown, path: DiagnosticPath, limit = Infinity): unknown[] {
  if (!Array.isArray(value)) fail(path, 'Expected a dense array.');
  const length = property(value, 'length', path);
  if (!finite(length) || !Number.isInteger(length) || length < 0) fail(path, 'Invalid array length.');
  if (length > limit) fail(path, `Histogram permits at most ${limit} intervals.`);
  if (Reflect.ownKeys(value).length !== length + 1) fail(path, 'Expected a dense array without extra properties.');
  const copy: unknown[] = [];
  for (let index = 0; index < length; index++) copy.push(property(value, String(index), [...path, index]));
  return copy;
}

function interval(lower: unknown, upper: unknown, path: DiagnosticPath): HistogramInterval {
  if (!finite(lower) || !finite(upper) || lower >= upper) {
    fail(path, 'Histogram endpoints must be finite and strictly increasing.');
  }
  return [lower, upper];
}

function readBins(value: unknown): HistogramInterval[] | undefined {
  if (value === undefined) return undefined;
  return entries(value, ['bins'], intervalLimit).map((item, index) => {
    const path = ['bins', index];
    const pair = entries(item, path);
    if (pair.length !== 2) fail(path, 'Expected one lower and one upper endpoint.');
    return interval(pair[0], pair[1], path);
  });
}

function readInput(input: unknown): HistogramBinInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) fail([], 'Expected a histogram input object.');
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== null && prototype !== Object.prototype) fail([], 'Expected a plain histogram input object.');
  const values = entries(property(input, 'values', ['values']), ['values']).map((value, index) => {
    if (value !== null && !finite(value)) fail(['values', index], 'Expected a finite observation or null.');
    return value;
  });
  const binCount = property(input, 'binCount', ['binCount']);
  if (binCount !== undefined && (!finite(binCount) || binCount < 0)) fail(['binCount'], 'Expected a finite nonnegative count.');
  if (binCount !== undefined && Math.ceil(binCount) > intervalLimit) fail(['binCount'], 'Histogram permits at most 10000 intervals.');
  const bins = readBins(property(input, 'bins', ['bins']));
  return { values, binCount, bins };
}

function defaultStep(minimum: number, maximum: number): number {
  const extent = maximum - minimum;
  const order = 10 ** Math.floor(Math.log10(extent / 10));
  let selected = NaN;
  let distance = Infinity;
  // Strict improvement preserves the original smaller-multiplier tie priority.
  for (const multiplier of [1, 2, 5, 10]) {
    const candidate = multiplier * order;
    const difference = Math.abs(Math.ceil(extent / candidate) - 10);
    if (difference < distance) {
      selected = candidate;
      distance = difference;
    }
  }
  if (!finite(extent) || !finite(selected) || selected <= 0) fail(['bins'], 'Default tick step is not representable.');
  return selected;
}

function decimalFactor(step: number): number {
  if (Number.isInteger(step)) return 1;
  const [coefficient, exponent = '0'] = String(step).split('e');
  const decimals = coefficient.split('.')[1]?.length ?? 0;
  const factor = 10 ** Math.max(0, decimals - Number(exponent));
  if (!finite(factor)) fail(['bins'], 'Tick precision is not representable.');
  return factor;
}

function equalBins(value: number): HistogramInterval[] {
  return [interval(value - 1, value, ['bins', 0]), interval(value, value + 1, ['bins', 1])];
}

function defaultBins(minimum: number, maximum: number): HistogramInterval[] {
  if (minimum === maximum) return equalBins(minimum);
  const step = defaultStep(minimum, maximum);
  const close = (value: number) => Math.abs(value - Math.round(value)) < 1e-12;
  const start = close(minimum / step) ? minimum : Math.ceil(minimum / step) * step;
  const end = close(maximum / step) ? maximum : Math.floor(maximum / step) * step;
  const factor = decimalFactor(step);
  if (!finite(start) || !finite(end) || end < start) fail(['bins'], 'Tick extent is not representable.');
  const bins: HistogramInterval[] = [];
  let previous = -Infinity;
  for (let index = 0; ; index++) {
    const tick = Math.round((start + index * step) * factor) / factor;
    if (!finite(tick) || tick <= previous) fail(['bins'], 'Tick endpoints are not representable.');
    if (tick > end) break;
    if (bins.length === 0) bins.push(interval(tick - step, tick, ['bins', 0]));
    if (bins.length >= intervalLimit) fail(['bins'], 'Histogram permits at most 10000 intervals.');
    bins.push(interval(tick, tick + step, ['bins', bins.length]));
    previous = tick;
  }
  if (bins.length === 0) fail(['bins'], 'No representable default intervals.');
  return bins;
}

function countBins(minimum: number, maximum: number, count: number): HistogramInterval[] {
  const segments = count || 1;
  const floor = Math.floor(minimum);
  const width = (maximum - floor) / segments;
  const magnitude = 10 ** Math.floor(Math.log10(width));
  const start = Math.floor(floor / magnitude) * magnitude;
  if (!finite(width) || width <= 0 || !finite(start)) fail(['bins'], 'Count-based interval width or start is not representable.');
  let precision = 10;
  let scaledWidth = width;
  while (scaledWidth < 1) {
    scaledWidth *= 10;
    precision *= 10;
    if (!finite(precision)) fail(['bins'], 'Count-based precision is not representable.');
  }
  const bins: HistogramInterval[] = [];
  for (let index = 0; index < segments; index++) {
    const lower = Math.round((start + index * width) * precision) / precision;
    const roundedUpper = Math.round((start + (index + 1) * width) * precision) / precision;
    // Fractional saved counts intentionally never reach this integer-final extension.
    const upper = index === segments - 1 ? Math.max(roundedUpper, maximum) : roundedUpper;
    bins.push(interval(lower, upper, ['bins', index]));
  }
  return bins;
}

function assign(values: readonly (number | null)[], bins: readonly HistogramInterval[], repair: 'none' | 'equal-integer-count'): HistogramBinResult {
  const occupied = new Map<number, number[]>();
  const skippedIndices: number[] = [];
  values.forEach((value, index) => {
    const match = value === null ? -1 : bins.findIndex(([lower, upper], binIndex) =>
      (value >= lower && value < upper) || (binIndex === bins.length - 1 && value <= upper));
    if (match === -1) skippedIndices.push(index);
    else {
      const indices = occupied.get(match) ?? [];
      indices.push(index);
      occupied.set(match, indices);
    }
  });
  const groups = [...occupied].sort(([first], [second]) => first - second).map(([intervalIndex, observationIndices]) =>
    ({ intervalIndex, frequency: observationIndices.length, observationIndices }));
  return { status: 'resolved', bins, groups, skippedIndices, repair };
}

function calculate(input: unknown): HistogramBinResult {
  const { values, binCount, bins: suppliedBins } = readInput(input);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    if (value !== null) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
  }
  if (minimum === Infinity) return assign(values, [], 'none');
  const repair = binCount !== undefined && minimum === maximum && Number.isInteger(minimum);
  const bins = repair ? equalBins(minimum) : binCount !== undefined ? countBins(minimum, maximum, binCount)
    : suppliedBins ?? defaultBins(minimum, maximum);
  return assign(values, bins, repair ? 'equal-integer-count' : 'none');
}

/** Invalid saved data never exposes partially calculated intervals or groups. */
export function calculateHistogramBins(input: unknown): HistogramBinResult {
  try {
    return calculate(input);
  } catch (error) {
    const diagnostic = (typeof error === 'object' && error !== null ? failures.get(error) : undefined)
      ?? { code: 'invalid-histogram', path: [], message: 'Histogram input could not be inspected safely.' };
    return { status: 'invalid', diagnostics: [diagnostic] };
  }
}
