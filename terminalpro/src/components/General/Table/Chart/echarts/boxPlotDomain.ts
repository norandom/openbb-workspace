import type {
  BoxPlotDomain,
  BoxPlotMappingInput,
  BoxPlotProjection,
} from "./boxPlotTypes";
import { niceNumberExtent } from "./cartesianAxes";

export interface BoxValueScale {
  readonly min: number;
  readonly max: number;
  readonly interval?: number;
  readonly constant?: number;
  readonly ticks?: readonly number[];
}
export function boxPlotDomain(
  input: BoxPlotMappingInput,
  projection: BoxPlotProjection,
): BoxPlotDomain {
  const values = projection.fields
    .filter((f) => f.enabled)
    .flatMap((f) =>
      f.data.flatMap((d) => (d.summary ? [d.summary.min, d.summary.max] : [])),
    );
  const bounds = input.style.axes.number;
  if (!values.length && (bounds.min === undefined || bounds.max === undefined))
    return { value: [], empty: true };
  const low =
    bounds.min ?? values.reduce((a, v) => Math.min(a, v), Number.POSITIVE_INFINITY);
  const high =
    bounds.max ?? values.reduce((a, v) => Math.max(a, v), Number.NEGATIVE_INFINITY);
  if (low > high) return { value: [], empty: true };
  if (!Number.isFinite(high - low)) throw Error("Box Plot domain span is nonfinite.");
  return { value: [low, high], empty: false };
}
/** B2 transport is intentionally inactive; B3 must resolve original nice/tick policy. */
export function boxValueScale(
  input: BoxPlotMappingInput,
  domain: BoxPlotDomain,
): BoxValueScale {
  if (domain.empty || domain.value.length === 0) return { min: 0, max: 1, ticks: [] };
  const [low, high] = domain.value;
  if (low === high) return { min: 0, max: 1, constant: low, ticks: [0.5] };
  const pixels =
    input.style.direction === "vertical"
      ? input.context.viewport.height
      : input.context.viewport.width;
  const nice = niceNumberExtent(low, high, pixels);
  const bounds = input.style.axes.number;
  const min = bounds.min ?? nice.min ?? low;
  const max = bounds.max ?? nice.max ?? high;
  if (
    ![min, max, max - min, nice.interval].every(Number.isFinite) ||
    !(min < max) ||
    !(nice.interval! > 0)
  )
    return { min: low, max: high };
  return { min, max, interval: nice.interval };
}
export function boxCoordinate(value: number, scale: BoxValueScale): number {
  return scale.constant === undefined ? value : 0.5;
}
export function preflightBoxDomain(
  projection: BoxPlotProjection,
  scale: BoxValueScale,
): void {
  for (const field of projection.fields)
    for (const datum of field.data) {
      if (!datum.summary) continue;
      for (const raw of Object.values(datum.summary)) {
        const value = boxCoordinate(raw, scale);
        const normalized = (value - scale.min) / (scale.max - scale.min);
        if (!Number.isFinite(normalized))
          throw Error("Box Plot coordinate normalization is nonfinite.");
      }
    }
}
