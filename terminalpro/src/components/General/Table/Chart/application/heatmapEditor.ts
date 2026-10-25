import {
  displayFont,
  fontWeightKey,
  typographyMetadata,
} from "../compatibility/editorBindings/metadata";
import { keys, record, validateEdit } from "../compatibility/editorBindings/validation";
import { axisLeaf, fontLeaf } from "../compatibility/editorBindings/valueMapping";
import type { RuntimeOptions } from "../compatibility/legacyTypes";
import { number } from "./effectiveAppearanceValues";
import type {
  HeatmapAxisId,
  HeatmapEditIntent,
  HeatmapFont,
  MapHeatmapEditorIntent,
  ProjectHeatmapEditorState,
  ResolvedHeatmapStyle,
} from "./heatmapTypes";
import { freezeHierarchy } from "./hierarchyAppearanceValues";

const bounds = (value: number, minimum: number) => ({
  min: 0 as const,
  max: Math.max(value, minimum),
  step: 1 as const,
});
const typography = <T extends HeatmapFont>(value: T) => ({
  ...value,
  font: displayFont(value.font),
  weight: fontWeightKey(value),
});
const fontContext = (value: HeatmapFont) => ({
  predefined: { fontWeight: value.fontWeight, fontStyle: value.fontStyle },
});
const axisPatch = (axis: HeatmapAxisId, leaf: RuntimeOptions) =>
  axisLeaf({ axis: "category", optionType: "category", direction: axis }, leaf);
function projectAxis(style: ResolvedHeatmapStyle, axis: HeatmapAxisId) {
  const value = style.axes[axis];
  return {
    fields: { value: { ...value.fields } },
    labels: {
      ...typographyMetadata(value.labels),
      value: typography(value.labels),
      showAutoRotate: true,
    },
    ticks: { value: { ...value.ticks }, showLength: true },
  };
}
function projectLegend(style: ResolvedHeatmapStyle) {
  const g = style.gradientLegend;
  return {
    applicable: true,
    value: {
      ...typography(g.label),
      enabled: g.enabled,
      position: g.position,
      reverseOrder: g.reverseOrder,
      spacing: g.spacing,
      ...g.gradient,
    },
    ...typographyMetadata(g.label),
    positions: (["top", "right", "bottom", "left"] as const).map((value) => ({
      value,
      label: value[0].toUpperCase() + value.slice(1),
    })),
    bounds: {
      thickness: bounds(g.gradient.thickness, 40),
      preferredLength: bounds(g.gradient.preferredLength, 300),
      spacing: bounds(g.spacing, 200),
    },
  };
}
export const projectHeatmapEditorState: ProjectHeatmapEditorState = (style) => {
  const a = style.application;
  const captions = {
    title: a.title,
    subtitle: a.subtitle,
    horizontalAxisTitle: style.axes.x.title,
    verticalAxisTitle: style.axes.y.title,
  };
  const value = {
    title: typography(captions.title),
    subtitle: typography(captions.subtitle),
    horizontalAxisTitle: typography(captions.horizontalAxisTitle),
    verticalAxisTitle: typography(captions.verticalAxisTitle),
  };
  const captionOptions = (caption: typeof a.title) => ({
    ...typographyMetadata(caption),
    spacingBounds: bounds(caption.spacing, 100),
  });
  const optionsByCaption = {
    title: captionOptions(captions.title),
    subtitle: captionOptions(captions.subtitle),
    horizontalAxisTitle: captionOptions(captions.horizontalAxisTitle),
    verticalAxisTitle: captionOptions(captions.verticalAxisTitle),
  };
  return freezeHierarchy({
    kind: "heatmap",
    titles: {
      value,
      ...typographyMetadata(...Object.values(captions)),
      spacingBounds: bounds(0, 100),
      optionsByCaption,
    },
    padding: {
      value: { ...a.padding },
      bounds: bounds(Math.max(...Object.values(a.padding)), 200),
    },
    background: { value: { ...a.background } },
    tooltips: {
      value: { ...a.tooltip },
      modes: [
        { value: "single", label: "Single" },
        { value: "shared", label: "Multiple" },
        { value: "compact", label: "Compact" },
      ],
    },
    labels: {
      value: typography(style.series.label),
      ...typographyMetadata(style.series.label),
    },
    series: {
      stroke: style.series.stroke,
      controls: (["strokeWidth", "strokeOpacity"] as const).map((field) => ({
        field,
        label: field === "strokeWidth" ? "Line Width" : "Line Opacity",
        value: style.series[field],
        min: 0 as const,
        max: Math.max(style.series[field], field === "strokeOpacity" ? 1 : 10),
        rangeStep: field === "strokeOpacity" ? 0.05 : 1,
        numberStep: "any" as const,
      })),
    },
    axes: { x: projectAxis(style, "x"), y: projectAxis(style, "y") },
    gradientLegend: projectLegend(style),
  });
};
function gradientPatch(
  style: ResolvedHeatmapStyle,
  edit: Record<string, unknown>,
): RuntimeOptions {
  keys(edit, ["field", "value"]);
  const { field, value } = edit;
  if (typeof field !== "string") throw Error("Invalid gradient field");
  if (["font", "weight", "size", "color"].includes(field)) {
    validateEdit("labels", edit);
    return {
      scale: {
        label: fontLeaf(
          field,
          value as string | number,
          fontContext(style.gradientLegend.label),
        ),
      },
    };
  }
  if (["thickness", "preferredLength"].includes(field))
    return { gradient: { [field]: number(value) } };
  if (field === "reverseOrder") {
    if (typeof value !== "boolean") throw Error("Invalid reverse flag");
  } else validateEdit("legend", edit);
  if (!["enabled", "position", "spacing", "reverseOrder"].includes(field))
    throw Error("Invalid gradient field");
  return { [field]: value as string | number | boolean };
}
function commonPatch(
  style: ResolvedHeatmapStyle,
  intent: HeatmapEditIntent,
): RuntimeOptions {
  const { panel, edit } = intent;
  validateEdit(panel, edit);
  if (panel === "titles") {
    const { caption, field, value } = intent.edit;
    if (caption === "title" || caption === "subtitle")
      return {
        [caption]: fontLeaf(field, value, fontContext(style.application[caption])),
      };
    const axis = caption === "horizontalAxisTitle" ? "x" : "y";
    return axisPatch(axis, {
      title: fontLeaf(field, value, fontContext(style.axes[axis].title)),
    });
  }
  if (panel === "labels")
    return {
      series: {
        label: fontLeaf(
          intent.edit.field,
          intent.edit.value,
          fontContext(style.series.label),
        ),
      },
    };
  if (panel === "padding")
    return { padding: { [intent.edit.side]: intent.edit.value } };
  if (panel === "background" || panel === "tooltips")
    return {
      [panel === "tooltips" ? "tooltip" : panel]: {
        [intent.edit.field]: intent.edit.value,
      },
    };
  throw Error("Unsupported Heatmap control");
}
function patch(style: ResolvedHeatmapStyle, intent: HeatmapEditIntent): RuntimeOptions {
  const { panel, edit } = intent;
  if (panel === "gradientLegend")
    return { gradientLegend: gradientPatch(style, record(edit)) };
  if (panel === "heatmapLine") {
    if (!["stroke", "strokeWidth", "strokeOpacity"].includes(edit.field))
      throw Error("Unsupported Heatmap line field");
    validateEdit(
      edit.field === "stroke" ? "axis" : "series",
      edit.field === "stroke" ? { field: "color", value: edit.value } : edit,
    );
    return { series: { [edit.field]: edit.value } };
  }
  if (panel === "heatmapAxis") {
    validateEdit("axis", edit);
    return axisPatch(intent.axis, {
      line:
        edit.field === "color"
          ? { stroke: edit.value }
          : { enabled: edit.value !== 0, width: edit.value },
    });
  }
  if (panel === "heatmapTicks") {
    validateEdit("ticks", edit);
    return axisPatch(intent.axis, {
      tick: {
        [edit.field === "color"
          ? "stroke"
          : edit.field === "length"
            ? "size"
            : edit.field]: edit.value,
      },
    });
  }
  if (panel === "heatmapAxisLabels") {
    validateEdit("axisLabels", edit);
    const leaf =
      edit.field === "autoRotate"
        ? {
            autoRotate: edit.value,
            rotation: edit.value ? undefined : style.axes[intent.axis].labels.rotation,
          }
        : fontLeaf(
            edit.field === "padding" ? "spacing" : edit.field,
            edit.value,
            fontContext(style.axes[intent.axis].labels),
          );
    return axisPatch(intent.axis, { label: leaf });
  }
  return commonPatch(style, intent);
}
export const mapHeatmapEditorIntent: MapHeatmapEditorIntent = (selected, intent) => {
  try {
    const data = record(intent);
    keys(data, ["panel", "edit"], ["axis"]);
    if (selected.style.family !== "heatmap") throw Error("Invalid Heatmap context");
    if (String(data.panel).startsWith("heatmap") && data.panel !== "heatmapLine") {
      if (data.axis !== "x" && data.axis !== "y") throw Error("Invalid Heatmap axis");
    } else if (data.axis !== undefined) throw Error("Unexpected axis");
    record(data.edit);
    return {
      valid: true,
      value: {
        kind: "options",
        eventOptions: { heatmap: patch(selected.style, intent) },
      },
    };
  } catch {
    return { valid: false, error: "Invalid Heatmap editor intent" };
  }
};
