import { describe, expect, it } from 'vitest';
import { calculateHistogramBins } from '../../../src/components/General/Table/Chart/compatibility/histogramBins';
import type { HistogramBinResult } from '../../../src/components/General/Table/Chart/compatibility/histogramTypes';

function resolved(input: unknown) {
  const result = calculateHistogramBins(input);
  expect(result.status).toBe('resolved');
  if (result.status !== 'resolved') throw new Error(JSON.stringify(result));
  return result;
}

function invalid(input: unknown, path?: readonly (string | number)[]) {
  const result = calculateHistogramBins(input);
  expect(result.status).toBe('invalid');
  if (result.status !== 'invalid') throw new Error('Expected invalid result');
  expect(result.diagnostics).toEqual([expect.objectContaining({
    code: expect.any(String), message: expect.any(String), path: path ?? expect.any(Array),
  })]);
  expect(result).not.toHaveProperty('bins');
  expect(result).not.toHaveProperty('groups');
}

const group = (intervalIndex: number, observationIndices: number[]) =>
  ({ intervalIndex, frequency: observationIndices.length, observationIndices });

describe('histogram default tick intervals', () => {
  it('retains the smaller multiplier on tied target-count distances', () => {
    const result = resolved({ values: [0, 13, 13, null] });
    expect(result).toEqual({ status: 'resolved', repair: 'none', skippedIndices: [3],
      bins: [[-1, 0], [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
        [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]],
      groups: [group(1, [0]), group(14, [1, 2])],
    });
    expect(resolved({ values: [0, 28] }).bins).toEqual([
      [-2, 0], [0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14],
      [14, 16], [16, 18], [18, 20], [20, 22], [22, 24], [24, 26], [26, 28], [28, 30],
    ]);
  });

  it('generates rounded decimal ticks while retaining direct upper-edge arithmetic', () => {
    expect(resolved({ values: [0.03, 0.1, 0.15, 0.32] })).toEqual({
      status: 'resolved', repair: 'none', skippedIndices: [],
      bins: [[0, 0.05], [0.05, 0.1], [0.1, 0.15000000000000002], [0.15, 0.2],
        [0.2, 0.25], [0.25, 0.3], [0.3, 0.35]],
      groups: [group(0, [0]), group(2, [1, 2]), group(6, [3])],
    });
  });

  it('keeps near-integer tick endpoints rather than incorrectly dropping the first tick', () => {
    expect(resolved({ values: [1.000000000000001, 2] }).bins).toEqual([
      [0.9, 1], [1, 1.1], [1.1, 1.2000000000000002], [1.2, 1.3], [1.3, 1.4000000000000001],
      [1.4, 1.5], [1.5, 1.6], [1.6, 1.7000000000000002], [1.7, 1.8],
      [1.8, 1.9000000000000001], [1.9, 2], [2, 2.1],
    ]);
  });

  it.each([7, -7, 0, 0.25])('preserves the finite default equal domain %s', value => {
    expect(resolved({ values: [value, value] })).toEqual({
      status: 'resolved', repair: 'none', bins: [[value - 1, value], [value, value + 1]],
      groups: [group(1, [0, 1])], skippedIndices: [],
    });
  });

  it('handles exponent-form decimal steps', () => {
    expect(resolved({ values: [0, 0.00000001] }).bins).toEqual([
      [-1e-9, 0], [0, 1e-9], [1e-9, 2e-9], [2e-9, 3.0000000000000004e-9],
      [3e-9, 4e-9], [4e-9, 5e-9], [5e-9, 6e-9], [6e-9, 7e-9],
      [7e-9, 8e-9], [8e-9, 9.000000000000001e-9], [9e-9, 1e-8], [1e-8, 1.1000000000000001e-8],
    ]);
  });

  it('keeps signed default observations and zero in their ordinary intervals', () => {
    expect(resolved({ values: [-10, -1, 0] })).toEqual({
      status: 'resolved', repair: 'none', skippedIndices: [],
      bins: [[-11, -10], [-10, -9], [-9, -8], [-8, -7], [-7, -6], [-6, -5],
        [-5, -4], [-4, -3], [-3, -2], [-2, -1], [-1, 0], [0, 1]],
      groups: [group(1, [0]), group(10, [1]), group(11, [2])],
    });
  });
});

describe('histogram explicit counts', () => {
  it('floors negative minima and rounds endpoints at adaptive precision', () => {
    expect(resolved({ values: [-2.4, -1, 0, 2.6], binCount: 3 })).toEqual({
      status: 'resolved', repair: 'none', bins: [[-3, -1.1], [-1.1, 0.7], [0.7, 2.6]],
      groups: [group(0, [0]), group(1, [1, 2]), group(2, [3])], skippedIndices: [],
    });
    expect(resolved({ values: [0.001, 0.006], binCount: 2 }).bins).toEqual([[0, 0.003], [0.003, 0.006]]);
  });

  it('uses one segment for zero and accepts counts below one', () => {
    expect(resolved({ values: [1.25, 2.75], binCount: 0 })).toEqual({
      status: 'resolved', repair: 'none', bins: [[1, 2.8]],
      groups: [group(0, [0, 1])], skippedIndices: [],
    });
    expect(resolved({ values: [0, 1], binCount: 0.5 }).bins).toEqual([[0, 2]]);
  });

  it('keeps fractional counts and their lack of integer-final extension', () => {
    expect(resolved({ values: [0, 0.4, 0.8, 1], binCount: 2.5 })).toEqual({
      status: 'resolved', repair: 'none', bins: [[0, 0.4], [0.4, 0.8], [0.8, 1.2]],
      groups: [group(0, [0]), group(1, [1]), group(2, [2, 3])], skippedIndices: [],
    });
    expect(resolved({ values: [9, 100], binCount: 2.9 })).toEqual({
      status: 'resolved', repair: 'none', bins: [[0, 31.4], [31.4, 62.8], [62.8, 94.1]],
      groups: [group(0, [0])], skippedIndices: [1],
    });
    expect(resolved({ values: [9, 100], binCount: 3 }).bins).toEqual([[0, 30.3], [30.3, 60.7], [60.7, 100]]);
  });

  it.each([0, 0.5, 3])('names the equal-integer count repair for count %s', binCount => {
    const input = Object.freeze({ values: Object.freeze([-2, -2, null]), binCount });
    expect(resolved(input)).toEqual({ status: 'resolved', repair: 'equal-integer-count',
      bins: [[-3, -2], [-2, -1]], groups: [group(1, [0, 1])], skippedIndices: [2] });
    expect(input.binCount).toBe(binCount);
  });

  it('does not repair equal fractional observations', () => {
    expect(resolved({ values: [0.25, 0.25], binCount: 4 })).toEqual({
      status: 'resolved', repair: 'none', bins: [[0, 0.063], [0.063, 0.125], [0.125, 0.188], [0.188, 0.25]],
      groups: [group(3, [0, 1])], skippedIndices: [],
    });
    expect(resolved({ values: [-0.25], binCount: 4 }).bins).toEqual([
      [-1, -0.81], [-0.81, -0.62], [-0.62, -0.44], [-0.44, -0.25],
    ]);
  });
});

describe('histogram explicit boundaries and metadata', () => {
  it('preserves order, first overlap match and the historical final-bin catch-all', () => {
    const bins = [[10, 20], [0, 15], [30, 40]];
    expect(resolved({ values: [-3, 0, 10, 14, 15, 20, 25, 30, 40, 41, null, 10], bins })).toEqual({
      status: 'resolved', repair: 'none', bins,
      groups: [group(0, [2, 3, 4, 11]), group(1, [1]), group(2, [0, 5, 6, 7, 8])], skippedIndices: [9, 10],
    });
  });

  it('retains empty intervals in the domain without synthesizing groups', () => {
    expect(resolved({ values: [0, 1, null, 2], bins: [[-10, -5], [0, 1], [1, 3], [10, 20]] })).toEqual({
      status: 'resolved', repair: 'none', bins: [[-10, -5], [0, 1], [1, 3], [10, 20]],
      groups: [group(1, [0]), group(2, [1, 3])], skippedIndices: [2],
    });
    expect(resolved({ values: [1, null, -1], bins: [] })).toEqual({
      status: 'resolved', repair: 'none', bins: [], groups: [], skippedIndices: [0, 1, 2],
    });
  });

  it('prioritizes count, treats undefined as absent and validates inactive bins', () => {
    const values = [0, 10];
    expect(resolved({ values, binCount: 1, bins: [[100, 200]] }).bins).toEqual([[0, 10]]);
    expect(resolved({ values, binCount: undefined, bins: [[100, 200]] }).bins).toEqual([[100, 200]]);
    expect(resolved({ values, binCount: undefined, bins: undefined })).toEqual(resolved({ values }));
    invalid({ values, binCount: 1, bins: [[2, 1]] }, ['bins', 0]);
  });

  it.each([{ values: [] }, { values: [null, null] }])('returns an empty domain without finite observations: %j', ({ values }) => {
    expect(resolved({ values, binCount: 3, bins: [[0, 1]] })).toEqual({
      status: 'resolved', repair: 'none', bins: [], groups: [], skippedIndices: values.map((_, index) => index),
    });
  });

  it('detaches all output arrays and preserves frozen inputs', () => {
    const pair = Object.freeze([0, 3]);
    const bins = Object.freeze([pair]);
    const values = Object.freeze([1, null, 1]);
    const input = Object.freeze({ values, bins });
    const result = resolved(input);
    expect(result.bins).not.toBe(bins);
    expect(result.bins[0]).not.toBe(pair);
    (result.bins[0] as number[])[0] = -100;
    (result.groups[0].observationIndices as number[]).push(99);
    expect(input).toEqual({ values: [1, null, 1], bins: [[0, 3]] });
    expect(resolved(input)).toEqual({ status: 'resolved', repair: 'none', bins: [[0, 3]],
      groups: [group(0, [0, 2])], skippedIndices: [1] });
  });
});

describe('histogram defensive validation and resource bounds', () => {
  it.each([
    null, undefined, [], 1, {}, { values: '1' }, { values: [undefined] }, { values: ['1'] },
    { values: [NaN] }, { values: [Infinity] }, { values: [-Infinity] }, { values: [new Number(1)] },
    { values: [new Date(0)] }, { values: new Array(2) }, { values: [1, , 2] },
    ...[-1, NaN, Infinity, -Infinity, '2', null, true].map(binCount => ({ values: [], binCount })),
    ...[null, {}, [null], [[1]], [[0, 1, 2]], [[1, 1]], [[2, 1]], [[0, Infinity]],
      [[NaN, 1]], [['0', 1]], new Array(1), [[0, ,]]].map(bins => ({ values: [], bins })),
  ].map(input => ({ input })))('rejects malformed input without partial results: %j', ({ input }) => invalid(input));

  it('handles accessors and hostile proxies without throwing', () => {
    const throwing = () => { throw new Error('unreadable'); };
    invalid(Object.defineProperty({}, 'values', { get: throwing }));
    invalid(Object.defineProperty({ values: [1] }, 'binCount', { get: throwing }));
    invalid({ values: Object.defineProperty([1], '0', { get: throwing }) });
    invalid({ values: [1], binCount: 1, bins: Object.defineProperty([[0, 1]], '0', { get: throwing }) });
    invalid({ values: [1], bins: [Object.defineProperty([0, 1], '1', { get: throwing })] });
    invalid(new Proxy({}, { getPrototypeOf: throwing }));
    invalid({ values: new Proxy([], { getOwnPropertyDescriptor: throwing }) });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    invalid(revoked.proxy);
  });

  it('does not invoke getters while inspecting caller-owned data', () => {
    let reads = 0;
    const input = Object.defineProperty({}, 'values', { enumerable: true, get: () => { reads++; return [1]; } });
    invalid(input, ['values']);
    expect(reads).toBe(0);
    invalid({ values: Object.assign([1], { extra: 2 }) }, ['values']);
    invalid(Object.create({ values: [1] }));
  });

  it('validates bad options even for an empty observation set', () => {
    invalid({ values: [], binCount: -1 }, ['binCount']);
    invalid({ values: [null], bins: [[0, 0]] }, ['bins', 0]);
  });

  it('allows exactly 10000 intervals and rejects excess before deriving output', () => {
    const supplied = Array.from({ length: 10000 }, (_, i) => [i, i + 1]);
    expect(resolved({ values: [0, 10000], bins: supplied }).bins).toHaveLength(10000);
    expect(resolved({ values: [0, 10000], binCount: 10000 }).bins).toHaveLength(10000);
    invalid({ values: [], binCount: 10000.01 }, ['binCount']);
    invalid({ values: [0], bins: new Array(10001) }, ['bins']);
    invalid({ values: [0], binCount: Number.MAX_VALUE }, ['binCount']);
    invalid({ values: [0], binCount: 1, bins: new Array(10001) }, ['bins']);
  });

  it.each([
    { values: [-Number.MAX_VALUE, Number.MAX_VALUE] },
    { values: [-Number.MAX_VALUE, Number.MAX_VALUE], binCount: 2 },
    { values: [Number.MAX_VALUE] }, { values: [Number.MAX_VALUE], binCount: 2 },
    { values: [2 ** 53] }, { values: [2 ** 53], binCount: 3 },
    { values: [0, Number.MIN_VALUE] }, { values: [0, Number.MIN_VALUE], binCount: 2 },
    { values: [1e-307, 2e-307], binCount: 10000 },
  ])('rejects nonfinite, collapsed or unrepresentable derived geometry: %j', input => invalid(input));

  it('accepts large finite explicit boundaries without applying derived-domain repairs', () => {
    expect(resolved({ values: [-Number.MAX_VALUE, Number.MAX_VALUE], bins: [[-Number.MAX_VALUE, Number.MAX_VALUE]] }))
      .toEqual({ status: 'resolved', repair: 'none', bins: [[-Number.MAX_VALUE, Number.MAX_VALUE]],
        groups: [group(0, [0, 1])], skippedIndices: [] });
  });

  it('partitions each original index once with finite geometry and integer counts', () => {
    const inputs = [
      { values: [-5, null, 0, 0, 1, 5, null], binCount: 3 },
      { values: [-9, null, 0, 2, 8, 100], bins: [[0, 3], [5, 10]] },
      { values: [0.25, null, 0.25], binCount: 7.5 },
    ];
    for (const input of inputs) {
      const result: Extract<HistogramBinResult, { status: 'resolved' }> = resolved(input);
      const indices = [...result.skippedIndices, ...result.groups.flatMap(item => [...item.observationIndices])];
      expect(indices.sort((a, b) => a - b)).toEqual(input.values.map((_, i) => i));
      expect(new Set(indices).size).toBe(input.values.length);
      expect(result.bins.every(([low, high]) => Number.isFinite(low) && Number.isFinite(high) && low < high)).toBe(true);
      expect(result.groups.every(item => Number.isInteger(item.frequency) && item.frequency > 0 && item.frequency === item.observationIndices.length)).toBe(true);
    }
  });
});
