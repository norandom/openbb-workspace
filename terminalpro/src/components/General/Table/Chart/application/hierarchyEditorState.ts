import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
import type { ProjectHierarchyEditorState } from "./hierarchyEditorTypes";
import { freezeHierarchy } from "./hierarchyAppearanceValues";

const bounds = (value: number, minimum: number) => ({
  min: 0 as const,
  max: Math.max(value, minimum),
  step: 1 as const,
});
const choice = <T extends string>(value: T) => ({
  value,
  label: value[0].toUpperCase() + value.slice(1),
});
const typography = <
  T extends {
    font: string;
    fontWeight: string | number | undefined;
    fontStyle: string | undefined;
  },
>(
  value: T,
) => ({ ...value, font: displayFont(value.font), weight: fontWeightKey(value) });

export const projectHierarchyEditorState: ProjectHierarchyEditorState = (
  style,
  assignments,
) => {
  const a = style.application;
  const g = style.gradientLegend;
  const captionOptions = (value: typeof a.title) => ({
    ...typographyMetadata(value),
    spacingBounds: bounds(value.spacing, 100),
  });
  const common = {
    kind: "hierarchy" as const,
    titles: {
      value: { title: typography(a.title), subtitle: typography(a.subtitle) },
      availableCaptions: ["title", "subtitle"] as const,
      ...typographyMetadata(a.title, a.subtitle),
      spacingBounds: bounds(0, 100),
      optionsByCaption: {
        title: captionOptions(a.title),
        subtitle: captionOptions(a.subtitle),
      },
    },
    gradientLegend: {
      applicable: assignments.colorId !== undefined,
      value: {
        ...typography(g.label),
        enabled: g.enabled,
        position: g.position,
        reverseOrder: g.reverseOrder,
        spacing: g.spacing,
        ...g.gradient,
      },
      ...typographyMetadata(g.label),
      positions: (["top", "right", "bottom", "left"] as const).map(choice),
      bounds: {
        thickness: bounds(g.gradient.thickness, 40),
        preferredLength: bounds(g.gradient.preferredLength, 300),
        spacing: bounds(g.spacing, 200),
      },
    },
    padding: {
      value: { ...a.padding },
      bounds: bounds(Math.max(...Object.values(a.padding)), 200),
    },
    background: { value: { ...a.background } },
    tooltips: {
      value: { ...style.tooltip },
      modes: [
        { value: "single", label: "Single" },
        { value: "shared", label: "Multiple" },
        { value: "compact", label: "Compact" },
      ],
    },
  };
  if (style.family === "sunburst")
    return freezeHierarchy({ ...common, family: "sunburst" });
  const spacing = (
    [
      ["groupPadding", "Group Padding", style.group.padding],
      ["groupGap", "Group Spacing", style.group.gap],
      ["tilePadding", "Tile Padding", style.tile.padding],
      ["tileGap", "Tile Spacing", style.tile.gap],
    ] as const
  ).map(([field, label, value]) => ({
    field,
    label,
    value,
    bounds: bounds(value, 10),
  }));
  return freezeHierarchy({ ...common, family: "treemap", spacing });
};
