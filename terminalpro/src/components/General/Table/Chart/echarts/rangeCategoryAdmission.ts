import { copyRangeData, rangeRecord } from "./rangeBarAdmission";
import type { RangeBarProjection } from "./rangeBarTypes";
import type {
  RangeCategoryExtent,
  RangeCategoryInput,
  RangeCategoryKind,
  RangeCategoryStyle,
  RangeCategoryTick,
} from "./rangeCategoryTypes";

export const finiteCategoryNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export const categoryKind = (v: unknown): v is RangeCategoryKind =>
  v === "category" || v === "number" || v === "time";
export function finiteCategoryResult(value: number): number {
  if (!finiteCategoryNumber(value)) throw Error("Nonfinite Range category arithmetic.");
  return value;
}
export function categoryExtent(value: unknown): value is RangeCategoryExtent {
  return (
    Array.isArray(value) &&
    (value.length === 0 ||
      (value.length === 2 &&
        finiteCategoryNumber(value[0]) &&
        finiteCategoryNumber(value[1]) &&
        value[0] <= value[1] &&
        Number.isFinite(value[1] - value[0])))
  );
}
function inputValid(v: unknown, kind: string): v is RangeCategoryInput {
  if (!rangeRecord(v) || !categoryKind(v.kind) || v.kind !== kind) return false;
  if (!categoryExtent(v.fullExtent) || !Array.isArray(v.ticks)) return false;
  if (v.reverse !== undefined && typeof v.reverse !== "boolean") return false;
  const w = v.visibleRange;
  return (
    w === undefined ||
    (Array.isArray(w) &&
      w.length === 2 &&
      finiteCategoryNumber(w[0]) &&
      finiteCategoryNumber(w[1]) &&
      w[0] >= 0 &&
      w[0] < w[1] &&
      w[1] <= 1)
  );
}
export function admitCategoryStyle(
  value: RangeCategoryStyle,
  pointBands = false,
): RangeCategoryStyle {
  const s = copyRangeData(value);
  if (
    !rangeRecord(s) ||
    !rangeRecord(s.categoryAxis) ||
    !rangeRecord(s.categoryAxis.fields) ||
    !categoryKind(s.categoryAxis.fields.type) ||
    !rangeRecord(s.band)
  )
    throw Error("Malformed Range category style.");
  const b = s.band;
  if (
    !finiteCategoryNumber(b.paddingInner) ||
    b.paddingInner < 0 ||
    b.paddingInner > 1 ||
    (!pointBands && b.paddingInner === 1) ||
    !finiteCategoryNumber(b.paddingOuter) ||
    b.paddingOuter < 0 ||
    b.paddingOuter > 0.5 ||
    (s.categoryCoordinates === undefined
      ? s.categoryAxis.fields.type !== "category"
      : !inputValid(s.categoryCoordinates, s.categoryAxis.fields.type))
  )
    throw Error("Expected matching resolved Range category coordinates.");
  return s as unknown as RangeCategoryStyle;
}
export function admitCategoryGroups(
  value: RangeBarProjection,
): RangeBarProjection["groups"] {
  const p = copyRangeData(value);
  if (!rangeRecord(p) || !Array.isArray(p.groups))
    throw Error("Expected dense Range category groups.");
  const seen = new Set<string | number>();
  for (const [slot, group] of p.groups.entries()) {
    if (
      !rangeRecord(group) ||
      group.slot !== slot ||
      !(typeof group.category === "string" || finiteCategoryNumber(group.category)) ||
      seen.has(group.category)
    )
      throw Error("Malformed Range category group identity.");
    seen.add(group.category);
  }
  return p.groups as RangeBarProjection["groups"];
}
export function admitCategoryLabels(value: readonly string[], count: number): void {
  const labels = copyRangeData(value);
  if (
    !Array.isArray(labels) ||
    labels.length !== count ||
    !labels.every((v) => typeof v === "string")
  )
    throw Error("Expected prepared Range category labels.");
}
export function admitCategoryTicks(
  ticks: readonly RangeCategoryTick[],
  extent: RangeCategoryExtent,
): void {
  if (extent.length === 0 && ticks.length !== 0)
    throw Error("Empty Range category domain cannot have ticks.");
  for (const [index, tick] of ticks.entries())
    if (
      !rangeRecord(tick) ||
      !finiteCategoryNumber(tick.coordinate) ||
      typeof tick.label !== "string" ||
      extent.length === 0 ||
      tick.coordinate < extent[0] ||
      tick.coordinate > extent[1] ||
      (index > 0 && tick.coordinate <= ticks[index - 1].coordinate)
    )
      throw Error("Expected ordered Range category ticks inside the visible domain.");
}
