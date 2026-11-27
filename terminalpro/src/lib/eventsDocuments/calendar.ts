import { getObservation } from "../companyResearch/financialEnvelope";
import { calendarFields, type CalendarField } from "./evidence";
import type { BodyReceipt, BodylessEmpty, KnownEvidence } from "./reader";

export type CalendarMark = {
  generation: number;
  ordinal: number;
  field: CalendarField;
  plotValue: number;
  exactText: string;
};

type ProjectedField = {
  unit: string;
  currency: string | null;
  scale: number | null;
  mark: CalendarMark | null;
};

export type CalendarRow = {
  generation: number;
  ordinal: number;
  symbol: string;
  reportDate: string;
  lastUpdated: string | null;
  fiscalPeriod: string;
  timezone: string;
  confirmationStatus: string;
  fields: Record<CalendarField, ProjectedField>;
};

type CalendarReceipt = BodyReceipt<KnownEvidence, "calendar"> | BodylessEmpty<"calendar">;
export type CalendarProjection = {
  receipt: CalendarReceipt;
  symbol: string;
  marketCount: number;
  limit: number;
  clipped: boolean;
  coverage: "unknown";
  reason: "empty_market" | "no_issuer_match" | "missing_figures" | null;
  rows: CalendarRow[];
};

function projectField(receipt: BodyReceipt<KnownEvidence, "calendar">, ordinal: number, field: CalendarField): ProjectedField {
  const observation = getObservation(receipt.evidence, ordinal, field);
  const value = observation?.value;
  const token = receipt.tokens[ordinal]?.[field];
  const mark = typeof value === "number" && token !== undefined
    ? { generation: receipt.scope.generation, ordinal, field, plotValue: value, exactText: token }
    : null;

  return {
    unit: observation?.field?.unit || (field.startsWith("eps_") ? "currency_per_share" : "currency"),
    currency: observation?.currency || null,
    scale: observation?.field?.scale ?? null,
    mark,
  };
}

function suppliedText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function issuerRows(receipt: BodyReceipt<KnownEvidence, "calendar">, symbol: string): CalendarRow[] {
  return receipt.evidence.originalRows.flatMap((row, ordinal) => {
    if (row.symbol !== symbol || typeof row.report_date !== "string") return [];
    return [{
      generation: receipt.scope.generation,
      ordinal,
      symbol,
      reportDate: row.report_date,
      lastUpdated: suppliedText(row.last_updated) ?? null,
      fiscalPeriod: suppliedText(row.fiscal_period) ?? "unknown",
      timezone: suppliedText(row.source_timezone) ?? "unknown",
      confirmationStatus: suppliedText(row.confirmation_status) ?? "unknown",
      fields: {
        eps_actual: projectField(receipt, ordinal, "eps_actual"),
        eps_consensus: projectField(receipt, ordinal, "eps_consensus"),
        revenue_actual: projectField(receipt, ordinal, "revenue_actual"),
        revenue_consensus: projectField(receipt, ordinal, "revenue_consensus"),
      },
    }];
  });
}

export function projectCalendar(receipt: CalendarReceipt, symbol: string): CalendarProjection {
  const bounds = receipt.httpStatus === 200 ? receipt.evidence.metadata.value.bounds : undefined;
  const marketCount = bounds?.returned_count ?? 0;
  const rows = receipt.httpStatus === 200 ? issuerRows(receipt, symbol) : [];
  let reason: CalendarProjection["reason"] = null;
  if (marketCount === 0) reason = "empty_market";
  else if (rows.length === 0) reason = "no_issuer_match";
  else if (rows.every((row) => calendarFields.every((field) => row.fields[field].mark === null))) reason = "missing_figures";

  return {
    receipt,
    symbol,
    marketCount,
    limit: bounds?.effective_limit ?? 250,
    clipped: bounds?.truncated === true,
    coverage: "unknown",
    reason,
    rows,
  };
}
