import type {
  HierarchySnapshot,
  HierarchyCategoryPath,
} from "../compatibility/hierarchyContracts";
import { validateHierarchySnapshot } from "../compatibility/hierarchySnapshot";
import { copySnapshotJson } from "../compatibility/snapshotJson";
import type { HierarchySetupSelection } from "./hierarchyTypes";
import { aggregateHierarchySetupRows } from "./hierarchySetupAggregation";
import {
  checkHierarchySelection,
  freezeHierarchy,
  hierarchyInvalid,
} from "./hierarchySetupSelection";
import type {
  HierarchyPreparedDatum,
  HierarchyPreparedNode,
  HierarchySetupProjection,
} from "./hierarchySetupTypes";
import type { SetupResult } from "./setupTypes";
interface Branch {
  id: string;
  path: HierarchyCategoryPath;
  label: string | null;
  children: Map<string, Branch>;
  datum?: HierarchyPreparedDatum;
}
function buildBranches(
  data: readonly HierarchyPreparedDatum[],
  selection: HierarchySetupSelection,
): Branch {
  const root: Branch = {
    id: JSON.stringify(["hierarchy-root"]),
    path: [],
    label: null,
    children: new Map(),
  };
  for (const datum of data) {
    let parent = root;
    for (let depth = 0; depth < datum.categoryPath.length; depth++) {
      const path = datum.categoryPath.slice(0, depth + 1);
      const id = JSON.stringify(["hierarchy-path", selection.categoryIds, path]);
      let child = parent.children.get(id);
      if (!child) {
        child = { id, path, label: path.at(-1)!, children: new Map() };
        parent.children.set(id, child);
      }
      parent = child;
    }
    if (selection.categoryIds.length === 0) {
      const id = JSON.stringify(["hierarchy-row", datum.representativeRowId]);
      parent = { id, path: [], label: null, children: new Map() };
      root.children.set(id, parent);
    }
    parent.datum = datum;
  }
  return root;
}
function finish(
  branch: Branch,
  sizeId: string | undefined,
): SetupResult<HierarchyPreparedNode> {
  const children: HierarchyPreparedNode[] = [];
  const size =
    sizeId === undefined || !branch.datum || !Object.hasOwn(branch.datum.values, sizeId)
      ? undefined
      : branch.datum.values[sizeId];
  const ownWeight = !branch.datum
    ? 0
    : sizeId === undefined
      ? 1
      : typeof size === "number"
        ? Math.max(size, 0)
        : 0;
  let subtreeWeight = ownWeight;
  for (const child of branch.children.values()) {
    const result = finish(child, sizeId);
    if (result.status === "invalid") return result;
    children.push(result.value);
    subtreeWeight += result.value.subtreeWeight;
    if (!Number.isFinite(subtreeWeight))
      return hierarchyInvalid("Subtree weight overflow", [
        "root",
        ...branch.path.map((v) => (v === null ? "null" : v)),
      ]);
  }
  return {
    status: "ready",
    value: {
      id: branch.id,
      path: branch.path,
      label: branch.label,
      children,
      ...(branch.datum ? { datum: branch.datum } : {}),
      ownWeight,
      subtreeWeight,
    },
  };
}
export function projectHierarchySetup(
  capture: HierarchySnapshot,
  selection: HierarchySetupSelection,
): SetupResult<HierarchySetupProjection> {
  try {
    const validated = validateHierarchySnapshot(capture);
    if (!validated.valid)
      return {
        status: "invalid",
        diagnostics: validated.diagnostics.map((d) => ({
          ...d,
          code: "hierarchy-setup",
          path: ["source", ...d.path],
        })),
      };
    const source = validated.snapshot;
    const chosen = checkHierarchySelection(
      copySnapshotJson(selection) as unknown as HierarchySetupSelection,
      source.columns,
    );
    if (chosen.status === "invalid") return chosen;
    const s = chosen.value;
    if (JSON.stringify(s.categoryIds) !== JSON.stringify(source.categoryColumnIds))
      return hierarchyInvalid("Category changes require recapture", [
        "selection",
        "categoryIds",
      ]);
    if (s.seriesIds.some((id) => !source.selectedColumnIds.includes(id)))
      return hierarchyInvalid("Numeric selection requires captured observations", [
        "selection",
        "seriesIds",
      ]);
    const data = aggregateHierarchySetupRows(source, s);
    if (data.status === "invalid") return data;
    const root = finish(buildBranches(data.value, s), s.seriesIds[0]);
    if (root.status === "invalid") return root;
    const count = s.categoryIds.length > 0 && s.aggFunc === "count";
    const numericColumns = s.seriesIds
      .map((id) => source.columns.find((c) => c.id === id)!)
      .map((c) => (count ? { ...c, unit: "observation-count", scale: 1 } : c));
    return {
      status: "ready",
      value: freezeHierarchy({
        source,
        selection: s,
        assignments: {
          ...(s.seriesIds[0] === undefined ? {} : { sizeId: s.seriesIds[0] }),
          ...(s.seriesIds[1] === undefined ? {} : { colorId: s.seriesIds[1] }),
        },
        numericColumns,
        observationKind: count ? "count" : "raw-observations",
        root: root.value,
      }),
    };
  } catch {
    return hierarchyInvalid("Hierarchy projection could not be inspected safely", [
      "source",
    ]);
  }
}
