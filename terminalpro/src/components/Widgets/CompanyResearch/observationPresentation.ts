import { getObservation, type FinancialEvidence } from "~/lib/companyResearch/financialEnvelope";

export function displayEvidence(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "object") return Object.keys(value).length ? JSON.stringify(value) : "Unknown (none supplied)";
  return String(value);
}

export function observationFields(evidence: FinancialEvidence): string[] {
  const declared = evidence.metadata.status === "known" ? Object.keys(evidence.metadata.value.fields) : [];
  return [...new Set([...declared, ...evidence.originalRows.flatMap(Object.keys)])];
}

export function observationLabel(evidence: FinancialEvidence, index: number): string {
  const observation = getObservation(evidence, index, "");
  const ordinal = observation?.sourceOrdinal;
  const date = observation?.statement?.period_end ?? observation?.observationDate;
  return `Original row ${index}${ordinal == null ? "" : ` · Source ordinal ${ordinal}`}${date ? ` · ${date}` : ""}`;
}

export function observationDetails(evidence: FinancialEvidence, index: number, name: string): [string, unknown][] {
  const observation = getObservation(evidence, index, name);
  if (!observation) return [];
  const { field, statement } = observation;
  return [
    ["Original row index", index], ["Source ordinal", observation.sourceOrdinal],
    ["Definition", field?.definition], ["Unit", field?.unit], ["Scale", field?.scale],
    ["Currency", observation.currency], ["Currency reference field", field?.currency_field],
    ["Period basis", field?.period_basis], ["Value origin", field?.value_origin],
    ["Availability", field?.availability], ["Financial basis", field?.financial_basis],
    ["Observation date", observation.observationDate], ["Valuation date", observation.valuationDate],
    ["Publication date", observation.publicationDate], ["Period end", statement?.period_end],
    ["Fiscal year", statement?.fiscal_year], ["Fiscal period", statement?.fiscal_period],
    ["Requested frequency", statement?.requested_frequency], ["Flow coverage", statement?.flow_coverage],
    ["Coverage status", statement?.coverage_status], ["Period start", statement?.period_start],
    ["Duration days", statement?.duration_days], ["Filing date", statement?.filing_date],
    ["Accepted date", statement?.accepted_date], ["Field instant date", statement?.instant_dates[name]],
    ["Restatement status", statement?.restatement_status], ["Source facts", statement?.facts],
    ["Provider conventions", statement?.conventions], ["Field source", field?.source],
    ["Source unit", field?.source_unit], ["Source frequency", field?.source_frequency],
    ["Effective frequency", field?.effective_frequency], ["Seasonal adjustment", field?.seasonal_adjustment],
    ["Requested transform", field?.requested_transform], ["Aggregation", field?.aggregation],
  ];
}
