import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import set from "lodash/set";
import type { ApplicationAxisStructureEvent } from "../compatibility/editorBindings/types";
import { keys, record } from "../compatibility/editorBindings/validation";
import { axisLeaf } from "../compatibility/editorBindings/valueMapping";
import type { ChartModel, RuntimeOptions } from "../compatibility/legacyTypes";
import { saveAxisSettings } from "./axisPersistence";
import type { selectRangeSession } from "./rangeSessionSelection";

export function rangeAxisTransaction(
  selected: ReturnType<typeof selectRangeSession>,
  intent: ApplicationAxisStructureEvent,
) {
  keys(record(intent), ["panel", "axis", "edit"]);
  keys(record(intent.edit), ["field", "value"]);
  if (!selected.selection.eligibility.axes[intent.axis][intent.edit.field])
    throw Error("Range structural field is no longer eligible");
  const axes = cloneDeep(selected.rangeAppearance.axisRuntime.axes);
  const axis = axes.find((candidate) => candidate.id === intent.axis);
  if (!axis) throw Error("Missing Range structural axis");
  const binding = selected.bindings[intent.axis];
  const key = selected.rangeEditor.family === "rangeBar" ? "range-bar" : "range-area";
  const { field, value } = intent.edit;
  let patch: RuntimeOptions;
  let model: ChartModel = selected.baseline.model;
  if (field === "position") {
    if (
      !(axis.direction === "x" ? ["bottom", "top"] : ["left", "right"]).includes(value)
    )
      throw Error("Invalid Range axis position");
    set(axis, "position", value);
    set(axis.options, "position", value);
    patch = { [key]: axisLeaf(binding, { position: value }) };
  } else if (field === "timeFormat") {
    if (axis.type !== "time" || typeof value !== "string")
      throw Error("Expected Range time axis");
    set(axis.options, "label.format", value);
    patch = { [key]: axisLeaf(binding, { label: { format: value } }) };
  } else if (field === "type") {
    if (axis.id !== "category" || !["category", "number", "time"].includes(value))
      throw Error("Invalid Range category type");
    const saved = get(selected.baseline.options, [key, "axes", axis.type], {});
    patch = { [key]: { axes: { [value]: cloneDeep(saved) } } };
    set(axis, "type", value);
    if (value === "time") set(axis.options, "label.format", "%d %B %Y");
    model = { ...model, categoryAxisType: value };
  } else throw Error("Invalid Range structural field");
  const runtime = { axes, categoryAxisType: axes[0].type };
  if (field !== "position") model = saveAxisSettings(model, runtime);
  return { patch, model, runtime };
}
