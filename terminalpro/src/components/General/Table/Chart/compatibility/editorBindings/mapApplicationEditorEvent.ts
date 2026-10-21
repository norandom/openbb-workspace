import { isPieChartFamily } from "../../application/pieSessionTypes";
import { isXyChartFamily } from "../../application/xySessionTypes";
import { isAreaFamily } from "../../echarts/cartesianAreaTypes";
import { isCartesianFamily } from "../../echarts/cartesianTypes";
import type { RuntimeOptions } from "../legacyTypes";
import type { ApplicationEditorEvent, MapApplicationEditorEvent } from "./types";
import { axisLeaf, fontLeaf, legendLeaf } from "./valueMapping";
import {
  binding,
  fontContext,
  keys,
  record,
  styleContext,
  validateEdit,
} from "./validation";

function validateEvent(input: unknown) {
  const event = record(input);
  if (typeof event.panel !== "string") throw new Error("Invalid editor panel");
  if (event.panel === "connectMissingData") {
    keys(event, ["panel", "value"]);
    if (typeof event.value !== "boolean") throw new Error("Invalid connection value");
    return;
  }
  const required = ["panel", "edit"];
  if (["titles", "legend", "labels", "axisLabels"].includes(String(event.panel)))
    required.push("font");
  if (["axis", "axisLabels", "grid", "ticks"].includes(String(event.panel)))
    required.push("binding");
  if (event.panel === "axisLabels") required.push("manualRotation");
  if (event.panel === "grid") required.push("firstStyle");
  keys(event, required, event.panel === "titles" ? ["axisBinding"] : []);
  validateEdit(String(event.panel), event.edit);
  if (Object.hasOwn(event, "font")) fontContext(event.font);
  if (Object.hasOwn(event, "binding")) binding(event.binding);
  if (Object.hasOwn(event, "axisBinding")) binding(event.axisBinding);
  if (event.panel === "grid") styleContext(event.firstStyle);
  if (
    event.panel === "axisLabels" &&
    event.manualRotation !== undefined &&
    (typeof event.manualRotation !== "number" || !Number.isFinite(event.manualRotation))
  )
    throw new Error("Invalid retained manual rotation");
}
function captionPatch(event: Extract<ApplicationEditorEvent, { panel: "titles" }>) {
  const { caption, field, value } = event.edit;
  const leaf = fontLeaf(field, value, event.font);
  if (caption === "title" || caption === "subtitle") return { [caption]: leaf };
  if (!event.axisBinding) throw new Error("Axis caption requires current axis binding");
  return axisLeaf(event.axisBinding, { title: leaf });
}
function axisPatch(
  event: Extract<ApplicationEditorEvent, { binding: unknown }>,
): RuntimeOptions {
  const { field, value } = event.edit;
  if (event.panel === "axis")
    return axisLeaf(event.binding, {
      line:
        field === "color" ? { stroke: value } : { enabled: value !== 0, width: value },
    });
  if (event.panel === "ticks")
    return axisLeaf(event.binding, {
      tick: {
        [field === "color" ? "stroke" : field === "length" ? "size" : field]: value,
      },
    });
  if (event.panel === "grid") {
    const leaf =
      field === "color" || field === "lineDash"
        ? {
            style: [
              {
                stroke: field === "color" ? value : event.firstStyle.stroke,
                lineDash:
                  field === "lineDash" ? [value] : [...event.firstStyle.lineDash],
              },
            ],
          }
        : { [field === "thickness" ? "width" : field]: value };
    return axisLeaf(event.binding, { gridLine: leaf } as RuntimeOptions);
  }
  const leaf =
    field === "autoRotate"
      ? { autoRotate: value, rotation: value ? undefined : event.manualRotation }
      : fontLeaf(field === "padding" ? "spacing" : field, value, event.font);
  return axisLeaf(event.binding, { label: leaf });
}
function eventPatch(event: ApplicationEditorEvent): RuntimeOptions {
  switch (event.panel) {
    case "titles":
      return captionPatch(event);
    case "legend":
      return { legend: legendLeaf(event.edit.field, event.edit.value, event.font) };
    case "padding":
      return { padding: { [event.edit.side]: event.edit.value } };
    case "background":
      return { background: { [event.edit.field]: event.edit.value } };
    case "tooltips":
      return { tooltip: { [event.edit.field]: event.edit.value } };
    case "series":
      return {
        series: {
          [event.edit.field]:
            event.edit.field === "lineDash" ? [event.edit.value] : event.edit.value,
        },
      };
    case "shadow":
      return { series: { shadow: { [event.edit.field]: event.edit.value } } };
    case "labels":
      return {
        series: { label: fontLeaf(event.edit.field, event.edit.value, event.font) },
      };
    case "markers":
      return { series: { marker: { [event.edit.field]: event.edit.value } } };
    case "connectMissingData":
      return { series: { connectMissingData: event.value } };
    default:
      return axisPatch(event);
  }
}
export const mapApplicationEditorEvent: MapApplicationEditorEvent = (event, family) => {
  try {
    if (!isCartesianFamily(family) && !isAreaFamily(family) && !isXyChartFamily(family) && family !== "histogram" && !isPieChartFamily(family))
      throw new Error("Unsupported chart family");
    validateEvent(event);
    if (isPieChartFamily(family) && (!["titles", "legend", "padding", "background", "tooltips", "series", "shadow"].includes(event.panel) ||
      (event.panel === "titles" && !["title", "subtitle"].includes(event.edit.caption)) ||
      (event.panel === "series" && event.edit.field === "lineDash"))) throw Error("Unsupported pie control");
    return {
      valid: true,
      value: {
        [isPieChartFamily(family) ? family === "pie" ? "pie" : "donut" : isXyChartFamily(family) || family === "histogram" ? family : isAreaFamily(family) ? "area" : family === "line" ? "line" : "bar"]:
          eventPatch(event),
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid editor event",
    };
  }
};
