import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useDebouncedCallback } from "use-debounce";
import { z } from "zod";
import { Button } from "~/components/ds/atoms/Button";
import { Input } from "~/components/ds/atoms/Input";
import type { CompanyRequestContext, CompanySearchPort, ListingChoice } from "../../General/Table/NavBar/companySelection.contract";
import { useCompanySearch } from "../../General/Table/NavBar/useCompanySearch";
import { companyResearchConfigSchema, researchListingFromChoice, type CompanyResearchConfig, type ResearchPeer } from "~/lib/companyResearch/config";

export type PeerEditorProps = {
  config: CompanyResearchConfig;
  onChange: (config: CompanyResearchConfig) => void;
  source: CompanyRequestContext | null;
  searchPort?: CompanySearchPort;
};
type Draft = z.input<typeof companyResearchConfigSchema>;

function listingLabel(listing: ListingChoice): string {
  return `${listing.name ?? "Name unavailable"} (${listing.symbol}) · ${listing.exchange ?? listing.exchangeShortName ?? "Exchange unavailable"} · ${listing.currency ?? "Currency unavailable"} · Listing ID: ${listing.listingId ?? "unavailable"}`;
}

function usePeerDraft({ config, onChange }: PeerEditorProps) {
  const form = useForm<Draft, unknown, CompanyResearchConfig>({
    defaultValues: config as Draft,
    resolver: zodResolver(companyResearchConfigSchema),
  });
  const array = useFieldArray({ control: form.control, name: "peers" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { form.reset(config as Draft); setError(null); }, [config, form.reset]);
  function publish(next: unknown, apply: () => void) {
    const parsed = companyResearchConfigSchema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map(issue => issue.message).join(" "));
      return;
    }
    try {
      onChange(parsed.data);
      apply();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Research configuration could not be saved.");
    }
  }
  function add(identity: ResearchPeer["identity"]) {
    const peer = { identity, rationale: "" };
    publish({ ...form.getValues(), peers: [...form.getValues("peers"), peer] }, () => array.append(peer));
  }
  function remove(index: number) {
    publish({ ...form.getValues(), peers: form.getValues("peers").filter((_, i) => i !== index) }, () => array.remove(index));
  }
  function move(from: number, to: number) {
    const peers = [...form.getValues("peers")];
    const [peer] = peers.splice(from, 1);
    peers.splice(to, 0, peer);
    publish({ ...form.getValues(), peers }, () => array.move(from, to));
  }
  function rationale(index: number, value: string) {
    // Invalid edits remain in the form buffer; only validated configuration reaches storage.
    form.setValue(`peers.${index}.rationale`, value, { shouldDirty: true });
    publish(form.getValues(), () => {});
  }
  return { form, fields: array.fields, error, setError, add, remove, move, rationale };
}

function useCandidateSearch(source: CompanyRequestContext | null, port?: CompanySearchPort) {
  const search = useCompanySearch(source, port);
  const [query, setQuery] = useState("");
  const deferredSearch = useDebouncedCallback((value: string) => search.search("name", value), 150);
  useEffect(() => () => deferredSearch.cancel(), [deferredSearch]);
  useEffect(() => { deferredSearch.cancel(); search.cancel(); }, [source?.sourceKey]);
  function edit(value: string) {
    setQuery(value);
    search.cancel();
    deferredSearch.cancel();
    if (value.trim().length >= 2 && value.length <= 200) deferredSearch(value);
  }
  const message = !source ? "Company search is unavailable. Saved choices remain editable."
    : query.length > 200 ? "Search must contain at most 200 characters."
    : search.state.kind === "failed" ? search.state.result.failure.message
    : search.state.kind === "loading" ? "Searching candidates…"
    : search.state.kind === "ready" && !search.state.result.rows.length ? "No candidate listings found."
    : "Search by company name (2–200 characters).";
  return { ...search, query, edit, message };
}

type PeerRowProps = {
  peer: ResearchPeer;
  index: number;
  count: number;
  source: CompanyRequestContext | null;
  edit: ReturnType<typeof usePeerDraft>;
  limitsId: string;
};
function PeerRow({ peer, index, count, source, edit, limitsId }: PeerRowProps) {
  const symbol = peer.identity.symbol;
  return <li className="border border-general-border-primary rounded-sm p-2 space-y-2">
    <div className="break-words">{listingLabel(peer.identity)}</div>
    <div className="text-ds-text-caption">Provider: {peer.identity.provider} · Candidate peer; financial compatibility unverified.</div>
    {source?.sourceKey !== peer.identity.sourceKey && <div role="status">Source unavailable for this saved listing. Reselect explicitly to use another source.</div>}
    <label className="block">Rationale for {symbol}
      <textarea aria-label={`Rationale for ${symbol}`} className="w-full bg-input-field-bg border border-general-border-primary rounded-sm p-2 text-ds-text-body"
        defaultValue={peer.rationale} {...edit.form.register(`peers.${index}.rationale`)}
        onChange={event => edit.rationale(index, event.target.value)} aria-describedby={limitsId} />
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="xs" variant="secondary" aria-label={`Move ${symbol} up`} disabled={index === 0} onClick={() => edit.move(index, index - 1)}>Move up</Button>
      <Button type="button" size="xs" variant="secondary" aria-label={`Move ${symbol} down`} disabled={index === count - 1} onClick={() => edit.move(index, index + 1)}>Move down</Button>
      <Button type="button" size="xs" variant="secondary" aria-label={`Remove ${symbol}`} onClick={() => edit.remove(index)}>Remove</Button>
    </div>
  </li>;
}

export function PeerEditor(props: PeerEditorProps) {
  const limitsId = useId();
  const edit = usePeerDraft(props);
  const search = useCandidateSearch(props.source, props.searchPort);
  const ready = search.state.kind === "ready" ? search.state.result : null;
  function choose(listing: ListingChoice) {
    if (!ready || !search.isCurrent(ready) || !props.source) return;
    const identity = researchListingFromChoice(listing, props.source.sourceKey);
    if (!identity) { edit.setError("Candidate listing is invalid. Review the source identity."); return; }
    edit.add(identity);
  }
  return <section aria-label="Candidate peers" className="body-xs-regular text-ds-text-body space-y-3 min-w-0">
    <h3>Candidate peers</h3>
    <p>Choose candidates explicitly. Membership and rationale do not validate financial comparability. Saving retains research configuration, not a frozen valuation dataset.</p>
    <p id={limitsId}>Maximum 20 peers; rationale maximum 2000 characters per peer. Primary company selection does not change this list.</p>
    <Input aria-label="Find candidate peers" placeholder="Company name" value={search.query} onChange={search.edit} disabled={!props.source} />
    <p role="status" aria-live="polite">{search.message}</p>
    {ready && <ul aria-label="Candidate suggestions" className="space-y-2">
      {ready.rows.map((listing, index) => <li key={index}>
        <Button type="button" variant="secondary" size="sm" className="whitespace-normal h-auto text-left" onClick={() => choose(listing)} aria-label={`Add ${listing.name ?? "Name unavailable"} (${listing.symbol})`}>
          Add {listingLabel(listing)}
        </Button>
      </li>)}
    </ul>}
    {edit.error && <p role="alert" className="text-alert-error">{edit.error}</p>}
    {!edit.fields.length && <p>No peers selected. Search and add candidate listings.</p>}
    <ol aria-label="Selected peers" className="space-y-2">
      {edit.fields.map((field, index) => <PeerRow key={field.id} peer={field as ResearchPeer} index={index} count={edit.fields.length} source={props.source} edit={edit} limitsId={limitsId} />)}
    </ol>
  </section>;
}
