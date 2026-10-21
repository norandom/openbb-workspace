import merge from "lodash.merge";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type { ResolvedApplicationAppearance } from "./appearanceModel";
import { at, bool, caption, child, font, number, text, type ReadAppearance } from "./effectiveAppearanceValues";

function resolveLegend(
  read: ReadAppearance,
): ResolvedApplicationAppearance["legend"] {
  return {
    ...font(child(read, "item.label")),
    enabled: bool(read("enabled")),
    position: text(read("position")),
    spacing: number(read("spacing")),
    markerSize: number(read("item.marker.size")),
    markerStroke: number(read("item.marker.strokeWidth")),
    itemSpacing: number(read("item.marker.padding")),
    horizontalSpacing: number(read("item.paddingX")),
    verticalSpacing: number(read("item.paddingY")),
  };
}

export function resolveAppearanceChrome(
  sourceLayers: RuntimeOptions[],
  palette: ResolvedApplicationAppearance["palette"],
  inheritedLegendStroke: number,
): Omit<ResolvedApplicationAppearance, "axes" | "series"> {
  const effective = merge({}, ...sourceLayers);
  const read: ReadAppearance = (path) => at(effective, path);
  let title = caption(child(read, "title"));
  const subtitle = caption(child(read, "subtitle"));
  if (subtitle.enabled && sourceLayers.slice(1).every(layer => at(layer, "title.spacing") === undefined))
    title = { ...title, spacing: 10 };
  const legend = resolveLegend(child(read, "legend"));
  const explicitStroke = sourceLayers.slice(1).some(layer => at(layer, "legend.item.marker.strokeWidth") !== undefined);
  return {
    title, subtitle, legend,
    legendMarkerStrokeWidth: explicitStroke ? legend.markerStroke : Math.min(2, inheritedLegendStroke),
    padding: { top: number(read("padding.top")), right: number(read("padding.right")),
      bottom: number(read("padding.bottom")), left: number(read("padding.left")) },
    background: { visible: bool(read("background.visible")), fill: text(read("background.fill")) },
    tooltip: { enabled: bool(read("tooltip.enabled")), mode: text(read("tooltip.mode")) },
    palette: { fills: [...palette.fills], strokes: [...palette.strokes] },
  };
}
