import type {
  ApplicationAxisId,
  ResolvedFontStyle,
} from "../../application/appearanceModel";
import { isLineFamily } from "../../echarts/cartesianLineTypes";
import { mapApplicationEditorEvent } from "./mapApplicationEditorEvent";
import type {
  ApplicationEditorEvent,
  ApplicationEditorIntent,
  RehydrateApplicationEditorEvent,
  RehydrateEditorEventInput,
} from "./types";
import { binding, keys, record } from "./validation";

function fontContext(font: ResolvedFontStyle) {
  return { predefined: { fontWeight: font.fontWeight, fontStyle: font.fontStyle } };
}
function validateEligibility(
  intent: ApplicationEditorIntent,
  input: RehydrateEditorEventInput,
) {
  const eligible = input.selection.eligibility;
  if (
    ["legend", "shadow", "labels", "markers", "connectMissingData"].includes(
      intent.panel,
    ) &&
    !eligible[intent.panel as "legend"]
  )
    throw new Error("Editor panel is no longer eligible");
  if (
    intent.panel === "series" &&
    isLineFamily(input.selection.family) &&
    intent.edit.field === "fillOpacity"
  )
    throw new Error("Line fill opacity is not an original control");
  if (!("axis" in intent)) return;
  const axis = eligible.axes[intent.axis];
  if (!axis) throw new Error("Invalid selected axis");
  if (
    (intent.panel === "grid" && !axis.grid) ||
    (intent.panel === "ticks" &&
      (!axis.ticks || (intent.edit.field === "length" && !axis.tickLength)))
  )
    throw new Error("Axis panel is no longer eligible");
  if (
    intent.panel === "axisLabels" &&
    intent.edit.field === "autoRotate" &&
    !axis.autoRotate
  )
    throw new Error("Automatic rotation is no longer eligible");
}
function hydrate(
  intent: ApplicationEditorIntent,
  input: RehydrateEditorEventInput,
): ApplicationEditorEvent {
  const appearance = input.selection.style.application;
  if (intent.panel === "titles") {
    const caption = intent.edit.caption;
    const axis: ApplicationAxisId | undefined =
      caption === "horizontalAxisTitle"
        ? input.bindings.category.direction === "x"
          ? "category"
          : "number"
        : caption === "verticalAxisTitle"
          ? input.bindings.category.direction === "y"
            ? "category"
            : "number"
          : undefined;
    const font = axis
      ? appearance.axes[axis].title
      : appearance[caption as "title" | "subtitle"];
    return axis
      ? { ...intent, axisBinding: input.bindings[axis], font: fontContext(font) }
      : { ...intent, font: fontContext(font) };
  }
  if (intent.panel === "legend")
    return { ...intent, font: fontContext(appearance.legend) };
  if (intent.panel === "labels")
    return { ...intent, font: fontContext(appearance.series.labels) };
  if (!("axis" in intent)) return intent;
  const { axis, ...event } = intent;
  const selected = input.bindings[axis];
  binding(selected);
  if (selected.axis !== axis)
    throw new Error("Axis binding does not match the requested axis");
  if (event.panel === "axisLabels")
    return {
      ...event,
      binding: selected,
      font: fontContext(appearance.axes[axis].labels),
      manualRotation: input.manualRotations[axis],
    };
  if (event.panel === "grid") {
    const style = appearance.axes[axis];
    const first = style.gridStyles[0] ?? {
      stroke: style.grid.color,
      lineDash: [style.grid.lineDash],
    };
    return {
      ...event,
      binding: selected,
      firstStyle: { stroke: first.stroke, lineDash: [...first.lineDash] },
    };
  }
  return { ...event, binding: selected };
}
/** Called at the latest-state transaction boundary; render closures carry edits alone. */
export const rehydrateApplicationEditorEvent: RehydrateApplicationEditorEvent = (
  input,
) => {
  try {
    const intent = record(input.intent);
    if (typeof intent.panel !== "string") throw new Error("Invalid editor panel");
    const axisPanel = ["axis", "axisLabels", "grid", "ticks"].includes(
      String(intent.panel),
    );
    keys(
      intent,
      intent.panel === "connectMissingData"
        ? ["panel", "value"]
        : axisPanel
          ? ["panel", "axis", "edit"]
          : ["panel", "edit"],
    );
    if (axisPanel && !["category", "number"].includes(String(intent.axis)))
      throw new Error("Invalid selected axis");
    if (intent.edit !== undefined) record(intent.edit);
    const request = intent as unknown as ApplicationEditorIntent;
    validateEligibility(request, input);
    const event = hydrate(request, input);
    const mapped = mapApplicationEditorEvent(event, input.selection.family);
    return mapped.valid ? { valid: true, value: event } : mapped;
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid editor intent",
    };
  }
};
