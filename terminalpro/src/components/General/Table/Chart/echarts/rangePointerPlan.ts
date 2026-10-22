import type {
  ChartPointerPlan,
  ChartPointerPoint,
  ChartPointerMatch,
} from "./chartPointerTypes";
import { rangeDisplayText } from "./rangeBarAdmission";
import { rangeBarCategoryCoordinate } from "./rangeBarBands";
import { rangeBarPreflightCoord } from "./rangeBarGeometry";
import type { RangeBarMappingInput } from "./rangeBarTypes";
import { areaCategoryCoordinate, rangeAreaPreflightCoord } from "./rangeAreaHit";
import type { RangeAreaMappingInput } from "./rangeAreaTypes";
import type { RangeComposed } from "./rangeLiveTypes";
import type { rangeNavigationPolicy } from "./rangeNavigationPolicy";
import { rangeMajorDirection, rangePointerCandidates } from "./rangePointerCandidates";
import { pickRangeChart, rangeExactPickers } from "./rangePointerPick";
import { rangePointerTooltip } from "./rangePointerTooltip";
import type { RangePickCandidate } from "./rangePointerTypes";
import type { RangeApplicationInput } from "./rangeApplicationTypes";
import { navigatorBorder } from "./cartesianNavigatorMask";

function categoryPointer(composed: RangeComposed, match: RangePickCandidate) {
  const mapping = composed.mapping;
  const horizontal =
    "direction" in mapping.style && mapping.style.direction === "horizontal";
  const coord =
    "direction" in mapping.style
      ? rangeBarPreflightCoord(mapping as RangeBarMappingInput, composed.category)
      : rangeAreaPreflightCoord(mapping as RangeAreaMappingInput, composed.category);
  const value =
    "direction" in mapping.style
      ? rangeBarCategoryCoordinate(composed.category, match.groupSlot)
      : areaCategoryCoordinate(composed.category, match.groupSlot);
  if (value === null) return;
  const point = coord(horizontal ? [0, value] : [value, 0]);
  return {
    axis: horizontal ? ("y" as const) : ("x" as const),
    coordinate: point[horizontal ? 1 : 0],
    label: rangeDisplayText(
      mapping.context.display.crosshair(
        composed.projection.groups[match.groupSlot].category,
      ),
    ),
  };
}
export function createRangePointerPlan(
  composed: RangeComposed,
  policy: ReturnType<typeof rangeNavigationPolicy>,
  theme: RangeApplicationInput["theme"],
): ChartPointerPlan {
  const fields = rangePointerCandidates(composed);
  const matches = new Map(fields.flat().map((m) => [m.key, m]));
  const exact =
    "direction" in composed.mapping.style
      ? rangeExactPickers(fields, composed.mapping.context.viewport)
      : undefined;
  const tooltipEnabled = composed.projection.fields.map(
    () => policy.seriesTooltipEnabled,
  );
  return Object.freeze({
    viewport: composed.mapping.context.viewport,
    plot: composed.plot,
    pagination: policy.pagination,
    paint: Object.freeze({
      background: theme.colors.chartBackgroundColor,
      color: theme.colors.textColor,
      borderColor: navigatorBorder(theme),
      fontFamily: composed.appearance.legend.font,
      fontSize: composed.appearance.legend.size,
      fontWeight: composed.appearance.legend.fontWeight ?? 400,
      pointerColor: composed.appearance.axes.category.fields.color,
      pointerLabelBackground: theme.colors.chartBackgroundColor,
      pointerLabelColor: theme.colors.textColor,
    }),
    pick: (point: ChartPointerPoint, intent: "hover" | "click") =>
      pickRangeChart(
        point,
        rangeMajorDirection(composed),
        fields,
        intent === "hover" ? policy.hoverRange : policy.clickRange,
        exact,
        policy.outsideMinor,
      ),
    present: (match: ChartPointerMatch) => {
      const candidate = matches.get(match.key);
      if (!candidate) return;
      return {
        html: rangePointerTooltip(composed, candidate, tooltipEnabled),
        anchor: { x: candidate.x, y: candidate.y },
        categoryPointer: categoryPointer(composed, candidate),
      };
    },
  });
}
