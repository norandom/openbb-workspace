import type { SankeyLink, SankeyRawId, SankeySnapshot } from "./sankeyContracts";
import { sankeyFail } from "./sankeyValidation";

export const sankeyNodeId = (raw: SankeyRawId): string =>
  JSON.stringify([typeof raw, Object.is(raw, -0) ? 0 : raw]);
/** Neumaier compensation retains small positive allocations alongside large amounts. */
export function compensatedSum(
  values: readonly number[],
  rowIds: readonly string[],
): number {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const next = sum + value;
    if (!Number.isFinite(next))
      sankeyFail(
        ["rows"],
        "Allocation sum overflowed finite numeric range",
        rowIds,
        "sankey-overflow",
      );
    correction +=
      Math.abs(sum) >= Math.abs(value) ? sum - next + value : value - next + sum;
    sum = next;
  }
  const total = sum + correction;
  if (!Number.isFinite(total))
    sankeyFail(
      ["rows"],
      "Allocation sum overflowed finite numeric range",
      rowIds,
      "sankey-overflow",
    );
  return total;
}
export function aggregateSankey(snapshot: SankeySnapshot): {
  readonly rawNodes: Map<string, SankeyRawId>;
  readonly links: SankeyLink[];
} {
  const rawNodes = new Map<string, SankeyRawId>();
  const pairs = new Map<
    string,
    { source: string; target: string; values: number[]; rowIds: string[] }
  >();
  for (const row of snapshot.rows) {
    const source = sankeyNodeId(row.source!);
    const target = sankeyNodeId(row.target!);
    if (source === target)
      sankeyFail(
        ["rows"],
        "Self-links are not supported",
        [row.id],
        "sankey-self-link",
      );
    rawNodes.set(source, Object.is(row.source, -0) ? 0 : row.source!);
    rawNodes.set(target, Object.is(row.target, -0) ? 0 : row.target!);
    const id = JSON.stringify([source, target]);
    const pair = pairs.get(id) ?? { source, target, values: [], rowIds: [] };
    pair.values.push(row.value!);
    pair.rowIds.push(row.id);
    pairs.set(id, pair);
  }
  const links = [...pairs].map(([id, pair]) => ({
    id,
    source: pair.source,
    target: pair.target,
    value: compensatedSum(pair.values, pair.rowIds),
    rowIds: pair.rowIds,
  }));
  rejectSankeyCycles(rawNodes, links);
  return { rawNodes, links };
}
function rejectSankeyCycles(
  nodes: Map<string, SankeyRawId>,
  links: readonly SankeyLink[],
): void {
  const adjacency = new Map<string, SankeyLink[]>();
  for (const link of links) {
    const outgoing = adjacency.get(link.source) ?? [];
    outgoing.push(link);
    adjacency.set(link.source, outgoing);
  }
  const done = new Set<string>();
  for (const id of nodes.keys()) {
    if (done.has(id)) continue;
    const stack: { id: string; index: number; via?: SankeyLink }[] = [{ id, index: 0 }];
    const active = new Map<string, number>([[id, 0]]);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = adjacency.get(frame.id)?.[frame.index++];
      if (!edge) {
        done.add(frame.id);
        active.delete(frame.id);
        stack.pop();
        continue;
      }
      const start = active.get(edge.target);
      if (start !== undefined) {
        const rowIds = [
          ...stack.slice(start + 1).flatMap((item) => item.via?.rowIds ?? []),
          ...edge.rowIds,
        ];
        sankeyFail(
          ["rows"],
          "Directed cycles are not supported, including zero-valued links",
          rowIds,
          "sankey-cycle",
        );
      }
      if (!done.has(edge.target)) {
        active.set(edge.target, stack.length);
        stack.push({ id: edge.target, index: 0, via: edge });
      }
    }
  }
}
