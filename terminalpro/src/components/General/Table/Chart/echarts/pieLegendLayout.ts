import { layoutLegend } from "./legendLayout";
import type { PieMappingInput, PieRing } from "./pieTypes";

/** Preserve Pie identities and defaults; grid packing itself has no series-family semantics. */
export function pieLegendLayout(
  input: PieMappingInput,
  rings: readonly PieRing[],
  captionSpace: number,
) {
  return layoutLegend({
    items: rings.flatMap((ring) =>
      ring.data.map((datum) => ({
        key: datum.name,
        label: datum.legendText,
        enabled: datum.enabled,
      })),
    ),
    viewport: input.context.viewport,
    padding: input.style.application.padding,
    captionSpace,
    legend: input.style.application.legend,
    markerStrokeWidth: input.style.application.legendMarkerStrokeWidth,
    layout: input.style.legendLayout,
    idPrefix: "openbb-pie-legend-",
  });
}
