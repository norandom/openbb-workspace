import {
  keys,
  record,
  validateEdit,
} from "../compatibility/editorBindings/validation";
import {
  fontLeaf,
  legendLeaf,
} from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import type {
  MapRadialEditorIntent,
  RadialAcceptedEditIntent,
  RadialPreparedSelection,
} from "../compatibility/radialContracts";
import type { ResolvedFontStyle } from "./appearanceModel";
import { radialControlTargets } from "./radialAppearance";
function commonPatch(
  selected: RadialPreparedSelection,
  intent: RadialAcceptedEditIntent,
): RuntimeOptions {
  const style = selected.mapping.style;
  validateEdit(intent.panel, intent.edit);
  const context = (value: ResolvedFontStyle) => ({
    predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle },
  });
  switch (intent.panel) {
    case "titles":
      if (intent.edit.caption !== "title" && intent.edit.caption !== "subtitle")
        throw Error("Radial has no axis titles");
      return {
        [intent.edit.caption]: fontLeaf(
          intent.edit.field,
          intent.edit.value,
          context(style.application[intent.edit.caption]),
        ),
      };
    case "legend":
      return {
        legend: legendLeaf(
          intent.edit.field,
          intent.edit.value,
          context(style.application.legend),
        ),
      };
    case "padding":
      return { padding: { [intent.edit.side]: intent.edit.value } };
    case "background":
      return { background: { [intent.edit.field]: intent.edit.value } };
    case "tooltips":
      return { tooltip: { [intent.edit.field]: intent.edit.value } };
    case "series":
      return {
        series: {
          [intent.edit.field]:
            intent.edit.field === "lineDash"
              ? [intent.edit.value]
              : intent.edit.value,
        },
      };
    case "labels":
      return {
        series: {
          label: fontLeaf(
            intent.edit.field,
            intent.edit.value,
            context(style.series.labels),
          ),
        },
      };
    default:
      throw Error("Unsupported Radial control");
  }
}
function polarPatch(
  selected: RadialPreparedSelection,
  intent: Extract<
    RadialAcceptedEditIntent,
    { panel: "radialPolarAxis" | "radialPolarLabels" }
  >,
): RuntimeOptions {
  keys(record(intent.edit), ["field", "value"]);
  const { field, value } = intent.edit;
  const style = selected.mapping.style;
  const targets = radialControlTargets(selected.mapping.family);
  if (JSON.stringify(style.controls.targets) !== JSON.stringify(targets))
    throw Error("Invalid Radial target authority");
  const labels = intent.panel === "radialPolarLabels";
  if (labels) {
    if (field === "orientation") {
      if (
        typeof value !== "string" ||
        !["fixed", "parallel", "perpendicular"].includes(value)
      )
        throw Error("Invalid Radial orientation");
    } else {
      if (!["font", "weight", "size", "color"].includes(field))
        throw Error("Invalid Radial label field");
      validateEdit("labels", intent.edit);
    }
  } else if (
    ["innerRadiusRatio", "paddingInner", "groupPaddingInner"].includes(field)
  ) {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 1
    )
      throw Error("Invalid Radial ratio");
  } else {
    if (field !== "color" && field !== "thickness")
      throw Error("Invalid Radial axis field");
    validateEdit("axis", intent.edit);
  }
  const applicable = labels
    ? targets[field === "orientation" ? "labelOrientation" : "labelTypography"]
    : targets[
        field as
          | "color"
          | "thickness"
          | "innerRadiusRatio"
          | "paddingInner"
          | "groupPaddingInner"
      ];
  const axes = Object.fromEntries(
    applicable.map((key) => {
      const axis =
        style.axes.category.key === key
          ? style.axes.category
          : style.axes.numerical;
      if (axis.key !== key) throw Error("Invalid Radial axis target");
      const leaf = labels
        ? {
            label: fontLeaf(field, value, {
              predefined: {
                fontWeight: axis.labels.fontWeight,
                fontStyle: axis.labels.fontStyle,
              },
            }),
          }
        : field === "color"
          ? { line: { stroke: value } }
          : field === "thickness"
            ? { line: { width: value } }
            : { [field]: value };
      return [key, leaf];
    }),
  );
  return { axes };
}
export const mapRadialEditorIntent: MapRadialEditorIntent = (
  selected,
  intent,
) => {
  try {
    keys(record(intent), ["panel", "edit"]);
    if (
      selected.mapping.family !== "radialColumn" &&
      selected.mapping.family !== "radialBar"
    )
      throw Error("Invalid Radial context");
    if (intent.panel === "radialGroupType") {
      keys(record(intent.edit), ["value"]);
      const value = intent.edit.value;
      if (value !== "grouped" && value !== "stacked" && value !== "normalized")
        throw Error("Invalid Radial Group Type");
      return {
        valid: true,
        value: { kind: "group-type", seriesGroupType: value },
      };
    }
    const leaf =
      intent.panel === "radialPolarAxis" || intent.panel === "radialPolarLabels"
        ? polarPatch(selected, intent)
        : commonPatch(selected, intent);
    return {
      valid: true,
      value: {
        kind: "options",
        eventOptions: {
          [selected.mapping.family === "radialColumn"
            ? "radial-column"
            : "radial-bar"]: leaf,
        },
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid Radial edit",
    };
  }
};
