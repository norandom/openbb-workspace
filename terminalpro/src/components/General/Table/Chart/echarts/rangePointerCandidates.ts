import {
  areaCategoryCoordinate,
  areaPoint,
  rangeAreaPreflightCoord,
} from "./rangeAreaHit";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import { rangeBarCategoryCoordinate } from "./rangeBarBands";
import { rangeBarInterval, rangeBarPreflightCoord } from "./rangeBarGeometry";
import type { RangeBarMappingInput } from "./rangeBarTypes";
import type { RangeComposed } from "./rangeLiveTypes";
import type { RangePickCandidate } from "./rangePointerTypes";

export function rangeMajorDirection(composed: RangeComposed): "x" | "y" {
  return composed.category.kind === "category" &&
    "direction" in composed.mapping.style &&
    composed.mapping.style.direction === "horizontal"
    ? "y"
    : "x";
}
function candidate(
  composed: RangeComposed,
  fieldSlot: number,
  groupSlot: number,
  endpoint: RangePickCandidate["endpoint"],
  x: number,
  y: number,
  size: number,
  rect?: RangePickCandidate["rect"],
): RangePickCandidate {
  const p = composed.plot;
  const xVisible = x >= p.left - 1 && x <= p.left + p.width + 1;
  const yVisible = y >= p.top - 1 && y <= p.top + p.height + 1;
  const major = rangeMajorDirection(composed);
  return Object.freeze({
    key: JSON.stringify([fieldSlot, groupSlot, endpoint]),
    identityKey: JSON.stringify([fieldSlot, groupSlot]),
    fieldSlot,
    groupSlot,
    endpoint,
    x,
    y,
    size,
    majorVisible: major === "x" ? xVisible : yVisible,
    minorVisible: major === "x" ? yVisible : xVisible,
    rawIdentity: Object.freeze({
      category: composed.projection.groups[groupSlot].category,
      sourceRowIds: composed.projection.fields[fieldSlot].data.find(
        (d) => d.groupSlot === groupSlot,
      )!.sourceRowIds,
    }),
    ...(rect ? { rect: Object.freeze(rect) } : {}),
  });
}
function barCandidates(composed: RangeComposed) {
  const input = composed.mapping as RangeBarMappingInput;
  const coord = rangeBarPreflightCoord(input, composed.category);
  const p = composed.plot;
  const plot = { x: p.left, y: p.top, width: p.width, height: p.height };
  return composed.projection.fields.map((field, fieldSlot) =>
    field.enabled
      ? field.data.flatMap((d) => {
          if (
            !d.summary ||
            rangeBarCategoryCoordinate(composed.category, d.groupSlot) === null
          )
            return [];
          const rect = rangeBarInterval(
            input,
            composed.projection,
            d,
            fieldSlot,
            plot,
            coord,
            composed.category,
          );
          return (input.style.direction === "vertical" ? rect.width : rect.height) > 0
            ? [
                candidate(
                  composed,
                  fieldSlot,
                  d.groupSlot,
                  "bar",
                  rect.x + rect.width / 2,
                  rect.y + rect.height / 2,
                  0,
                  rect,
                ),
              ]
            : [];
        })
      : [],
  );
}
function areaCandidates(composed: RangeComposed) {
  const input = composed.mapping as RangeAreaMappingInput;
  const coord = rangeAreaPreflightCoord(input, composed.category);
  return composed.projection.fields.map((field, fieldSlot) =>
    field.enabled
      ? field.data.flatMap((d) => {
          if (
            !d.summary ||
            areaCategoryCoordinate(composed.category, d.groupSlot) === null
          )
            return [];
          return (["high", "low"] as const).map((endpoint) => {
            const p = areaPoint(
              d.groupSlot,
              endpoint === "high" ? d.summary!.max : d.summary!.min,
              input,
              composed.category,
              coord,
            );
            return candidate(
              composed,
              fieldSlot,
              d.groupSlot,
              endpoint,
              p[0],
              p[1],
              input.style.fields[field.descriptor.id].marker.size,
            );
          });
        })
      : [],
  );
}
export function rangePointerCandidates(
  composed: RangeComposed,
): readonly (readonly RangePickCandidate[])[] {
  if (
    !composed.mapping.style.valueScale ||
    composed.plot.width <= 0 ||
    composed.plot.height <= 0
  )
    return composed.projection.fields.map(() => []);
  return Object.freeze(
    ("direction" in composed.mapping.style
      ? barCandidates(composed)
      : areaCandidates(composed)
    ).map((field) => Object.freeze(field)),
  );
}
