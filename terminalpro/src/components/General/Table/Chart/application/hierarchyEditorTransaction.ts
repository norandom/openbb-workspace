import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import { fontLeaf } from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  MapHierarchyEditorIntent,
  HierarchyEditorContext,
} from "./hierarchyEditorTypes";
import type { HierarchyFont } from "./hierarchyPaintTypes";
import { number } from "./effectiveAppearanceValues";

function fontContext(value: HierarchyFont) {
  return { predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle } };
}
function spacingPatch(
  selected: HierarchyEditorContext,
  edit: Record<string, unknown>,
): RuntimeOptions {
  keys(edit, ["field", "value"]);
  if (selected.style.family !== "treemap")
    throw Error("Treemap spacing is inapplicable");
  const targets = {
    groupPadding: ["group", "padding"],
    groupGap: ["group", "gap"],
    tilePadding: ["tile", "padding"],
    tileGap: ["tile", "gap"],
  } as const;
  if (typeof edit.field !== "string" || !Object.hasOwn(targets, edit.field))
    throw Error("Invalid hierarchy spacing field");
  const [branch, leaf] = targets[edit.field as keyof typeof targets];
  return { series: { [branch]: { [leaf]: number(edit.value) } } };
}
function gradientPatch(
  selected: HierarchyEditorContext,
  edit: Record<string, unknown>,
): RuntimeOptions {
  keys(edit, ["field", "value"]);
  if (selected.assignments.colorId === undefined)
    throw Error("Gradient legend is inapplicable");
  const { field, value } = edit;
  if (typeof field !== "string") throw Error("Invalid gradient field");
  if (["font", "weight", "size", "color"].includes(field)) {
    validateEdit("labels", edit);
    return {
      gradientLegend: {
        scale: {
          label: fontLeaf(
            field,
            value as string | number,
            fontContext(selected.style.gradientLegend.label),
          ),
        },
      },
    };
  }
  if (["thickness", "preferredLength"].includes(field))
    return { gradientLegend: { gradient: { [field]: number(value) } } };
  if (field === "reverseOrder") {
    if (typeof value !== "boolean") throw Error("Invalid gradient reverse flag");
  } else {
    if (!["enabled", "position", "spacing"].includes(field))
      throw Error("Invalid gradient field");
    validateEdit("legend", edit);
  }
  return { gradientLegend: { [field]: value as string | number | boolean } };
}
function commonPatch(
  selected: HierarchyEditorContext,
  panel: string,
  edit: Record<string, unknown>,
): RuntimeOptions {
  if (!["titles", "padding", "background", "tooltips"].includes(panel))
    throw Error("Unsupported hierarchy control");
  validateEdit(panel, edit);
  if (panel === "titles") {
    const caption = edit.caption;
    if (caption !== "title" && caption !== "subtitle")
      throw Error("Hierarchy has no axis titles");
    return {
      [caption]: fontLeaf(
        edit.field as string,
        edit.value as string | number | boolean,
        fontContext(selected.style.application[caption]),
      ),
    };
  }
  const branch = panel === "tooltips" ? "tooltip" : panel;
  return {
    [branch]: {
      [String(panel === "padding" ? edit.side : edit.field)]: edit.value as
        | string
        | number
        | boolean,
    },
  };
}
export const mapHierarchyEditorIntent: MapHierarchyEditorIntent = (
  selected,
  intent,
) => {
  try {
    const data = record(intent);
    keys(data, ["panel", "edit"]);
    const edit = record(data.edit);
    const family = selected.style.family;
    if (family !== "treemap" && family !== "sunburst")
      throw Error("Invalid hierarchy context");
    if (typeof data.panel !== "string") throw Error("Invalid hierarchy panel");
    const patch =
      data.panel === "hierarchySpacing"
        ? spacingPatch(selected, edit)
        : data.panel === "hierarchyGradientLegend"
          ? gradientPatch(selected, edit)
          : commonPatch(selected, data.panel, edit);
    return {
      valid: true,
      value: { kind: "options", eventOptions: { [family]: patch } },
    };
  } catch {
    return { valid: false, error: "Invalid hierarchy editor intent" };
  }
};
