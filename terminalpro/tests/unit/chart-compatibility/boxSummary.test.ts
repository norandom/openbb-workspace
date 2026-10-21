import { describe, expect, it } from 'vitest';
import { calculateBoxSummary } from '../../../src/components/General/Table/Chart/compatibility/boxSummary';

describe('finite-observation box summary', () => {
  it.each([
    [[5, 1, 3, 2, 4], 5, [1, 2, 3, 4, 5]],
    [[6, 1, 5, 2, 4, 3], 6, [1, 2.25, 3.5, 4.75, 6]],
    [[10, 2], 2, [2, 4, 6, 8, 10]],
    [[7], 1, [7, 7, 7, 7, 7]],
    [[2, 2, 2, 2, 8], 5, [2, 2, 2, 2, 8]],
    [[-8, -4, 0, 4, 8], 5, [-8, -4, 0, 4, 8]],
    [[null, 1, null, 3, 5, null], 3, [1, 2, 3, 4, 5]],
    [[1, 2, 3, 4, 1000], 5, [1, 2, 3, 4, 1000]],
  ])('summarizes %j without changing observation meaning', (values, count, stats) => {
    const [min, q1, median, q3, max] = stats;
    expect(calculateBoxSummary(values)).toEqual({ status: 'resolved', count,
      summary: { min, q1, median, q3, max } });
  });

  it.each([[], [null], [null, null]].map(values => ({ values })))('resolves empty observations $values', ({ values }) => {
    expect(calculateBoxSummary(values)).toEqual({ status: 'resolved', count: 0, summary: null });
  });

  it('preserves original floating-point expression order', () => {
    const result = calculateBoxSummary([0.1, 0.3]);
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('Expected summary');
    expect(result.summary?.q1).toBe(0.1 + 0.25 * (0.3 - 0.1));
    expect(result.summary?.q1).not.toBe(0.75 * 0.1 + 0.25 * 0.3);
  });

  it('leaves frozen input untouched and returns fresh summaries', () => {
    const input = Object.freeze([9, null, 1, 5]);
    const first = calculateBoxSummary(input);
    const second = calculateBoxSummary(input);
    expect(input).toEqual([9, null, 1, 5]);
    expect(first).toEqual(second);
    if (first.status === 'resolved' && second.status === 'resolved') {
      expect(first.summary).not.toBe(second.summary);
    }
  });

  it.each([undefined, null, {}, '1', 1, true, [1, undefined], [1, '2'],
    [1, false], [NaN], [Infinity], [-Infinity], [1, , 3], [[1]],
    [-Number.MAX_VALUE, Number.MAX_VALUE],
    [-Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_VALUE],
  ].map(input => ({ input })))('rejects malformed or nonfinite results atomically: $input', ({ input }) => {
    const result = calculateBoxSummary(input);
    expect(result.status).toBe('invalid');
    expect(result).not.toHaveProperty('summary');
    expect(result).not.toHaveProperty('count');
    if (result.status === 'invalid') {
      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]).toEqual({ code: expect.any(String),
        path: expect.any(Array), message: expect.any(String) });
    }
  });

  it('rejects throwing index, length, own-property and revoked proxy reads', () => {
    const throwing = [1, 2];
    Object.defineProperty(throwing, 1, { get() { throw new Error('unreadable'); } });
    const length = new Proxy([1], { get() { throw new Error('unreadable'); } });
    const own = new Proxy([1], { getOwnPropertyDescriptor() { throw new Error('unreadable'); } });
    const revoked = Proxy.revocable([1], {});
    revoked.revoke();
    for (const input of [throwing, length, own, revoked.proxy]) {
      expect(() => calculateBoxSummary(input)).not.toThrow();
      expect(calculateBoxSummary(input)).toMatchObject({ status: 'invalid' });
    }
  });

  it('rejects inherited observations in sparse arrays', () => {
    const input = [1, , 3];
    Object.setPrototypeOf(input, { 1: 2 });
    expect(calculateBoxSummary(input)).toMatchObject({ status: 'invalid' });
  });
});
