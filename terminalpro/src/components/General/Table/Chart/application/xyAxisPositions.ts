import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { axisLeaf } from "../compatibility/editorBindings/valueMapping";
import type { ApplicationAxisStructureEvent } from "../compatibility/editorBindings/types";
import type { ApplicationAxisRuntime } from "./axisStructureTypes";
import { at } from "./effectiveAppearanceValues";

export function xyPositionPatch(event: ApplicationAxisStructureEvent): RuntimeOptions {
  const direction = event.axis === "category" ? "x" : "y";
  const positions = direction === "x" ? ["bottom", "top"] : ["left", "right"];
  if (!["category", "number"].includes(event.axis) ||
      event.edit.field !== "position" || !positions.includes(event.edit.value))
    throw Error("Invalid numeric XY axis position");
  return axisLeaf({ axis: event.axis, direction, optionType: "number" },
    { position: event.edit.value });
}
export function resolveXyAxisPositions(
  runtime: ApplicationAxisRuntime, layers: readonly RuntimeOptions[],
): ApplicationAxisRuntime {
  return { ...runtime, axes: runtime.axes.map((axis) => {
    const positions = axis.direction === "x" ? ["bottom", "top"] : ["left", "right"];
    let position: unknown = axis.position;
    for (const layer of layers) {
      const inherited = at(layer, "axes.number.position");
      const concrete = positions.map((p) => at(layer, `axes.number.${p}.position`))
        .find((p) => p !== undefined);
      position = concrete ?? inherited ?? position;
    }
    if (typeof position !== "string" || !positions.includes(position))
      throw Error("Invalid saved numeric XY axis position");
    return { ...axis, position: position as typeof axis.position };
  }) };
}
