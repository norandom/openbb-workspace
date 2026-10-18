import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import set from "lodash/set";
import { isHorizontalBarFamily } from "../echarts/cartesianTypes";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { keys, record } from "../compatibility/editorBindings/validation";
import type {
  ApplicationConcreteAxis,
  AxisStructureInput,
  AxisStructureTransition,
  TransitionApplicationAxisStructure,
} from "./axisStructureTypes";

const types = ["number", "category", "time", "grouped-category"];
function selectedAxis(input: AxisStructureInput): ApplicationConcreteAxis {
  if (!["groupedColumn", "stackedColumn", "line"].includes(input.family) && !isHorizontalBarFamily(input.family))
    throw new Error("Invalid Cartesian family");
  const event = record(input.event);
  keys(event, ["panel", "axis", "edit"]);
  if (event.panel !== "axisStructure") throw new Error("Invalid structural event");
  const edit = record(event.edit);
  keys(edit, ["field", "value"]);
  if (!["category", "number"].includes(String(event.axis)))
    throw new Error("Invalid axis identity");
  const axes = input.runtime.axes;
  if (axes.length !== 2 || new Set(axes.map((axis) => axis.id)).size !== 2)
    throw new Error("Expected two concrete axes");
  for (const axis of axes) {
    if (!types.includes(axis.type) || !["x", "y"].includes(axis.direction))
      throw new Error("Invalid concrete axis type or direction");
    if (!positions(axis).includes(axis.position))
      throw new Error("Invalid concrete axis position");
    record(axis.options);
  }
  const axis = axes.find((value) => value.id === event.axis);
  if (!axis) throw new Error("Missing concrete axis");
  return axis;
}
function positions(axis: ApplicationConcreteAxis): string[] {
  return axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
}
function transfer(
  input: AxisStructureInput,
  axis: ApplicationConcreteAxis,
): RuntimeOptions {
  const family = input.family === "line" ? "line" : "bar";
  const source = get(input.savedOptions, [family, "axes", axis.type]);
  const patch: RuntimeOptions = {};
  // Original crosshair suffixes follow crosshair, never the axis position.
  const expressions = [
    "crosshair",
    ...(axis.direction === "x"
      ? ["crosshair.top", "crosshair.bottom"]
      : ["crosshair.left", "crosshair.right"]),
  ];
  for (const expression of expressions) {
    const value = get(source, expression);
    if (value === undefined) continue;
    for (const type of types)
      set(patch, `${family}.axes.${type}.${expression}`, cloneDeep(value));
  }
  const retained = positions(axis)
    .map((position) => get(source, position))
    .find((value) => value !== undefined);
  if (retained !== undefined)
    for (const position of positions(axis))
      set(
        patch,
        [family, "axes", input.event.edit.value, position],
        cloneDeep(retained),
      );
  return patch;
}
function transition(input: AxisStructureInput): AxisStructureTransition {
  const selected = selectedAxis(input);
  const axes = cloneDeep(input.runtime.axes) as ApplicationConcreteAxis[];
  const index = input.runtime.axes.indexOf(selected);
  const axis = axes[index];
  const { field, value } = input.event.edit;
  let eventOptions: RuntimeOptions = {};
  let categoryAxisType = input.runtime.categoryAxisType;
  if (field === "position") {
    if (!positions(axis).includes(value)) throw new Error("Invalid axis position");
    axes[index] = { ...axis, position: value as ApplicationConcreteAxis["position"] };
  } else if (field === "timeFormat") {
    if (axis.type !== "time" || typeof value !== "string")
      throw new Error("Time format requires a time axis");
    set(axis.options, "label.format", value);
  } else if (field === "type") {
    if (
      axis.id !== "category" ||
      index !== 0 ||
      !["category", "number", "time"].includes(value)
    )
      throw new Error("Category type requires the original first category axis");
    if (value === axis.type) return { runtime: input.runtime, eventOptions };
    eventOptions = transfer(input, axis);
    categoryAxisType = value as ApplicationConcreteAxis["type"];
    axes[index] = { ...axis, type: categoryAxisType };
    if (value === "time" || axis.type === "time")
      set(axis.options, "label.format", value === "time" ? "%d %B %Y" : undefined);
  } else throw new Error("Invalid structural field");
  return { runtime: { axes, categoryAxisType }, eventOptions };
}
export const transitionApplicationAxisStructure: TransitionApplicationAxisStructure = (
  input,
) => {
  try {
    return { valid: true, value: transition(input) };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid axis transition",
    };
  }
};
