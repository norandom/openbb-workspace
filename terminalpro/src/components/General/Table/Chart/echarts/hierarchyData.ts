import type { HierarchyPreparedNode } from "../application/hierarchySetupTypes";
import {
  type HierarchyExtent,
  HierarchyPaintAdapterRequired,
  hierarchyColorScale,
  hierarchyOpacity,
} from "./hierarchyColor";
import { hierarchyLabelOptions } from "./hierarchyLabels";
import type { HierarchyMappingInput } from "./hierarchyModel";

export interface HierarchyNativeNode {
  id: string;
  name: string;
  value: number;
  children?: HierarchyNativeNode[];
  itemStyle: Record<string, unknown>;
  label: Record<string, unknown>;
  upperLabel?: Record<string, unknown>;
}
export interface HierarchyNodeMetadata {
  readonly node: HierarchyPreparedNode;
  readonly color?: number;
}
export interface HierarchyData {
  readonly data: HierarchyNativeNode[];
  readonly metadata: ReadonlyMap<string, HierarchyNodeMetadata>;
  readonly extent?: HierarchyExtent;
  readonly paintDomain: HierarchyExtent;
}
function colorValue(input: HierarchyMappingInput, node: HierarchyPreparedNode) {
  const id = input.projection.assignments.colorId;
  const value = id === undefined ? undefined : node.datum?.values[id];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
function fill(value: unknown): string {
  if (typeof value !== "string")
    throw new HierarchyPaintAdapterRequired(
      "Active advanced hierarchy fill requires its reviewed native adapter.",
    );
  return value;
}
function paint(
  input: HierarchyMappingInput,
  node: HierarchyPreparedNode,
  rootIndex: number,
  depth: number,
  scale: ReturnType<typeof hierarchyColorScale>,
) {
  const s = input.style;
  const p = s.palette;
  const leaf = node.children.length === 0;
  const color = colorValue(input, node);
  const fallback = () => fill(p.fills[rootIndex % p.fills.length]);
  const stroke = p.strokes[rootIndex % p.strokes.length];
  if (s.family === "sunburst")
    return {
      color: hierarchyOpacity(
        color === undefined ? fallback() : scale.color(color),
        s.series.fillOpacity,
      ),
      borderColor:
        s.series.sectorSpacing > 0
          ? s.application.background.visible
            ? s.application.background.fill
            : "transparent"
          : hierarchyOpacity(stroke, s.series.strokeOpacity),
      borderWidth: s.series.sectorSpacing + s.series.strokeWidth,
      borderRadius: s.series.cornerRadius,
    };
  const style = leaf ? s.tile : s.group;
  const base = () =>
    style.fill === undefined
      ? leaf
        ? fallback()
        : p.hierarchyColors[depth % p.hierarchyColors.length]
      : fill(style.fill);
  return {
    color: hierarchyOpacity(
      leaf && color !== undefined ? scale.color(color) : base(),
      style.fillOpacity,
    ),
    borderColor: hierarchyOpacity(
      style.stroke ??
        (leaf
          ? stroke
          : p.secondHierarchyColors[depth % p.secondHierarchyColors.length]),
      style.strokeOpacity,
    ),
    borderWidth: leaf ? style.strokeWidth : s.group.padding + style.strokeWidth,
    gapWidth: node.children.every((c) => !c.children.length) ? s.tile.gap : s.group.gap,
    borderRadius: style.cornerRadius,
  };
}
/** H1c owns weights and observations. Native mutation is confined to this detached projection. */
export function prepareHierarchyData(input: HierarchyMappingInput): HierarchyData {
  const metadata = new Map<string, HierarchyNodeMetadata>();
  const observations: number[] = [];
  const inspect = (node: HierarchyPreparedNode) => {
    if (
      !Number.isFinite(node.subtreeWeight) ||
      node.subtreeWeight < 0 ||
      metadata.has(node.id)
    )
      throw Error("Invalid prepared hierarchy.");
    const color = colorValue(input, node);
    metadata.set(node.id, { node, color });
    if (color !== undefined) observations.push(color);
    node.children.forEach(inspect);
  };
  input.projection.root.children.forEach(inspect);
  const extent: HierarchyExtent | undefined = observations.length
    ? observations.reduce<HierarchyExtent>(
        ([min, max], value) => [Math.min(min, value), Math.max(max, value)],
        [observations[0], observations[0]],
      )
    : undefined;
  const paintDomain: HierarchyExtent =
    extent && extent[0] < extent[1] ? extent : [0, 1];
  const scale = hierarchyColorScale(input.style.palette.colorRange, paintDomain);
  const siblings = (
    nodes: readonly HierarchyPreparedNode[],
    rootIndex: number | undefined,
    depth: number,
  ): HierarchyNativeNode[] => {
    const result = nodes.flatMap((node, index) => {
      const identity = rootIndex ?? index;
      if (node.subtreeWeight === 0) return [];
      const children = siblings(node.children, identity, depth + 1);
      const leaf = node.children.length === 0;
      const s = input.style;
      const label =
        s.family === "treemap" ? (leaf ? s.tile.label : s.group.label) : s.series.label;
      return [
        {
          id: node.id,
          name: node.label ?? "",
          value: node.subtreeWeight,
          ...(children.length ? { children } : {}),
          itemStyle: paint(input, node, identity, depth, scale),
          label:
            s.family === "treemap" && !leaf
              ? { show: false }
              : {
                  ...hierarchyLabelOptions(
                    label,
                    node.label ?? "",
                    s.family === "treemap" ? s.tile.padding : s.series.padding,
                  ),
                  ...(s.family === "treemap"
                    ? { align: s.tile.textAlign, verticalAlign: s.tile.verticalAlign }
                    : {}),
                },
          ...(s.family === "treemap" && !leaf
            ? {
                upperLabel: {
                  ...hierarchyLabelOptions(s.group.label, node.label ?? "", 0),
                  align: s.group.textAlign,
                  height: s.group.label.enabled
                    ? s.group.label.size + s.group.label.spacing + s.group.padding
                    : 0,
                },
              }
            : {}),
        },
      ];
    });
    return input.family === "treemap"
      ? result.sort((a, b) => b.value - a.value)
      : result;
  };
  return {
    data: siblings(input.projection.root.children, undefined, 0),
    metadata,
    extent,
    paintDomain,
  };
}
