import { useId } from "react";
import { deriveConclusion, type ConclusionInput } from "~/lib/eventsDocuments/conclusion";
import type { EventsDocumentsSnapshot } from "~/lib/eventsDocuments/controller";
import { calendarFields } from "~/lib/eventsDocuments/evidence";
import type { FailureCode } from "~/lib/eventsDocuments/reader";
import type { Slot } from "~/lib/eventsDocuments/selection";

const titles: Record<Slot, string> = {
  calendar: "Earnings calendar", filings: "SEC filings", transcript: "Earnings-call transcript", news: "Company news",
};
const conditions: Record<ConclusionInput["condition"], string> = {
  available: "Current evidence in the returned slice.",
  empty: "No items returned for the effective query.",
  idle: "Waiting to query.",
  invalid: "The selected query is invalid.",
  pending: "Request pending.",
  failure: "Acquisition failed.",
  empty_market: "The market calendar returned no rows.",
  no_issuer_match: "FMP returned no calendar rows for the selected listing in this window.",
  missing_figures: "Matching rows have no reported figures.",
};
const contentLabels = {
  metadata_only: "Metadata only", partial: "Partial content",
  completeness_unknown: "Completeness unknown", full: "Full content",
};
const failureLabels: Record<FailureCode, string> = {
  authentication: "Authentication failed", entitlement: "Entitlement required",
  throttling: "Rate limit", timeout: "Request timed out", invalid_parameters: "Invalid parameters",
  invalid_response: "Invalid upstream response", upstream: "Upstream failure",
  internal_error: "Data API error", transport: "Data API unreachable", unavailable: "Service unavailable",
  invalid_evidence: "Evidence validation failed", permission_denied: "Workspace access unavailable",
  unknown: "Unknown acquisition failure",
};

function SourceCitation({ source }: { source: NonNullable<ConclusionInput["source"]> }) {
  const { scope, httpStatus, providerRetrievedAt, respondedAt, bounds } = source;
  const { provider: _provider, ...parameters } = scope.query.parameters;
  return (
    <p className="break-words text-ds-text-caption">
      {scope.route} · Receipt {scope.generation}
      {httpStatus && ` · HTTP ${httpStatus}`}
      {" · "}{Object.entries(parameters).map(([name, value]) => `${name} ${value}`).join(" · ")}
      {providerRetrievedAt && ` · Retrieved ${providerRetrievedAt}`}
      {providerRetrievedAt === null && " · Provider retrieval time unavailable"}
      {respondedAt && ` · Local response time ${respondedAt}`}
      {bounds && ` · ${bounds.returned_count} returned`}
    </p>
  );
}

function InputSummary({ input, slot }: { input: ConclusionInput; slot: Slot }) {
  const { condition, source, issue, failure, clipped, coverage, calendarRows, documents } = input;
  const fullPage = (slot === "filings" || slot === "news") &&
    source?.bounds?.returned_count === source?.bounds?.effective_limit && source?.bounds?.effective_limit != null;
  return (
    <li className="space-y-1">
      <h3 className="body-sm-semibold">{titles[slot]} · FMP</h3>
      <p>{conditions[condition]}{issue && ` ${issue.field}. ${issue.bounds}`}{failure && ` ${failureLabels[failure.code]}.`}</p>
      {source && <SourceCitation source={source} />}
      {clipped && <p>Clipping observed.</p>}
      {fullPage && <p>Full page returned.</p>}
      {coverage && <p>Coverage beyond the returned slice is unknown.</p>}
      {calendarRows.length > 0 && <ul className="list-disc pl-5">
        {calendarRows.map((row) => (
          <li key={row.ordinal}>Report date {row.reportDate} · Listing row {row.ordinal + 1} · Receipt {row.generation}
            <ul className="pl-4">
              {calendarFields.map((field) => (
                <li key={field}>{field} · {row.fields[field].mark?.exactText ?? "Missing"}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>}
      {documents.length > 0 && <ul className="list-disc pl-5">
        {documents.map((item) => (
          <li key={item.ordinal} className="break-words">
            Source row {item.ordinal + 1} · Receipt {item.generation} · {item.field} · {item.date}
            {item.title && ` · ${item.title}`} · {contentLabels[item.contentStatus]}
          </li>
        ))}
      </ul>}
    </li>
  );
}

export function Conclusion({ snapshot }: { snapshot: EventsDocumentsSnapshot }) {
  const id = useId();
  const { status, usableCount, inputs } = deriveConclusion(snapshot);
  return (
    <section
      aria-labelledby={id}
      tabIndex={0}
      className="space-y-3 outline-offset-2 focus-visible:outline focus-visible:outline-2"
    >
      <h2 id={id} className="body-md-semibold">Conclusion</h2>
      <p role="status" aria-live="polite" aria-atomic="true">
        <strong>{status}</strong> · {usableCount} of 4 FMP inputs have usable evidence.
      </p>
      <p>Results share the selected company context. Each input covers its own effective query.</p>
      <ul className="space-y-3">
        {(Object.keys(titles) as Slot[]).map((slot) => <InputSummary key={slot} input={inputs[slot]} slot={slot} />)}
      </ul>
    </section>
  );
}
