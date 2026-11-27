import { normalizeListingSymbol, validateSelection, type Choices, type Slot } from "~/lib/eventsDocuments/selection";
import type { Source } from "~/lib/state/backendConnector";
import type { FinancialQueryPolicy } from "~/lib/utils/financialQuery";
import { EVENTS_DOCUMENTS_BINDINGS } from "~/utils/nativeStorySchema";

const slots = ["calendar", "filings", "transcript", "news"] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
}

function queryBounds(slot: Slot, value: unknown) {
  const raw = record(value);
  if (!raw) return undefined;
  return Object.fromEntries(Object.keys(EVENTS_DOCUMENTS_BINDINGS[slot].queryPolicy.parameters)
    .filter((key) => key !== "symbol" && Object.hasOwn(raw, key))
    .map((key) => [key, raw[key]]));
}

export function storyChoices(value: unknown): Choices | undefined {
  const raw = record(value);
  const charts = record(raw?.charts);
  const symbol = normalizeListingSymbol(raw?.symbol);
  if (raw?.version !== 1 || !symbol ||
      (charts?.eps !== "bar" && charts?.eps !== "point") ||
      (charts.revenue !== "bar" && charts.revenue !== "point")) return;
  const choices = {
    version: 1,
    symbol,
    calendar: queryBounds("calendar", raw.calendar),
    filings: queryBounds("filings", raw.filings),
    transcript: queryBounds("transcript", raw.transcript),
    news: queryBounds("news", raw.news),
    charts: { eps: charts.eps, revenue: charts.revenue },
  } as Choices;
  if (slots.every((slot) => {
    const queryPolicy = EVENTS_DOCUMENTS_BINDINGS[slot].queryPolicy;
    return validateSelection(slot, choices, { ...queryPolicy, required: [...queryPolicy.required] }).valid;
  })) return choices;
}

export function catalogChoices(source: Source): Choices | undefined {
  function values(slot: Slot) {
    const { widgetId, queryPolicy } = EVENTS_DOCUMENTS_BINDINGS[slot];
    const definition = source.widgets?.[widgetId];
    const fields: FinancialQueryPolicy["parameters"] = queryPolicy.parameters;
    return Object.fromEntries((definition?.params ?? []).flatMap(({ paramName, value }) => {
      if (!paramName || !Object.hasOwn(fields, paramName)) return [];
      if (value == null && slot === "news" && (paramName === "start_date" || paramName === "end_date")) {
        return [];
      }
      // Workspace normalizes text-param defaults such as transcript year and quarter to strings.
      const integer = fields[paramName]?.type === "integer" && typeof value === "string" && /^-?\d+$/.test(value);
      return [[paramName, integer ? Number(value) : value]];
    }));
  }
  const filings = values("filings");
  const transcript = values("transcript");
  const news = values("news");
  if (filings.symbol !== transcript.symbol || filings.symbol !== news.symbol) return;
  return storyChoices({
    version: 1, symbol: filings.symbol, charts: { eps: "bar", revenue: "point" },
    calendar: values("calendar"), filings, transcript, news,
  });
}
