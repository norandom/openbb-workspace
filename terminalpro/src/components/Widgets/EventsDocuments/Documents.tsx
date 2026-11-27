import { useId, useRef } from "react";
import type { EventsDocumentsSnapshot } from "~/lib/eventsDocuments/controller";
import { projectDocuments, type DocumentProjection } from "~/lib/eventsDocuments/evidence";
import type { FailureCode } from "~/lib/eventsDocuments/reader";
import type { Choices } from "~/lib/eventsDocuments/selection";
import CompanyDocuments from "../CompanyDocuments/CompanyDocuments";

type DocumentSlot = "filings" | "transcript" | "news";
type DocumentState = EventsDocumentsSnapshot["slots"][DocumentSlot];
type DocumentBounds = Choices[DocumentSlot];

const titles = {
  filings: "SEC filings",
  transcript: "Earnings-call transcript",
  news: "Company news",
} as const;

const failureMessages: Record<FailureCode, string> = {
  authentication: "FMP authentication failed.",
  entitlement: "FMP entitlement is required.",
  throttling: "FMP rate limit reached.",
  timeout: "FMP request timeout.",
  invalid_parameters: "FMP rejected the query parameters.",
  invalid_response: "FMP response failed upstream validation.",
  upstream: "FMP rejected the request upstream.",
  internal_error: "The data service encountered an internal error.",
  transport: "The data request could not reach the service.",
  unavailable: "The data service is unavailable.",
  invalid_evidence: "FMP evidence failed validation for this query.",
  permission_denied: "Workspace access to this source or session is unavailable.",
  unknown: "The FMP request failed.",
};

function period(bounds: Choices["transcript"]) {
  return `Q${bounds.quarter} ${bounds.year}`;
}

function dateWindow(bounds: Exclude<DocumentBounds, Choices["transcript"]>) {
  const { start_date: start, end_date: end } = bounds;
  if (start === undefined && end === undefined) return "No date filter";
  return `${start || "Start date required"} through ${end || "End date required"} (inclusive)`;
}

function QueryContext({ symbol, bounds }: { symbol: string; bounds: DocumentBounds }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <div>
        <dt className="text-ds-text-caption">Query symbol</dt>
        <dd>{symbol}</dd>
      </div>
      {"quarter" in bounds ? (
        <div>
          <dt className="text-ds-text-caption">Selected period</dt>
          <dd>{period(bounds)}</dd>
        </div>
      ) : (
        <>
          <div>
            <dt className="text-ds-text-caption">Date bounds</dt>
            <dd>{dateWindow(bounds)}</dd>
          </div>
          <div>
            <dt className="text-ds-text-caption">Pagination</dt>
            <dd>Page {bounds.page}, limit {bounds.limit}</dd>
          </div>
        </>
      )}
    </dl>
  );
}

function ReceiptContext({ receipt }: { receipt: DocumentProjection["receipt"] }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      <div>
        <dt className="text-ds-text-caption">Freshness</dt>
        <dd>Current result</dd>
      </div>
      <div>
        <dt className="text-ds-text-caption">Source query</dt>
        <dd className="break-all">{receipt.scope.route}</dd>
      </div>
      <div>
        <dt className="text-ds-text-caption">Retrieval time</dt>
        <dd>{receipt.providerRetrievedAt
          ? <time dateTime={receipt.providerRetrievedAt}>{receipt.providerRetrievedAt}</time>
          : "Provider retrieval time unavailable"}</dd>
      </div>
      {receipt.httpStatus === 204 && (
        <div>
          <dt className="text-ds-text-caption">Local response time</dt>
          <dd><time dateTime={receipt.respondedAt}>{receipt.respondedAt}</time></dd>
        </div>
      )}
    </dl>
  );
}

function ResultStatus({
  state,
  projection,
  bounds,
  retry,
}: {
  state: DocumentState;
  projection?: DocumentProjection;
  bounds: DocumentBounds;
  retry(): void;
}) {
  switch (state.status) {
    case "idle":
      return <p role="status">Waiting to request FMP evidence.</p>;
    case "pending":
      return <p role="status">Retrieving FMP evidence.</p>;
    case "invalid":
      return <p role="alert">{state.issue.field}. {state.issue.bounds}</p>;
    case "failure":
      return (
        <div className="space-y-2">
          <p role="alert">{failureMessages[state.code]}{state.httpStatus && ` HTTP ${state.httpStatus}.`}</p>
          <p>Provider retrieval time unavailable.</p>
          {state.code !== "permission_denied" && (
            <button type="button" className="rounded border border-ds-border px-2 py-1 outline-offset-2 focus-visible:outline" onClick={retry}>
              Retry {titles[state.scope.query.slot]}
            </button>
          )}
        </div>
      );
    case "empty":
      return (
        <p role="status">
          {"quarter" in bounds
            ? `Transcript for ${period(bounds)} is unavailable.`
            : "FMP returned no items for this query."}
        </p>
      );
    case "success":
      return (
        <div role="status">
          <p>{projection?.items.length} items returned.</p>
          {projection?.clipped && <p>The returned result was clipped.</p>}
          {"limit" in bounds && (projection?.items.length ?? 0) >= bounds.limit && (
            <p>Full page returned. Additional coverage is unknown.</p>
          )}
        </div>
      );
  }
}

function DocumentStep({
  kind,
  state,
  choices,
  onRetry,
}: {
  kind: DocumentSlot;
  state: DocumentState;
  choices: Choices;
  onRetry: EventsDocumentsSnapshot["onRetry"];
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const projection = "providerRetrievedAt" in state ? projectDocuments<DocumentSlot>(state) : undefined;
  const scope = "scope" in state ? state.scope : undefined;
  const bounds = scope?.query.parameters ?? choices[kind];
  const query = <QueryContext symbol={scope?.query.parameters.symbol ?? choices.symbol} bounds={bounds} />;
  const source = projection && <ReceiptContext receipt={projection.receipt} />;
  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-3 border-b border-ds-border pb-3 text-sm">
      <h2 id={titleId} ref={heading} tabIndex={-1} className="font-semibold outline-offset-2 focus:outline">
        {titles[kind]} · FMP
      </h2>
      {query}
      {source}
      <ResultStatus state={state} projection={projection} bounds={bounds} retry={() => {
        heading.current?.focus();
        onRetry(kind);
      }} />
      <CompanyDocuments
        kind={kind}
        contextKey={String(scope?.generation ?? state.status)}
        provider="FMP"
        rows={projection?.items ?? []}
        detailContext={(ordinal) => <><p>Source row {ordinal + 1}</p>{query}{source}</>}
        focusFallback={heading}
        emptyMessage={null}
      />
    </section>
  );
}

export default function Documents({ snapshot }: { snapshot: EventsDocumentsSnapshot }) {
  return (
    <>
      <DocumentStep kind="filings" state={snapshot.slots.filings} choices={snapshot.controls.choices} onRetry={snapshot.onRetry} />
      <DocumentStep kind="transcript" state={snapshot.slots.transcript} choices={snapshot.controls.choices} onRetry={snapshot.onRetry} />
      <DocumentStep kind="news" state={snapshot.slots.news} choices={snapshot.controls.choices} onRetry={snapshot.onRetry} />
    </>
  );
}
