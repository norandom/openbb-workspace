import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import set from "lodash/set";
import type { ChartModel } from "../compatibility/legacyTypes";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";

function categoryType(value: unknown): value is "category" | "number" | "time" {
  return value === "category" || value === "number" || value === "time";
}
type AxisSettings = {
  version: 1;
  categoryType: "category" | "number" | "time";
  timeFormat?: string;
};
export function readAxisSettings(model: ChartModel): AxisSettings | undefined {
  if (!Object.prototype.hasOwnProperty.call(model, "qopenbbAxisSettings")) return;
  const value = model.qopenbbAxisSettings;
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    value.version !== 1 || !categoryType(value.categoryType) ||
    (Object.prototype.hasOwnProperty.call(value, "timeFormat") && typeof value.timeFormat !== "string")
  ) throw new Error("Invalid saved chart qopenbbAxisSettings");
  return {
    version: 1,
    categoryType: value.categoryType,
    ...(value.categoryType === "time" ? { timeFormat: typeof value.timeFormat === "string" ? value.timeFormat : "%d %B %Y" } : {}),
  };
}
/** Only the semantic category preference survives reopening; geometry stays local. */
export function restoreAxisSettings(model: ChartModel, runtime: ApplicationAxisRuntime): ApplicationAxisRuntime {
  const preference = readAxisSettings(model);
  if (!preference) return cloneDeep(runtime);
  const axes = cloneDeep(runtime.axes).map(axis => {
    if (axis.id !== "category") return axis;
    set(axis.options, "label.format", preference.categoryType === "time" ? preference.timeFormat : undefined);
    return { ...axis, type: preference.categoryType };
  });
  return { axes, categoryAxisType: preference.categoryType };
}
export function saveAxisSettings(model: ChartModel, runtime: ApplicationAxisRuntime): ChartModel {
  const axis = runtime.axes.find(axis => axis.id === "category");
  if (!axis || !categoryType(axis.type))
    throw new Error("Invalid semantic category axis");
  const timeFormat = get(axis.options, "label.format", "%d %B %Y");
  if (axis.type === "time" && typeof timeFormat !== "string")
    throw new Error("Invalid time axis format");
  return {
    ...model,
    qopenbbAxisSettings: {
      version: 1,
      categoryType: axis.type,
      ...(axis.type === "time" ? { timeFormat: timeFormat as string } : {}),
    },
  };
}
export function resetAxisSettings(initial: ApplicationAxisRuntime, runtime: ApplicationAxisRuntime): ApplicationAxisRuntime {
  const defaults = initial.axes.find(axis => axis.id === "category");
  if (!defaults) throw new Error("Missing initial category axis");
  const axes = cloneDeep(runtime.axes).map(axis => {
    if (axis.id !== "category") return axis;
    set(axis.options, "label.format", get(defaults.options, "label.format"));
    return { ...axis, type: defaults.type };
  });
  return { axes, categoryAxisType: initial.categoryAxisType };
}
