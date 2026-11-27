import { z } from "zod";
import { unionErrorMap } from "./schemaErrors";

export const WidgetVizTypes = [
  "advanced_charting",
  "chart",
  "chart-highcharts",
  "chart-vegalite",
  "company_research",
  "company_documents",
  "research_story",
  "events_documents_story",
  "file_viewer",
  "html",
  "iframe",
  "live_grid",
  "markdown",
  "metric",
  "multi_file_viewer",
  "newsfeed",
  "note",
  "rich_note",
  "omni",
  "pdf",
  "table",
  "ssrm_table",
  "ssrm_advanced",
  "youtube",
] as const;

const supportedTypesError = WidgetVizTypes.filter(
  (v) => !["file_viewer", "iframe"].includes(v),
)
  .map((v) => `\`${v}\``)
  .join(", ");

export type WidgetVizType = (typeof WidgetVizTypes)[number] | "custom";

export const widgetTypesSchema = z
  .preprocess(
    (val) => (val === "note" ? "rich_note" : val),
    z
      .enum(
        WidgetVizTypes,
        unionErrorMap(`Supported types are ${supportedTypesError}.`),
      )
      .nullish(),
  )
  .meta({ id: "WidgetType" });

export function isWidgetVizType(type: string): type is WidgetVizType {
  return WidgetVizTypes.includes(type as any);
}
