import { describe, expect, it } from 'vitest';
import { resolvePieAssignments, type PieChartType } from '../../../src/components/General/Table/Chart/compatibility/pieAssignments';

const columns = (ids: readonly string[]) => ids.map(colId => ({ colId, selected: true }));
const resolve = (chartType: PieChartType, ids: readonly string[]) => resolvePieAssignments({ chartType, valueColumns: columns(ids) });
const ring = (colId: string, outerRadiusOffset: number, innerRadiusOffset: number, titleInLegend: boolean) =>
  ({ colId, ring: { outerRadiusOffset, innerRadiusOffset, titleInLegend } });

function invalid(input: unknown) {
  const result = resolvePieAssignments(input);
  expect(result.status).toBe('invalid');
  expect(result).not.toHaveProperty('assignments');
  expect(result.diagnostics).toEqual([{ code: 'invalid-input', message: expect.any(String) }]);
}

describe('pie column assignments', () => {
  it('uses the first selected pie field without ring metadata', () => {
    expect(resolve('pie', ['b', 'a', 'c'])).toEqual({ status: 'resolved', chartType: 'pie', seriesType: 'pie', assignments: [{ colId: 'b' }], diagnostics: [] });
  });

  it.each(['donut', 'doughnut'] as const)('preserves %s spelling and native pixel offsets', chartType => {
    for (const [ids, assignments] of [
      [['a'], [ring('a', 0, -40, false)]],
      [['a', 'b'], [ring('a', 0, -20, true), ring('b', -40, -60, true)]],
      [['a', 'b', 'c'], [ring('a', 0, -20, true), ring('b', -40, -60, true), ring('c', -80, -100, true)]],
    ] as const) {
      expect(resolve(chartType, ids)).toEqual({ status: 'resolved', chartType, seriesType: 'donut', assignments, diagnostics: [] });
    }
  });

  it.each(['pie', 'donut', 'doughnut'] as const)('resolves empty and deselected %s lists', chartType => {
    for (const valueColumns of [[], [{ colId: 'a', selected: false }]]) {
      expect(resolvePieAssignments({ chartType, valueColumns })).toMatchObject({ status: 'resolved', assignments: [], diagnostics: [] });
    }
  });

  it('filters in supplied order and accepts empty IDs', () => {
    const valueColumns = [{ colId: 'skip', selected: false }, ...columns(['z', '', 'a'])];
    expect(resolvePieAssignments({ chartType: 'donut', valueColumns })).toMatchObject({ assignments: [ring('z', 0, -20, true), ring('', -40, -60, true), ring('a', -80, -100, true)] });
  });

  it.each([
    null, undefined, false, [], 'pie', {},
    { chartType: 'line', valueColumns: [] },
    ...[null, {}, 'a', [null], [[]], [false], [{ colId: 1, selected: true }], [{ colId: 'a' }], [{ colId: 'a', selected: 1 }], new Array(1), columns(['a', 'a']), [{ colId: 'a', selected: false }, ...columns(['a'])], [...columns(['valid']), { colId: 'bad', selected: null }]].map(valueColumns => ({ chartType: 'pie', valueColumns })),
  ])('rejects the complete malformed list atomically: %j', invalid);

  it('rejects inherited sparse slots', () => {
    const valueColumns = new Array(1);
    Object.setPrototypeOf(valueColumns, Object.assign(Object.create(Array.prototype), { 0: { colId: 'a', selected: true } }));
    invalid({ chartType: 'pie', valueColumns });
  });

  it('handles failed input, array and column reads', () => {
    const fail = () => { throw new Error('read failed'); };
    invalid({ get chartType() { return fail(); } });
    invalid({ chartType: 'pie', get valueColumns() { return fail(); } });
    invalid({ chartType: 'pie', valueColumns: [...columns(['valid']), { get colId() { return fail(); }, selected: true }] });
    invalid({ chartType: 'pie', valueColumns: [{ colId: 'a', get selected() { return fail(); } }] });
    invalid({ chartType: 'pie', valueColumns: new Proxy(columns(['a']), { get: fail }) });
    invalid({ chartType: 'pie', valueColumns: new Proxy(columns(['a']), { getOwnPropertyDescriptor: fail }) });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    invalid(revoked.proxy);
  });

  it('returns fresh output without retaining or mutating caller objects', () => {
    const valueColumns = Object.freeze(columns(['a', 'b']).map(Object.freeze));
    const input = Object.freeze({ chartType: 'donut', valueColumns, get extra() { throw new Error('unused'); } });
    const first = resolvePieAssignments(input);
    const second = resolvePieAssignments(input);
    expect(first).toEqual(second);
    expect(first.status).toBe('resolved');
    if (first.status !== 'resolved' || second.status !== 'resolved') throw new Error('expected resolved');
    expect(first.assignments).not.toBe(second.assignments);
    expect(first.assignments[0]).not.toBe(second.assignments[0]);
    expect(first.assignments[0].ring).not.toBe(second.assignments[0].ring);
    expect(first.assignments[0]).not.toBe(valueColumns[0]);
    const mutable = columns(['original']);
    const result = resolvePieAssignments({ chartType: 'pie', valueColumns: mutable });
    mutable[0].colId = 'changed';
    expect(result).toMatchObject({ assignments: [{ colId: 'original' }] });
  });
});
