import type { AreaFillPoint, AreaPoint } from "./cartesianAreaTypes";

type Value = number | null;
type Edge = readonly [AreaPoint, AreaPoint];
type Run = AreaPoint[] | { skip: number };

/** Recover finite cancellation; reject a stack outside the representable range. */
export function finiteSum(values: readonly Value[]): number {
  const direct = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  if (Number.isFinite(direct)) return direct;
  const scale = values.reduce<number>((m, v) => Math.max(m, Math.abs(v ?? 0)), 0);
  if (scale === 0) return 0;
  const sum = values.reduce<number>((s, v) => s + (v ?? 0) / scale, 0);
  const result = sum * scale;
  if (!Number.isFinite(result)) throw new RangeError("Area stack exceeds the finite numeric range");
  return result;
}

function boundary(stack: readonly Value[], neighbor: readonly Value[] | undefined, index: number) {
  const values: Value[] = [];
  let finite = true;
  for (let j = 0; j <= index; j++) {
    if (stack[j] === null) continue;
    if (neighbor === undefined || neighbor[j] !== null) values.push(stack[j]);
    else finite = false;
  }
  return { value: finiteSum(values), finite };
}

function addSplit(runs: Run[], rowIndex: number, valid: boolean, back: number, forward: number) {
  const current = runs.at(-1);
  if (!valid && Array.isArray(current) && current.length === 1) {
    runs[runs.length - 1] = { skip: 1 };
    return;
  }
  if (Array.isArray(current)) current.push({ rowIndex, value: back });
  else if (current) current.skip++;
  runs.push(valid ? [{ rowIndex, value: forward }] : { skip: 0 });
}

function addPoint(runs: Run[], point: AreaPoint) {
  const current = runs.at(-1);
  if (Array.isArray(current)) current.push(point);
  else {
    if (current) current.skip++;
    runs.push([point]);
  }
}

function edges(runs: readonly Run[]): (Edge | null)[] {
  return runs.flatMap(run => {
    if (!Array.isArray(run)) return new Array<null>(run.skip).fill(null);
    return run.slice(1).map((point, i): Edge => [run[i], point]);
  });
}

function seriesEdges(stacks: readonly (readonly Value[])[], index: number, connect: boolean, independent: boolean) {
  const runs: Run[] = [];
  stacks.forEach((stack, rowIndex) => {
    const value = stack[index];
    if (connect && value === null) return;
    const previous = stacks[rowIndex - 1];
    const next = stacks[rowIndex + 1];
    const back = independent
      ? { value: previous?.[index] != null ? value ?? 0 : 0, finite: !previous || previous[index] !== null }
      : boundary(stack, previous, index);
    const forward = independent
      ? { value: next?.[index] != null ? value ?? 0 : 0, finite: !next || next[index] !== null }
      : boundary(stack, next, index);
    if (!connect && (!back.finite || !forward.finite || value === null || back.value !== forward.value)) {
      addSplit(runs, rowIndex, value !== null, back.value, forward.value);
    } else {
      addPoint(runs, { rowIndex, value: connect ? value ?? 0 : Math.max(back.value, forward.value) });
    }
  });
  return edges(runs);
}

function axisEdges(stacks: readonly (readonly Value[])[], index: number, connect: boolean): Edge[] {
  const points = stacks.flatMap((row, rowIndex) => connect && row[index] === null
    ? [] : [{ rowIndex, value: 0 }]);
  return points.slice(1).map((point, i) => [points[i], point]);
}

/** Source edge slots align phantom lower boundaries even when strokes disappear. */
export function areaSpans(stacks: readonly (readonly Value[])[], index: number, connect: boolean, independent: boolean) {
  const current = seriesEdges(stacks, index, connect, independent);
  const phantom: (Edge | null)[] = current.map(() => null);
  for (let j = independent ? -1 : index - 1; j >= -1; j--) {
    const lower = j === -1 ? axisEdges(stacks, index, connect) : seriesEdges(stacks, j, connect, false);
    phantom.forEach((span, i) => { if (span === null) phantom[i] = lower[i] ?? null; });
  }
  const fills: AreaFillPoint[][] = [];
  current.forEach((span, i) => {
    const lower = phantom[i];
    const upper = span ?? lower;
    if (!lower || !upper) return;
    fills.push(upper.map((point, j) => ({ rowIndex: point.rowIndex, lower: lower[j].value, upper: point.value })));
  });
  return { strokes: current.filter((span): span is Edge => span !== null), fills };
}
