import { describe, expect, it } from 'vitest';
import { resolveXyAssignments, type XyChartType } from '../../../src/components/General/Table/Chart/compatibility/xyAssignments';

const columns = (ids: string[]) => ids.map(colId => ({ colId, selected: true }));
const resolve = (chartType: XyChartType, ids: string[], paired?: boolean) =>
  resolveXyAssignments({ chartType, valueColumns: columns(ids), paired });
const assignment = (xColId: string, yColId: string, sizeColId?: string) =>
  ({ xColId, yColId, ...(sizeColId === undefined ? {} : { sizeColId }) });

describe('XY column assignments', () => {
  it.each([
    ['scatter', true, ['a', 'b', 'c', 'd', 'tail'], [assignment('a', 'b'), assignment('c', 'd')]],
    ['scatter', false, ['a', 'b', 'c', 'd'], [assignment('a', 'b'), assignment('a', 'c'), assignment('a', 'd')]],
    ['bubble', true, ['a', 'b', 'c', 'd', 'e', 'f', 'tail'], [assignment('a', 'b', 'c'), assignment('d', 'e', 'f')]],
    ['bubble', false, ['a', 'b', 'c', 'd', 'e', 'tail'], [assignment('a', 'b', 'c'), assignment('a', 'd', 'e')]],
  ] as const)('groups %s with paired=%s', (chartType, paired, ids, assignments) => {
    expect(resolve(chartType, [...ids], paired)).toEqual({ status: 'resolved', chartType, paired, assignments, diagnostics: [] });
  });

  it.each(['scatter', 'bubble'] as const)('defaults %s pairing when absent or undefined', chartType => {
    const valueColumns = columns(['x', 'y', 'size', 'next']);
    expect(resolveXyAssignments({ chartType, valueColumns })).toEqual(resolve(chartType, ['x', 'y', 'size', 'next'], true));
    expect(resolve(chartType, ['x', 'y', 'size', 'next'], undefined)).toEqual(resolve(chartType, ['x', 'y', 'size', 'next'], true));
  });

  it.each([
    ['scatter', []], ['scatter', ['x']], ['bubble', []], ['bubble', ['x']], ['bubble', ['x', 'y']],
  ] as const)('resolves incomplete %s groups as empty', (chartType, ids) => {
    for (const paired of [true, false]) {
      expect(resolve(chartType, [...ids], paired)).toEqual({ status: 'resolved', chartType, paired, assignments: [], diagnostics: [] });
    }
  });

  it('filters before grouping and preserves changed supplied order', () => {
    const valueColumns = [
      { colId: 'ignored', selected: false }, ...columns(['z']),
      { colId: 'ignored-too', selected: false }, ...columns(['', 'x', 'y']),
    ];
    expect(resolveXyAssignments({ chartType: 'scatter', valueColumns })).toMatchObject({ assignments: [assignment('z', ''), assignment('x', 'y')] });
    expect(resolve('bubble', ['size', 'y', 'x'])).toMatchObject({ assignments: [assignment('size', 'y', 'x')] });
  });

  it.each([
    null, undefined, false, [], 'scatter', {},
    { chartType: 'line', valueColumns: [] },
    { chartType: 'scatter', valueColumns: {} },
    { chartType: 'scatter', valueColumns: [null] },
    { chartType: 'scatter', valueColumns: [[]] },
    { chartType: 'scatter', valueColumns: [{ colId: 1, selected: true }] },
    { chartType: 'scatter', valueColumns: [{ colId: 'x', selected: 1 }] },
    { chartType: 'scatter', valueColumns: new Array(2) },
    ...[null, 0, 'true', {}].map(paired => ({ chartType: 'scatter', valueColumns: [], paired })),
    { chartType: 'bubble', valueColumns: columns(['x', 'y', 'x']) },
    { chartType: 'scatter', valueColumns: [{ colId: 'x', selected: false }, ...columns(['x'])] },
  ])('rejects malformed input atomically: %j', input => {
    const result = resolveXyAssignments(input);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'invalid-input', message: expect.any(String) })]);
    expect(result).not.toHaveProperty('assignments');
  });

  it('does not mutate frozen inputs or read unknown properties', () => {
    const valueColumns = Object.freeze(columns(['x', 'y', 's']).map(column => Object.freeze(column)));
    const input = Object.freeze({ chartType: 'bubble', valueColumns, get extra() { throw new Error('unused'); } });
    const first = resolveXyAssignments(input);
    expect(first).toEqual({ status: 'resolved', chartType: 'bubble', paired: true, assignments: [assignment('x', 'y', 's')], diagnostics: [] });
    const second = resolveXyAssignments(input);
    if (first.status === 'resolved' && second.status === 'resolved') {
      expect(first.assignments[0]).not.toBe(second.assignments[0]);
    }
    expect(valueColumns.map(column => column.colId)).toEqual(['x', 'y', 's']);
  });

  it('contains throwing getters and proxies without partial assignments', () => {
    const fail = () => { throw new Error('unreadable'); };
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    for (const input of [
      { get chartType() { return fail(); } },
      { chartType: 'scatter', get valueColumns() { return fail(); } },
      { chartType: 'scatter', valueColumns: [], get paired() { return fail(); } },
      { chartType: 'scatter', valueColumns: [...columns(['x', 'y']), { get colId() { return fail(); }, selected: true }] },
      { chartType: 'scatter', valueColumns: [{ colId: 'x', get selected() { return fail(); } }] },
      new Proxy({}, { get: fail }), revoked.proxy,
      { chartType: 'scatter', valueColumns: new Proxy([], { get: fail }) },
    ]) {
      expect(resolveXyAssignments(input)).toEqual({ status: 'invalid', diagnostics: [expect.objectContaining({ code: 'invalid-input' })] });
    }
  });
});
