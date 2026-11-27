import { z } from "zod";
import type { BodyReceipt, BodylessEmpty, KnownEvidence, ValidateEvidence } from "./reader";
import { normalizeListingSymbol, type Query } from "./selection";

export const calendarFields = ["eps_actual", "eps_consensus", "revenue_actual", "revenue_consensus"] as const;
export type CalendarField = (typeof calendarFields)[number];

const civilDate = z.iso.date().refine((value) => !value.startsWith("0000"));
const timestamp = z.iso.datetime({ offset: true, local: true });
const acceptance = z.string().refine((value) =>
  civilDate.safeParse(value).success || timestamp.safeParse(value.replace(" ", "T")).success);
const supplied = z.string().refine((value) => value.trim().length > 0);
const optionalText = z.string().nullish();
const calendarRow = z.object({
  symbol: supplied, report_date: civilDate, last_updated: civilDate.nullish(),
});
const filing = z.object({
  symbol: supplied, filing_date: civilDate, accepted_date: acceptance.nullish(),
  report_type: optionalText, cik: optionalText, content_status: z.literal("metadata_only"),
});
const transcript = z.object({
  symbol: supplied, year: z.number().int(), quarter: z.enum(["Q1", "Q2", "Q3", "Q4"]),
  date: civilDate, event_datetime: timestamp.nullish(), content: supplied,
  content_status: z.enum(["completeness_unknown", "partial", "full"]),
});
const news = z.object({
  symbol: supplied, date: timestamp, title: supplied, source: optionalText, publisher: optionalText,
  excerpt: optionalText, symbols: optionalText, body: z.null().optional(),
  content_status: z.enum(["partial", "metadata_only"]),
});
const numericToken = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

function matchesToken(value: unknown, token: string | undefined): boolean {
  if (value == null) return token === undefined;
  return typeof value === "number" && Number.isFinite(value) &&
    token !== undefined && numericToken.test(token) && Object.is(value, Number(token));
}

function withinDates(date: string, parameters: { start_date?: string; end_date?: string }): boolean {
  return (parameters.start_date === undefined || date >= parameters.start_date) &&
    (parameters.end_date === undefined || date <= parameters.end_date);
}

function validFiling(row: Record<string, unknown>, query: Query<"filings">): boolean {
  const parsed = filing.safeParse(row);
  return parsed.success && parsed.data.symbol === query.parameters.symbol &&
    withinDates(parsed.data.filing_date, query.parameters);
}

function validTranscript(row: Record<string, unknown>, query: Query<"transcript">): boolean {
  const parsed = transcript.safeParse(row);
  return parsed.success && parsed.data.symbol === query.parameters.symbol &&
    parsed.data.year === query.parameters.year && parsed.data.quarter === `Q${query.parameters.quarter}` &&
    (parsed.data.event_datetime == null || parsed.data.event_datetime.slice(0, 10) === parsed.data.date);
}

function validNews(row: Record<string, unknown>, query: Query<"news">): boolean {
  const parsed = news.safeParse(row);
  if (!parsed.success) return false;
  const data = parsed.data;
  return data.symbol === query.parameters.symbol && (data.symbols == null || data.symbols === data.symbol) &&
    withinDates(data.date.slice(0, 10), query.parameters) &&
    (data.content_status === "partial") === Boolean(data.excerpt?.trim());
}

export const validateEvidence: ValidateEvidence = ({ query }, evidence, tokens) => {
  const rows = evidence.originalRows;
  switch (query.slot) {
    case "calendar":
      return tokens !== undefined && rows.every((row, ordinal) => {
        const parsed = calendarRow.safeParse(row);
        return parsed.success && normalizeListingSymbol(parsed.data.symbol) === query.parameters.symbol &&
          withinDates(parsed.data.report_date, query.parameters) &&
          calendarFields.every((field) => matchesToken(row[field], tokens[ordinal]?.[field]));
      });
    case "filings":
      return rows.every((row) => validFiling(row, query));
    case "transcript":
      return rows.length <= 1 && rows.every((row) => validTranscript(row, query));
    case "news":
      return rows.every((row) => validNews(row, query));
  }
};

type DocumentSlot = "filings" | "transcript" | "news";
type DocumentReceipt<K extends DocumentSlot> = {
  [P in K]: BodyReceipt<KnownEvidence, P> | BodylessEmpty<P>;
}[K];
type Ordinal = { ordinal: number; generation: number };
type Items = {
  filings: z.infer<typeof filing> & Ordinal & { filing_url: string | null; report_url: string | null };
  transcript: z.infer<typeof transcript> & Ordinal;
  news: z.infer<typeof news> & Ordinal & { url: string | null };
};

export type DocumentProjection<K extends DocumentSlot = DocumentSlot> = {
  receipt: DocumentReceipt<K>;
  items: Items[K][];
  coverage: "unknown";
  clipped: boolean;
};

function safeLink(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\/[^/]/i.test(value) || /[\s\x00-\x1f\x7f-\x9f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function projectDocument(slot: DocumentSlot, row: Record<string, unknown>, ordinal: Ordinal): Items[DocumentSlot] {
  switch (slot) {
    case "filings":
      return { ...filing.parse(row), ...ordinal, filing_url: safeLink(row.filing_url), report_url: safeLink(row.report_url) };
    case "transcript":
      return { ...transcript.parse(row), ...ordinal };
    case "news":
      return { ...news.parse(row), ...ordinal, url: safeLink(row.url) };
  }
}

export function projectDocuments<K extends DocumentSlot>(receipt: DocumentReceipt<K>): DocumentProjection<K> {
  const { slot } = receipt.scope.query;
  const items = receipt.httpStatus === 200
    ? receipt.evidence.originalRows.map((row, ordinal) => projectDocument(slot, row, { ordinal, generation: receipt.scope.generation }))
    : [];
  return {
    receipt,
    // The receipt's slot selects a single item schema for the entire slice.
    items: items as Items[K][],
    coverage: "unknown",
    clipped: receipt.httpStatus === 200 && receipt.evidence.metadata.value.bounds.truncated === true,
  };
}
