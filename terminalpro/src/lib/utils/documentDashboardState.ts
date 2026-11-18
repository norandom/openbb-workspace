import { z } from "zod";
import type { WidgetT } from "~/components/types";
import { documentChoices, documentDefinition } from "./documentTemplateState";
import { financialWidgetPolicy } from "./financialQuery";

const name = z.enum([
  "symbol",
  "provider",
  "start_date",
  "end_date",
  "page",
  "limit",
  "year",
  "quarter",
]);
const policySchema = z.object({
  maxRequests: z.literal(1),
  required: z.array(name),
  parameters: z.partialRecord(
    name,
    z.object({
      type: z.enum(["string", "integer"]).optional(),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      maxLength: z.number().optional(),
    }),
  ),
  dateWindow: z
    .object({
      mode: z.enum(["required_pair", "optional_pair", "independent_optional"]),
      maxInclusiveDays: z.number().positive().optional(),
    })
    .nullish(),
});

function saveDocument(widget: WidgetT) {
  if (widget.type !== "company_documents") return widget;
  const definition = documentDefinition(widget);
  if (!definition) throw new Error("Cannot save an unknown document dataset.");
  const choices = documentChoices(widget);
  const url = new URL(widget.endpoint.url);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  const identity = Object.fromEntries(
    [
      "id",
      "widgetId",
      "type",
      "sourceId",
      "sourceName",
      "connectionType",
      "external",
      "isSharedWidget",
      "disableRetrievalForCopilot",
      "exportable",
      "name",
      "description",
      "innerTab",
      "groupId",
      "isMinimized",
      "originalH",
      "showTitle",
    ].flatMap((key) => {
      const value = widget[key];
      return ["string", "number", "boolean"].includes(typeof value)
        ? [[key, value]]
        : [];
    }),
  );
  return {
    ...identity,
    endpoint: { url: url.toString(), method: "GET" },
    params: (widget.params ?? [])
      .filter((param) =>
        ["provider", ...definition.names].includes(param.paramName as never),
      )
      .map((param) => ({
        paramName: param.paramName,
        type: param.type,
        label: param.label,
        show: param.show,
        value: choices[param.paramName] ?? null,
      })),
    data: {
      financialQueryPolicy: policySchema.parse(
        financialWidgetPolicy(widget).queryPolicy,
      ),
    },
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    storage: { params: choices },
  };
}

// The ordinary dashboard API and template export share the same query allowlist.
export function documentDashboardState(items: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(items).map(([key, item]) => {
      if (item === "DELETE" || !Array.isArray(item?.data?.widgets)) return [key, item];
      return [
        key,
        {
          ...item,
          data: { ...item.data, widgets: item.data.widgets.map(saveDocument) },
        },
      ];
    }),
  );
}
