import type { WidgetT } from "~/components/types";

const documents = {
  "/api/v1/news/company": {
    kind: "news",
    names: ["symbol", "start_date", "end_date", "page", "limit"],
  },
  "/api/v1/equity/fundamental/transcript": {
    kind: "transcript",
    names: ["symbol", "year", "quarter"],
  },
  "/api/v1/equity/fundamental/filings": {
    kind: "filings",
    names: ["symbol", "start_date", "end_date", "page", "limit"],
  },
} as const;

export function documentDefinition(widget: Pick<WidgetT, "type" | "endpoint">) {
  if (widget.type !== "company_documents") return null;
  const path = widget.endpoint?.url?.split("?")[0];
  const route = Object.keys(documents).find((key) => path?.endsWith(key));
  return route ? documents[route as keyof typeof documents] : null;
}

export function documentChoices(widget: WidgetT): Record<string, string | number> {
  const definition = documentDefinition(widget);
  if (!definition) throw new Error("Unknown company document dataset.");
  const allowed: readonly string[] = ["provider", ...definition.names];
  const defaults = Object.fromEntries(
    (widget.params ?? []).map((p) => [p.paramName, p.value]),
  );
  const values = { ...defaults, ...widget.storage?.params };
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = values[name];
      if (value === undefined || value === null || value === "") return [];
      if (typeof value !== "string" && typeof value !== "number")
        throw new Error(`Invalid ${name}.`);
      return [[name, value]];
    }),
  );
}

export function documentTemplateState(widget: WidgetT) {
  if (widget.type !== "company_documents") return null;
  // A positive allowlist excludes payloads, credentials and future storage fields.
  return { params: documentChoices(widget) };
}
