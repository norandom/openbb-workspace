import { useId, useState } from "react";
import { Button } from "~/components/ds/atoms/Button";
import { Select } from "~/components/ds/atoms/Select";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "~/components/ds/dialogs/Dialog";
import { getObservation, type EvidenceLifecycle, type FinancialEvidence } from "~/lib/companyResearch/financialEnvelope";
import { displayEvidence, observationDetails, observationFields, observationLabel } from "./observationPresentation";

export type ObservationInspectorProps = { evidence: FinancialEvidence | null; lifecycle: EvidenceLifecycle };

function EvidenceDetails({ entries }: { entries: [string, unknown][] }) {
  return <dl className="grid grid-cols-2 gap-2 break-words">
    {entries.map(([label, value]) => <div key={label} className="contents"><dt className="text-ds-text-caption">{label}</dt><dd className="whitespace-pre-wrap">{displayEvidence(value)}</dd></div>)}
  </dl>;
}

function MetadataDetails({ evidence }: { evidence: FinancialEvidence }) {
  if (evidence.metadata.status === "unknown") return <p>Unknown ({evidence.metadata.reason} metadata)</p>;
  const metadata = evidence.metadata.value;
  return <>
    <EvidenceDetails entries={[
      ["Dataset", metadata.dataset], ["Provider", metadata.provider], ["Endpoint", metadata.source.endpoint],
      ["Acquired at", evidence.acquiredAt], ["Point-in-time safe", metadata.point_in_time_safe],
      ["Vintage query supported", metadata.vintage_query_supported], ["Response bounds", metadata.bounds],
      ["Effective query", metadata.effective_query], ["Observation provenance", metadata.observation_provenance],
    ]} />
    {metadata.source.documentation ? <a className="underline" href={metadata.source.documentation} target="_blank" rel="noreferrer">Provider documentation: {metadata.source.documentation}</a> : <p>Provider documentation: Unknown</p>}
    <h3>Transformations</h3>
    {metadata.transformations.length ? metadata.transformations.map((item, index) => <EvidenceDetails key={index} entries={[["Name", item.name], ["Affected fields", item.affected_fields], ["Source basis", item.source_basis], ["Definition", item.definition]]} />) : <p>None supplied</p>}
    <h3>Limitations</h3>
    {metadata.limitations.length ? <ul>{metadata.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>None supplied; availability is not established.</p>}
  </>;
}

function InspectorDialog({ evidence, lifecycle }: { evidence: FinancialEvidence; lifecycle: EvidenceLifecycle }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const fields = observationFields(evidence);
  const [selectedField, setField] = useState(fields[0] ?? "");
  const [selectedRow, setRow] = useState("0");
  const field = fields.includes(selectedField) ? selectedField : fields[0] ?? "";
  const row = Number(selectedRow) < evidence.originalRows.length ? Number(selectedRow) : 0;
  const observation = getObservation(evidence, row, field);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outlined" size="xs">Inspect observations</Button></DialogTrigger>
    <DialogContent aria-labelledby={titleId} className="sm:max-w-2xl overflow-y-auto">
      <DialogTitle id={titleId}>Observation evidence</DialogTitle>
      <DialogDescription>Inspect original provider rows independently of table grouping or transpose. Missing evidence is unknown.</DialogDescription>
      {lifecycle.status === "stale" && <p role="status">Stale evidence. Failed attempt: {lifecycle.failedAt}. Acquired at: {displayEvidence(evidence.acquiredAt)}.</p>}
      {lifecycle.status === "refreshing" && <p role="status">Refreshing evidence; previous acquisition remains displayed.</p>}
      <Select label="Original observation" value={String(row)} onChange={setRow} disabled={!evidence.originalRows.length} options={evidence.originalRows.map((_, index) => ({value: String(index), label: observationLabel(evidence, index)}))} />
      <Select label="Field" value={field} onChange={setField} disabled={!fields.length} options={fields} />
      {observation ? <>
        <p>Value: <span data-testid="observation-value">{!observation.present ? "Missing (field absent)" : observation.value == null ? "Missing (null)" : displayEvidence(observation.value)}</span></p>
        <EvidenceDetails entries={observationDetails(evidence, row, field)} />
        {observation.field && <details><summary>Supplied field metadata</summary><pre className="whitespace-pre-wrap break-words">{JSON.stringify(observation.field, null, 2)}</pre><p>Additional supplied metadata is retained as evidence; no accounting treatment is inferred.</p></details>}
      </> : <p>No original observations available.</p>}
      <p>SBC treatment is unknown unless the supplied definition or reconciliation establishes an add-back or retained expense. Review the source evidence below. Values remain as supplied; no house economic-cost adjustment is applied.</p>
      <MetadataDetails evidence={evidence} />
    </DialogContent>
  </Dialog>;
}

export default function ObservationInspector({ evidence, lifecycle }: ObservationInspectorProps) {
  const current = evidence && evidence.contextKey === lifecycle.contextKey && lifecycle.evidence === evidence;
  return current ? <InspectorDialog key={evidence.contextKey} evidence={evidence} lifecycle={lifecycle} /> : <Button variant="outlined" size="xs" disabled>Inspect observations</Button>;
}

