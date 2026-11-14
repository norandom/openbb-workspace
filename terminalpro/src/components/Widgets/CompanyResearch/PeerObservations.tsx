import { useRef, useState } from "react";
import { researchListingKey } from "~/lib/companyResearch/config";
import { assessEligibility } from "~/lib/companyResearch/eligibility";
import {
  type FinancialEvidence,
  getObservation,
} from "~/lib/companyResearch/financialEnvelope";
import {
  type PeerJob,
  type PeerObservationsProps,
  peerContext,
  peerEndpoint,
  usePeerDataset,
  usePeerObservations,
} from "./usePeerObservations";

const unknown = "Unknown";
function display(value: unknown): string {
  return value == null
    ? unknown
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}

function Observation({ evidence }: { evidence: FinancialEvidence }) {
  const [rowIndex, setRowIndex] = useState(0);
  const [selectedField, setSelectedField] = useState("");
  const currentRowIndex = Math.min(
    rowIndex,
    Math.max(0, evidence.originalRows.length - 1),
  );
  if (rowIndex !== currentRowIndex) setRowIndex(currentRowIndex);
  const fields = [
    ...new Set([
      ...evidence.originalRows.flatMap((row) => Object.keys(row)),
      ...Object.keys(
        evidence.metadata.status === "known" ? evidence.metadata.value.fields : {},
      ),
    ]),
  ];
  const fieldName = fields.includes(selectedField) ? selectedField : fields[0];
  const observation = fieldName
    ? getObservation(evidence, currentRowIndex, fieldName)
    : null;
  if (!observation)
    return (
      <p>No original observations available. Metadata: {evidence.metadata.status}.</p>
    );
  const eligibility = assessEligibility({ applicability: { kind: "unknown" } });
  return (
    <div className="space-y-2">
      <label>
        Original row{" "}
        <select
          aria-label="Original row"
          value={currentRowIndex}
          onChange={(event) => setRowIndex(Number(event.target.value))}
        >
          {evidence.originalRows.map((row, index) => (
            <option key={index} value={index}>
              Row {index + 1} · original row index {index} · source ordinal{" "}
              {display(getObservation(evidence, index, fieldName)?.sourceOrdinal)} ·{" "}
              {display(row.date)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Field{" "}
        <select
          aria-label="Field"
          value={fieldName}
          onChange={(event) => setSelectedField(event.target.value)}
        >
          {fields.map((field) => (
            <option key={field}>{field}</option>
          ))}
        </select>
      </label>
      <dl className="break-words">
        <dt>Original value</dt>
        <dd>{observation.present ? display(observation.value) : "Missing"}</dd>
        <dt>Definition</dt>
        <dd>{display(observation.field?.definition)}</dd>
        <dt>Unit / scale / row currency</dt>
        <dd>
          {display(observation.field?.unit)} / {display(observation.field?.scale)} /{" "}
          {display(observation.currency)}
        </dd>
        <dt>Period basis / value origin</dt>
        <dd>
          {display(observation.field?.period_basis)} /{" "}
          {display(observation.field?.value_origin)}
        </dd>
        <dt>Observation / valuation / publication dates</dt>
        <dd>
          {display(observation.observationDate)} / {display(observation.valuationDate)}{" "}
          / {display(observation.publicationDate)}
        </dd>
        <dt>Financial basis</dt>
        <dd>{display(observation.field?.financial_basis)}</dd>
        <dt>Source ordinal</dt>
        <dd>
          {display(observation.sourceOrdinal)}; original row index{" "}
          {observation.rowIndex}
        </dd>
        <dt>Acquired at</dt>
        <dd>{display(evidence.acquiredAt)}</dd>
        <dt>Eligibility</dt>
        <dd>
          {eligibility.status}: {eligibility.reasons.join(", ")}
        </dd>
      </dl>
      <details>
        <summary>Original row and metadata evidence</summary>
        <pre className="whitespace-pre-wrap break-all">
          {JSON.stringify(
            { row: observation.row, metadata: evidence.metadata },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function Dataset({
  job,
  props,
  active,
  refresh,
  settle,
}: {
  job: PeerJob;
  props: PeerObservationsProps;
  active: boolean;
  refresh: number;
  settle: (id: string) => void;
}) {
  const lifecycle = usePeerDataset(job, props, active, refresh, settle);
  return (
    <section
      aria-label={`${job.peer.identity.symbol} ${job.dataset}`}
      className="border border-general-border-primary p-2 space-y-2"
    >
      <h4>{job.dataset}</h4>
      <p role="status">
        {lifecycle.status === "loading" && !active ? "Queued" : lifecycle.status}
      </p>
      {(lifecycle.status === "error" || lifecycle.status === "stale") && (
        <p role="alert">
          This dataset request failed at {lifecycle.failedAt}.{" "}
          {lifecycle.status === "stale"
            ? "Prior evidence retained as stale."
            : "Other peers remain available."}
        </p>
      )}
      {lifecycle.evidence && <Observation evidence={lifecycle.evidence} />}
    </section>
  );
}

function ObservationRun(props: PeerObservationsProps) {
  const run = usePeerObservations(props);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run.reload}
        disabled={run.busy || !run.jobs.length}
      >
        Refresh peer observations
      </button>
      {!props.config.peers.length && <p>No peers selected.</p>}
      {props.config.peers.map((peer) => (
        <article
          key={researchListingKey(peer.identity)}
          aria-label={`${peer.identity.symbol} observations`}
          className="space-y-2"
        >
          <h3>
            {peer.identity.name ?? "Name unavailable"} ({peer.identity.symbol}) ·{" "}
            {peer.identity.exchange ??
              peer.identity.exchangeShortName ??
              "Exchange unavailable"}
          </h3>
          <p>
            Candidate peer · provider {peer.identity.provider} · listing ID{" "}
            {peer.identity.listingId ?? unknown} · listing currency{" "}
            {peer.identity.currency ?? unknown}
          </p>
          <p>Rationale: {peer.rationale || "Not supplied"}</p>
          {(!peerEndpoint(props.source) ||
            peer.identity.sourceKey !== props.source?.sourceKey) && (
            <p role="status">
              Source unavailable or unresolved. Reselect explicitly to request
              observations.
            </p>
          )}
          {run.jobs
            .filter(
              (job) =>
                researchListingKey(job.peer.identity) ===
                researchListingKey(peer.identity),
            )
            .map((job) => (
              <Dataset
                key={job.id}
                job={job}
                props={props}
                active={run.active.includes(job.id)}
                refresh={run.refresh}
                settle={run.settle}
              />
            ))}
        </article>
      ))}
    </div>
  );
}

export function PeerObservations(props: PeerObservationsProps) {
  const signature = peerContext(props);
  const context = useRef({ signature, generation: 0 });
  if (context.current.signature !== signature)
    context.current = { signature, generation: context.current.generation + 1 };
  return (
    <section
      aria-label="Peer observations"
      className="body-xs-regular text-ds-text-body space-y-3 min-w-0"
    >
      <h2>Peer observations</h2>
      <p>
        Generic controls for candidate research. Provider multiples are observations,
        not validated valuation inputs. Denominators and enterprise-value bridges are
        unverified; zero or negative denominators are not meaningful when supported by
        explicit evidence. Conflicting scoped comparison evidence is incompatible. No
        ranking, aggregation, inferred joins or local valuation formulas.
      </p>
      <p>
        Periodic metrics and ratios; TTM excluded. Dates, units, financial basis and
        availability may differ. Accounting optimization and stock-based compensation
        treatment remain unknown unless evidenced. Current filings and quotes are not a
        point-in-time-safe historical snapshot. Fiscal calendars may be unaligned.
        Generic table/chart sorting and summary statistics do not establish financial
        comparability.
      </p>
      <ObservationRun key={context.current.generation} {...props} />
    </section>
  );
}
