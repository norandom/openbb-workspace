import type { FinancialQueryPolicy } from "../utils/financialQuery";

export type Slot = "calendar" | "filings" | "transcript" | "news";
export type ChartDisplay = "bar" | "point";
export type ChartMeasure = "eps" | "revenue";

type Dates = { start_date: string; end_date: string };
type Page = { page: number; limit: number };

export type Choices = {
  version: 1;
  symbol: string;
  calendar: Dates;
  filings: Dates & Page;
  transcript: { year: number; quarter: number };
  news: Page & (Dates | { start_date?: never; end_date?: never });
  charts: Record<ChartMeasure, ChartDisplay>;
};

type RequestParameters = {
  calendar: Choices["calendar"] & { symbol: string };
  filings: Choices["filings"] & { symbol: string };
  transcript: Choices["transcript"] & { symbol: string };
  news: Choices["news"] & { symbol: string };
};

export type Query<K extends Slot = Slot> = {
  [P in K]: { slot: P; parameters: RequestParameters[P] & { provider: "fmp" } };
}[K];

export type SelectionIssue = { field: string; bounds: string };

export type SelectionResult<K extends Slot = Slot> =
  | { valid: true; query: Query<K> }
  | { valid: false; issue: SelectionIssue };

const slotFields: Record<Slot, readonly string[]> = {
  calendar: ["start_date", "end_date"],
  filings: ["start_date", "end_date", "page", "limit"],
  transcript: ["year", "quarter"],
  news: ["start_date", "end_date", "page", "limit"],
};

// The transcript endpoint has the strictest listing grammar among the company routes.
export function normalizeListingSymbol(symbol: unknown): string | undefined {
  if (typeof symbol === "string" && /^[A-Za-z0-9^][A-Za-z0-9.^=-]{0,49}$/.test(symbol)) {
    return symbol.toUpperCase();
  }
}

export function validateListingSymbol(symbol: unknown): SelectionIssue | undefined {
  if (normalizeListingSymbol(symbol) === undefined) {
    return {
      field: "symbol",
      bounds: "One listing symbol, 1–50 characters, with no spaces or commas.",
    };
  }
}

function civilDate(value: unknown): number | undefined {
  if (
    typeof value !== "string" ||
    value.length !== 10 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) ||
    value.startsWith("0000")
  ) return;
  const timestamp = Date.parse(value);
  if (Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value) {
    return timestamp;
  }
}

function validateDates(
  start: unknown,
  end: unknown,
  maxInclusiveDays: number,
  optional: boolean,
): SelectionIssue | undefined {
  if (start === undefined && end === undefined && optional) return;
  const range = `Choose both dates as an ordered window of 1–${maxInclusiveDays} days inclusive.`;
  const startTime = civilDate(start);
  const endTime = civilDate(end);
  if (start !== undefined && startTime === undefined) {
    return { field: "start_date", bounds: `Use a valid calendar date (YYYY-MM-DD). ${range}` };
  }
  if (end !== undefined && endTime === undefined) {
    return { field: "end_date", bounds: `Use a valid calendar date (YYYY-MM-DD). ${range}` };
  }
  if (startTime === undefined) return { field: "start_date", bounds: range };
  if (endTime === undefined) return { field: "end_date", bounds: range };

  const inclusiveDays = (endTime - startTime) / 86_400_000 + 1;
  if (inclusiveDays < 1 || inclusiveDays > maxInclusiveDays) {
    return { field: "end_date", bounds: range };
  }
}

function validateBounds(
  slot: Slot,
  bounds: Record<string, unknown>,
  policy: FinancialQueryPolicy,
): SelectionIssue | undefined {
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) {
    return { field: slot, bounds: "Supply the fields for this input." };
  }
  const fields = slotFields[slot];
  const extra = Object.keys(bounds).find((field) => !fields.includes(field));
  if (extra !== undefined) {
    return { field: extra, bounds: `Use only ${fields.join(", ")} for this input.` };
  }
  for (const field of fields) {
    const schema = policy.parameters[field];
    if (!schema) return { field, bounds: "The installed query policy must specify this field." };
    if (field === "start_date" || field === "end_date") continue;
    const { minimum, maximum } = schema;
    const value = bounds[field];
    if (schema.type !== "integer" || minimum === undefined || maximum === undefined) {
      return { field, bounds: "The installed query policy must specify an integer range." };
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
      return { field, bounds: `Integer ${minimum}–${maximum}.` };
    }
  }
  if (slot === "transcript") return;
  const rule = policy.dateWindow;
  const optional = slot === "news";
  const mode = optional ? "optional_pair" : "required_pair";
  const maxInclusiveDays = rule?.maxInclusiveDays;
  if (
    rule?.mode !== mode ||
    maxInclusiveDays === undefined ||
    !Number.isSafeInteger(maxInclusiveDays) ||
    maxInclusiveDays < 1
  ) {
    return { field: "start_date", bounds: "The installed query policy must specify a paired date window." };
  }
  return validateDates(bounds.start_date, bounds.end_date, maxInclusiveDays, optional);
}

export function validateSelection<K extends Slot>(
  slot: K,
  choices: Choices,
  policy: FinancialQueryPolicy,
): SelectionResult<K> {
  const symbolIssue = validateListingSymbol(choices.symbol);
  const bounds: Record<string, unknown> = choices[slot];
  const issue = symbolIssue ?? validateBounds(slot, bounds, policy);
  if (issue) return { valid: false, issue };

  const fields = slotFields[slot].filter((field) => bounds[field] !== undefined);
  const parameters = {
    ...Object.fromEntries(fields.map((field) => [field, bounds[field]])),
    symbol: normalizeListingSymbol(choices.symbol),
    provider: "fmp",
  };
  return { valid: true, query: { slot, parameters } as Query<K> };
}
