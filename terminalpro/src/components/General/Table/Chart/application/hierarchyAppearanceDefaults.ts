import merge from "lodash.merge";
import type { HierarchyAppearanceInput } from "./hierarchyAppearanceTypes";
import { appearanceDefaults } from "./effectiveAppearanceDefaults";

/** Finite defaults from the pinned hierarchy modules, before theme and saved layers. */
export function hierarchyAppearanceDefaults(
  input: HierarchyAppearanceInput,
  outline = { paletteStroke: false, tileStroke: false },
) {
  const label = {
    enabled: true,
    fontFamily: "Verdana, sans-serif",
    fontSize: 12,
    fontWeight: 400,
    color: input.theme.colors.textColor,
    spacing: 4,
    padding: 8,
    cornerRadius: 4,
  };
  const auto = {
    ...label,
    fontSize: 18,
    minimumFontSize: 10,
    spacing: 2,
    color: input.theme.colors.chartBackgroundColor,
    wrapping: "on-space",
    overflowStrategy: "ellipsis",
  };
  const paint = {
    fillOpacity: 1,
    strokeWidth: 0,
    strokeOpacity: 1,
    cornerRadius: 0,
    textAlign: "center",
  };
  return merge({}, appearanceDefaults({ ...input, seriesIds: [] }), {
    padding: { bottom: 10 },
    tooltip: { enabled: true, mode: "single" },
    gradientLegend: {
      enabled: true,
      position: "right",
      reverseOrder: false,
      spacing: 20,
      gradient: { thickness: 16, preferredLength: 200 },
      scale: { label: { ...label, fontSize: 12 } },
    },
    series: {
      fills: [...input.themePalette.fills],
      strokes: [...input.themePalette.strokes],
      undocumentedGroupFills: [...input.themePalette.hierarchyColors],
      undocumentedGroupStrokes: [...input.themePalette.secondHierarchyColors],
      colorRange: [...input.themePalette.colorRange],
      group: {
        ...paint,
        strokeWidth: 1,
        textAlign: "left",
        padding: 4,
        gap: 2,
        interactive: true,
        label,
      },
      tile: {
        ...paint,
        strokeWidth: outline.paletteStroke || outline.tileStroke ? 2 : 0,
        padding: 3,
        gap: 1,
        verticalAlign: "middle",
        label: auto,
      },
      label: { ...auto, fontSize: 14, minimumFontSize: 9, wrapping: "never" },
      fillOpacity: 1,
      strokeWidth: outline.paletteStroke ? 2 : 0,
      strokeOpacity: 1,
      cornerRadius: 0,
      sectorSpacing: 2,
      padding: 3,
    },
  });
}
