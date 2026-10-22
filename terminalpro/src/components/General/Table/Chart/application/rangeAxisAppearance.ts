import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  RangeAxisPolicy,
  RangeNumericAxisPolicy,
} from "../echarts/rangeApplicationTypes";
import type { RangeCategoryKind } from "../echarts/rangeCategoryTypes";
import type { ResolvedApplicationAxis } from "./appearanceModel";
import type {
  ApplicationAxisRuntime,
  ApplicationConcreteAxis,
} from "./axisStructureTypes";
import { at, bool, number, text } from "./effectiveAppearanceValues";

export class RangeAxisUnsupported extends Error {}
export interface RangeResolvedAxis extends Omit<ResolvedApplicationAxis, "labels"> {
  readonly labels: ResolvedApplicationAxis["labels"] & {
    readonly enabled: boolean;
    readonly avoidCollisions: boolean;
    readonly wrapping: "never" | "always" | "hyphenate" | "on-space";
    readonly minSpacing?: number;
  };
}

export function rangeAxisRead(
  layers: readonly RuntimeOptions[],
  axis: ApplicationConcreteAxis,
  path: string,
): unknown {
  let value: unknown;
  const positions = axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
  for (const layer of layers) {
    const root = at(layer, `axes.${axis.type}`);
    const generic = at(root, path);
    if (generic !== undefined) value = generic;
    for (const position of positions) {
      const positioned = at(root, `${position}.${path}`);
      if (positioned !== undefined) {
        value = positioned;
        break;
      }
    }
  }
  return at(axis.options, path) ?? value;
}

export function rangeConcreteAxes(
  layers: RuntimeOptions[],
  runtime: ApplicationAxisRuntime,
  kind: RangeCategoryKind,
  horizontal: boolean,
): ApplicationAxisRuntime {
  const axes = (["category", "number"] as const).map((id): ApplicationConcreteAxis => {
    const direction = (id === "category") !== horizontal ? "x" : "y";
    const previous = runtime.axes.find((a) => a.id === id);
    const type = id === "category" ? kind : "number";
    const defaultPosition = direction === "x" ? "bottom" : "left";
    const options = { ...(previous?.options ?? {}) };
    if (previous?.direction !== direction) delete options.position;
    const candidate: ApplicationConcreteAxis = {
      id,
      type,
      direction,
      position: defaultPosition,
      options,
    };
    const position =
      rangeAxisRead(layers, candidate, "position") ??
      (previous?.direction === direction ? previous.position : defaultPosition);
    const allowed = direction === "x" ? ["bottom", "top"] : ["left", "right"];
    if (!allowed.includes(text(position)))
      throw Error("Range axis position conflicts with direction");
    return { ...candidate, position: position as ApplicationConcreteAxis["position"] };
  });
  return { axes, categoryAxisType: kind };
}

export function rangeAxisPolicy(
  layers: RuntimeOptions[],
  axis: ApplicationConcreteAxis,
): RangeAxisPolicy {
  const read = (path: string) => rangeAxisRead(layers, axis, path);
  const min = read("min");
  const max = read("max");
  const step = read("interval.step");
  const values = read("interval.values");
  if (
    read("interval.every") !== undefined ||
    (step !== null && typeof step === "object" && "every" in step)
  )
    throw new RangeAxisUnsupported(
      "Range interval.every callbacks are outside saved JSON options",
    );
  if (min !== undefined) number(min, Number.NEGATIVE_INFINITY);
  if (max !== undefined) number(max, Number.NEGATIVE_INFINITY);
  if (min !== undefined && max !== undefined && !(Number(min) < Number(max)))
    throw Error("Range explicit axis minimum must be below maximum");
  if (
    values !== undefined &&
    (!Array.isArray(values) ||
      values.some((v) => typeof v !== "number" || !Number.isFinite(v)))
  )
    throw Error("Range interval values must be finite numbers");
  if (
    step !== undefined &&
    axis.type !== "time" &&
    (typeof step !== "number" || !Number.isFinite(step) || step <= 0)
  )
    throw Error("Range numerical interval step must be positive");
  const minSpacing = read("interval.minSpacing");
  const maxSpacing = read("interval.maxSpacing");
  return {
    ...(min === undefined ? {} : { min: number(min, Number.NEGATIVE_INFINITY) }),
    ...(max === undefined ? {} : { max: number(max, Number.NEGATIVE_INFINITY) }),
    nice: bool(read("nice") ?? true),
    reverse: bool(read("reverse") ?? false),
    interval: {
      ...(step === undefined
        ? {}
        : { step: step as RangeAxisPolicy["interval"]["step"] }),
      ...(values === undefined ? {} : { values: [...(values as number[])] }),
      ...(minSpacing === undefined ? {} : { minSpacing: number(minSpacing) }),
      ...(maxSpacing === undefined ? {} : { maxSpacing: number(maxSpacing) }),
    },
  };
}

export function rangeNumericPolicy(policy: RangeAxisPolicy): RangeNumericAxisPolicy {
  const step = policy.interval.step;
  if (step !== undefined && typeof step !== "number")
    throw Error("Expected numeric Range value interval");
  return { ...policy, interval: { ...policy.interval, step } };
}

export function rangeAxisLabelPolicy(
  layers: RuntimeOptions[],
  axis: ApplicationConcreteAxis,
  appearance: ResolvedApplicationAxis,
): RangeResolvedAxis {
  const read = (key: string) => rangeAxisRead(layers, axis, `label.${key}`);
  const wrapping = text(
    read("wrapping") ?? (axis.type === "category" ? "on-space" : "never"),
  );
  if (!["never", "always", "hyphenate", "on-space"].includes(wrapping))
    throw Error("Invalid Range label wrapping");
  const minSpacing = read("minSpacing");
  return {
    ...appearance,
    fields: { ...appearance.fields, timeFormat: text(read("format") ?? "") },
    labels: {
      ...appearance.labels,
      enabled: bool(read("enabled") ?? true),
      avoidCollisions: bool(read("avoidCollisions") ?? true),
      wrapping: wrapping as RangeResolvedAxis["labels"]["wrapping"],
      ...(minSpacing === undefined ? {} : { minSpacing: number(minSpacing) }),
    },
  };
}
