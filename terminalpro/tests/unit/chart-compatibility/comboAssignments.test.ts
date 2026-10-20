import { describe, expect, it } from 'vitest';
import { resolveComboAssignments } from '../../../src/components/General/Table/Chart/compatibility/comboAssignments';

const columns = [
  { colId: 'revenue', selected: true },
  { colId: 'hidden', selected: false },
  { colId: 'income', selected: true },
  { colId: 'eps', selected: true },
];
const resolve = (chartType = 'customCombo', seriesChartTypes?: unknown, valueColumns = columns) =>
  resolveComboAssignments({ chartType, valueColumns, seriesChartTypes });

describe('retained ComboChartModel assignment contract', () => {
  it.each([
    ['columnLineCombo', ['groupedColumn', 'groupedColumn', 'line']],
    ['areaColumnCombo', ['stackedArea', 'stackedArea', 'groupedColumn']],
  ])('splits selected columns at ceil(n/2) for %s', (type, expected) => {
    const result = resolve(type, []);
    expect(result).toMatchObject({ status: 'resolved', chartType: type });
    if (result.status !== 'resolved') throw new Error('invalid fixture');
    expect(result.seriesChartTypes).toEqual(expected.map((chartType, i) => ({
      colId: ['revenue', 'income', 'eps'][i], chartType, secondaryAxis: false,
    })));
  });

  it.each(['columnLineCombo', 'areaColumnCombo'])('keeps first geometry for a single %s series', type => {
    expect(resolve(type, undefined, [columns[0]])).toMatchObject({
      seriesChartTypes: [{ chartType: type === 'columnLineCombo' ? 'groupedColumn' : 'stackedArea' }],
    });
    expect(resolve(type, [], [])).toMatchObject({ status: 'resolved', seriesChartTypes: [] });
  });

  it('projects custom assignments in column order, keeps unselected, and uses first duplicate', () => {
    const result = resolve('columnLineCombo', [
      { colId: 'eps', chartType: 'area', secondaryAxis: true },
      { colId: 'hidden', chartType: 'line' },
      { colId: 'revenue', chartType: 'stackedColumn', secondaryAxis: true },
      { colId: 'revenue', chartType: 'area', secondaryAxis: true },
      { colId: 'extra', chartType: 'line' },
    ]);
    expect(result).toMatchObject({ status: 'resolved', chartType: 'customCombo', seriesChartTypes: [
      { colId: 'revenue', chartType: 'stackedColumn', secondaryAxis: false },
      { colId: 'hidden', chartType: 'line' },
      { colId: 'income', chartType: 'line', secondaryAxis: false },
      { colId: 'eps', chartType: 'area', secondaryAxis: true },
    ] });
    if (result.status !== 'resolved') throw new Error('invalid fixture');
    expect(result.seriesChartTypes[1]).not.toHaveProperty('secondaryAxis');
  });

  it('defaults empty custom assignments and warns only for selected missing columns', () => {
    const result = resolve();
    expect(result).toMatchObject({ status: 'resolved', seriesChartTypes: columns.map(({ colId }) =>
      ({ colId, chartType: 'line', secondaryAxis: false })) });
    expect(result.diagnostics.filter(d => d.code === 'missing-assignment').map(d => d.colId))
      .toEqual(['revenue', 'income', 'eps']);
  });

  it('falls back unsupported strings and coerces only primary-only types', () => {
    const result = resolve('customCombo', [
      { colId: 'revenue', chartType: 'scatter', secondaryAxis: true },
      { colId: 'hidden', chartType: 'stackedArea', secondaryAxis: true },
      { colId: 'income', chartType: 'groupedColumn' },
      { colId: 'eps', chartType: 'line', secondaryAxis: false },
    ]);
    expect(result).toMatchObject({ status: 'resolved', seriesChartTypes: [
      { colId: 'revenue', chartType: 'line', secondaryAxis: true },
      { colId: 'hidden', chartType: 'stackedArea', secondaryAxis: false },
      { colId: 'income', chartType: 'groupedColumn', secondaryAxis: false },
      { colId: 'eps', chartType: 'line', secondaryAxis: false },
    ], diagnostics: expect.arrayContaining([expect.objectContaining({ code: 'unsupported-series-type' })]) });
  });

  it.each([null, [], {}, { chartType: 'line', valueColumns: [] },
    { chartType: 'customCombo', valueColumns: [{ colId: 'x', selected: 1 }] },
    { chartType: 'customCombo', valueColumns: columns, seriesChartTypes: null },
    { chartType: 'areaColumnCombo', valueColumns: columns, seriesChartTypes: {} },
    { chartType: 'customCombo', valueColumns: columns, seriesChartTypes: [null] },
    { chartType: 'customCombo', valueColumns: columns, seriesChartTypes: [{ colId: 'x', chartType: 1 }] },
    { chartType: 'customCombo', valueColumns: columns, seriesChartTypes: [{ colId: 'x', chartType: 'line', secondaryAxis: 1 }] },
  ])('rejects malformed input without partial assignments: %j', input => {
    const result = resolveComboAssignments(input);
    expect(result.status).toBe('invalid');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result).not.toHaveProperty('seriesChartTypes');
  });

  it('contains throwing accessors and proxies', () => {
    for (const input of [Object.defineProperty({}, 'chartType', { get() { throw Error('getter'); } }),
      new Proxy({}, { get() { throw Error('proxy'); } })]) {
      expect(resolveComboAssignments(input).status).toBe('invalid');
    }
    const entry = Object.defineProperty({ colId: 'revenue' }, 'chartType', { get() { throw Error('nested getter'); } });
    expect(resolve('columnLineCombo', [entry]).status).toBe('invalid');
    expect(resolve('customCombo', [entry]).status).toBe('invalid');
  });

  it('keeps duplicate value-column occurrences and omits unknown saved IDs', () => {
    expect(resolve('customCombo', [{ colId: 'unused', chartType: 'area', secondaryAxis: true }],
      [columns[0], columns[0]])).toMatchObject({ status: 'resolved', seriesChartTypes: [
      { colId: 'revenue', chartType: 'line', secondaryAxis: false },
      { colId: 'revenue', chartType: 'line', secondaryAxis: false },
    ] });
  });

  it('splits an even selected count and excludes every unselected builtin column', () => {
    expect(resolve('columnLineCombo', [], columns.slice(0, 3))).toMatchObject({ seriesChartTypes: [
      { colId: 'revenue', chartType: 'groupedColumn', secondaryAxis: false },
      { colId: 'income', chartType: 'line', secondaryAxis: false },
    ] });
    expect(resolve('areaColumnCombo', undefined, [columns[1]])).toMatchObject({ seriesChartTypes: [] });
  });

  it('accepts frozen inputs without mutating saved flags or extra settings', () => {
    const assignment = Object.freeze({ colId: 'revenue', chartType: 'groupedColumn', secondaryAxis: true, unknown: 42 });
    const input = Object.freeze({ chartType: 'customCombo', valueColumns: Object.freeze(columns.map(c => Object.freeze({ ...c }))),
      seriesChartTypes: Object.freeze([assignment]) });
    expect(resolveComboAssignments(input)).toMatchObject({ status: 'resolved' });
    expect(assignment.secondaryAxis).toBe(true);
    expect(assignment.unknown).toBe(42);
  });
});
