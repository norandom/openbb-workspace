import isEqual from "lodash/isEqual";
import { z } from "zod";
import {
  isResearchStoryWidget,
  RESEARCH_STORY_ID,
  RESEARCH_STORY_NAME,
} from "~/lib/modeling/storyState";

export const EVENTS_DOCUMENTS_STORY_ID = "events_documents_story";

const nativeStoryFields = {
  category: z.literal("Research"),
  // Draft 7 requires at least one schema in tuple-form items.
  params: z.array(z.never()).max(0),
  gridData: z.strictObject({ w: z.literal(40), h: z.literal(24) }),
};

export const researchStoryDeclaration = z.strictObject({
  ...nativeStoryFields,
  widgetId: z.literal(RESEARCH_STORY_ID),
  type: z.literal(RESEARCH_STORY_ID),
  name: z.literal(RESEARCH_STORY_NAME),
  description: z.literal("Compare proxy price returns, realized volatility and the change in real yields."),
});

export const eventsDocumentsDeclaration = z.strictObject({
  ...nativeStoryFields,
  widgetId: z.literal(EVENTS_DOCUMENTS_STORY_ID),
  type: z.literal(EVENTS_DOCUMENTS_STORY_ID),
  name: z.literal("Events and Documents"),
  description: z.literal(
    "What earnings figures does FMP report for this company, and which filings, transcript or news items can I inspect?",
  ),
});

type WidgetIdentity = { widgetId?: unknown; type?: unknown; defaultViz?: unknown };

export function isEventsDocumentsWidget(widget?: WidgetIdentity | null) {
  return widget?.widgetId === EVENTS_DOCUMENTS_STORY_ID ||
    widget?.type === EVENTS_DOCUMENTS_STORY_ID ||
    widget?.defaultViz === EVENTS_DOCUMENTS_STORY_ID;
}

export function hasNativeStoryIdentity(widget?: WidgetIdentity | null) {
  return Boolean(widget && (isResearchStoryWidget(widget) ||
    widget.defaultViz === RESEARCH_STORY_ID || isEventsDocumentsWidget(widget)));
}

export function hasMatchingNativeStoryKey(key: string, widget: WidgetIdentity) {
  return (key === RESEARCH_STORY_ID) === isResearchStoryWidget(widget) &&
    (key === EVENTS_DOCUMENTS_STORY_ID) === isEventsDocumentsWidget(widget);
}

const queryPolicy = {
  schemaVersion: 1,
  maxRequests: 1,
  preserveSourceOrder: true,
  rejectExplicitNull: true,
  completeness: "unknown",
} as const;

function dateWindow(mode: "required_pair" | "optional_pair", maxInclusiveDays: number) {
  return {
    mode,
    maxInclusiveDays,
    application: "upstream_window",
    startParameter: "start_date",
    endParameter: "end_date",
    inclusive: true,
    ordered: true,
  };
}

const date = { format: "date", type: "string" };
const dates = {
  start_date: { ...date, title: "Start Date" },
  end_date: { ...date, title: "End Date" },
};
const optionalDate: { anyOf: { type: string; format?: string }[]; default: null } = {
  anyOf: [date, { type: "null" }],
  default: null,
};
const symbol = { type: "string", title: "Symbol", maxLength: 50, minLength: 1 };
const page = { type: "integer", title: "Page", default: 0, minimum: 0, maximum: 99 };

function limit(defaultValue: number, maximum: number) {
  return { type: "integer", title: "Limit", default: defaultValue, minimum: 1, maximum };
}

// Match the Batch B declarations used to bind requests to the installed data source.
export const EVENTS_DOCUMENTS_BINDINGS = {
  calendar: {
    widgetId: "equity_calendar_earnings_fmp_obb",
    type: "table",
    dataset: "fmp_calendar_earnings",
    contractDataset: "CalendarEarnings",
    route: "/data/api/v1/equity/calendar/earnings",
    metadataDataset: "equity/calendar/earnings",
    sourceEndpoint: "earnings-calendar",
    scope: "market",
    queryPolicy: {
      ...queryPolicy,
      dateWindow: dateWindow("required_pair", 7),
      maxSymbols: 0,
      maxReturnedRows: 250,
      parameters: dates,
      required: ["start_date", "end_date"],
      returnedRowsLimitParameter: null,
    },
  },
  filings: {
    widgetId: "equity_fundamental_filings_fmp_obb",
    type: "company_documents",
    dataset: "fmp_company_filings",
    contractDataset: "CompanyFilings",
    route: "/data/api/v1/equity/fundamental/filings",
    metadataDataset: "equity/fundamental/filings",
    sourceEndpoint: "sec-filings-search/symbol",
    scope: "listing",
    queryPolicy: {
      ...queryPolicy,
      dateWindow: dateWindow("required_pair", 365),
      maxSymbols: 1,
      maxReturnedRows: 100,
      parameters: { ...dates, symbol, page, limit: limit(20, 100) },
      required: ["symbol", "start_date", "end_date"],
      returnedRowsLimitParameter: "limit",
    },
  },
  transcript: {
    widgetId: "equity_fundamental_transcript_fmp_obb",
    type: "company_documents",
    dataset: "fmp_earnings_call_transcript",
    contractDataset: "EarningsCallTranscript",
    route: "/data/api/v1/equity/fundamental/transcript",
    metadataDataset: "equity/fundamental/transcript",
    sourceEndpoint: "earning-call-transcript",
    scope: "listing",
    queryPolicy: {
      ...queryPolicy,
      dateWindow: null,
      maxSymbols: 1,
      maxReturnedRows: 1,
      parameters: {
        symbol,
        year: { type: "integer", title: "Year", minimum: 1900, maximum: 2100 },
        quarter: { type: "integer", title: "Quarter", minimum: 1, maximum: 4 },
      },
      required: ["symbol", "year", "quarter"],
      returnedRowsLimitParameter: null,
    },
  },
  news: {
    widgetId: "news_company_fmp_obb",
    type: "company_documents",
    dataset: "fmp_company_news",
    contractDataset: "CompanyNews",
    route: "/data/api/v1/news/company",
    metadataDataset: "news/company",
    sourceEndpoint: "news/stock",
    scope: "listing",
    queryPolicy: {
      ...queryPolicy,
      dateWindow: dateWindow("optional_pair", 31),
      maxSymbols: 1,
      maxReturnedRows: 50,
      parameters: {
        start_date: { ...optionalDate, title: "Start Date" },
        end_date: { ...optionalDate, title: "End Date" },
        symbol,
        page,
        limit: limit(10, 50),
      },
      required: ["symbol"],
      returnedRowsLimitParameter: "limit",
    },
  },
} as const;

const bindingShape = z.object({
  widgetId: z.string(),
  type: z.string(),
  endpoint: z.string(),
  defaultViz: z.never().optional(),
  fileEndpoint: z.never().optional(),
  wsEndpoint: z.never().optional(),
  source: z.tuple([z.literal("FMP")]),
  data: z.object({
    dataKey: z.literal("results"),
    scope: z.string(),
    financialQueryPolicy: z.unknown().optional(),
  }),
  queryPolicy: z.unknown(),
  financialContract: z.object({
    dataset: z.string(),
    schema_version: z.literal(1),
    provider_policy: z.literal("explicit"),
    providers: z.tuple([z.literal("fmp")]),
    variants: z.strictObject({ fmp: z.record(z.string(), z.unknown()) }),
  }),
});

type Binding = (typeof EVENTS_DOCUMENTS_BINDINGS)[keyof typeof EVENTS_DOCUMENTS_BINDINGS];

function matchesBinding(value: unknown, expected: Binding) {
  const binding = bindingShape.safeParse(value);
  if (!binding.success) return false;
  const widget = binding.data;
  return widget.widgetId === expected.widgetId &&
    widget.type === expected.type &&
    widget.endpoint === expected.route.slice("/data".length) &&
    widget.data.scope === expected.scope &&
    widget.financialContract.dataset === expected.contractDataset &&
    isEqual(widget.queryPolicy, expected.queryPolicy) &&
    (widget.data.financialQueryPolicy === undefined ||
      isEqual(widget.data.financialQueryPolicy, expected.queryPolicy));
}

export function hasEventsDocumentsBindings(widgets: Record<string, unknown>) {
  return Object.values(EVENTS_DOCUMENTS_BINDINGS).every(
    (binding) => matchesBinding(widgets[binding.widgetId], binding),
  );
}

export function hasEventsDocumentsCatalog(widgets?: Record<string, unknown> | null) {
  return Boolean(widgets && eventsDocumentsDeclaration.safeParse(
    widgets[EVENTS_DOCUMENTS_STORY_ID],
  ).success && hasEventsDocumentsBindings(widgets));
}

// Parse raw bindings before widget defaults can fill or override declaration fields.
export function validateNativeStoryBindings(catalog: unknown, context: z.core.$RefinementCtx) {
  if (catalog && typeof catalog === "object" &&
      Object.hasOwn(catalog, EVENTS_DOCUMENTS_STORY_ID) &&
      !hasEventsDocumentsBindings(catalog as Record<string, unknown>)) {
    context.addIssue({
      code: "custom",
      path: [EVENTS_DOCUMENTS_STORY_ID],
      message: "The events_documents_story requires four valid FMP source bindings.",
    });
  }
  return catalog;
}
