import { Anchor } from "@radix-ui/react-popover";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Input } from "~/components/ds/atoms/Input";
import { PopoverContent, PopoverRoot } from "~/components/ds/atoms/Popover";
import {
  isSingleSymbol,
  type ListingChoice,
  type SearchMode,
  type SearchState,
} from "./companySelection.contract";
import { type CompanySelectionInput, useCompanySelection } from "./useCompanySelection";

export type CompanySymbolSelectorProps = Readonly<{
  input: CompanySelectionInput;
  onManualSymbolChange: (symbol: string) => void;
  groupControl?: ReactNode;
  comparisonEditor?: ReactNode;
}>;
type Draft = {
  identity: string;
  mode: SearchMode;
  value: string;
  open: boolean;
  feedback?: string;
};
type RawAcknowledgement = {
  fromIdentity: string;
  scope: number;
  symbol: string;
  requery: boolean;
  feedback?: string;
};
type PendingSymbol = {
  timer: ReturnType<typeof setTimeout>;
  value: string;
  identity: string;
};
type FieldProps = {
  mode: SearchMode;
  value: string;
  listId: string;
  statusId: string;
  open: boolean;
  activeId?: string;
  loading: boolean;
  nameUnavailable: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

// Request configuration stays private; drafts contain only an opaque scope generation.
function scopeSignature(input: CompanySelectionInput): string {
  const { symbol: _symbol, group, ...context } = input.context;
  const { requestInit, ...source } = input.source ?? { requestInit: {} };
  const headers = Array.from(new Headers(requestInit.headers).entries()).sort();
  return JSON.stringify([
    context,
    group.kind === "bound" ? { id: group.id, members: group.members } : group,
    source,
    { ...requestInit, headers },
  ]);
}

function CompanyField(props: FieldProps) {
  const label = props.mode === "name" ? "Company name" : "Symbol";
  return (
    <Input
      label={label}
      aria-label={label}
      size="xs"
      clearable={false}
      className="min-w-0 w-full"
      value={props.value}
      placeholder={props.nameUnavailable ? "Name unavailable" : label}
      autoComplete="off"
      role="combobox"
      aria-autocomplete="list"
      aria-haspopup="listbox"
      aria-expanded={props.open}
      aria-controls={props.open ? props.listId : undefined}
      aria-activedescendant={props.open ? props.activeId : undefined}
      aria-describedby={props.statusId}
      aria-busy={props.loading}
      onFocus={props.onFocus}
      onChange={props.onChange}
      onBlur={props.onBlur}
      onKeyDown={props.onKeyDown}
    />
  );
}

function searchMessage(state: SearchState, connected: boolean): string {
  if (!connected) return "Connect a source to search companies.";
  if (state.kind === "loading") return "Searching companies…";
  if (state.kind === "failed") return state.result.failure.message;
  if (state.kind === "ready")
    return state.result.rows.length === 0
      ? "No matching companies."
      : "Up to 20 matches. Choose a listing to resolve the company.";
  return "Search by company name (at least 2 characters) or symbol.";
}

function ListingOption(props: {
  listing: ListingChoice;
  id: string;
  active: boolean;
  multiple: boolean;
  choose: () => void;
}) {
  const { listing, multiple } = props;
  return (
    <div
      id={props.id}
      role="option"
      aria-selected={props.active}
      className={`cursor-pointer rounded-sm px-2 py-1 text-ds-text-body ${props.active ? "bg-input-field-bg-hover" : "hover:bg-input-field-bg-hover"}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={props.choose}
    >
      <div className="break-words">
        {multiple && "Replace symbol list with "}
        <span>{listing.name ?? "Name unavailable"}</span> ({listing.symbol})
      </div>
      <div className="text-ds-text-caption break-words">
        {[
          listing.exchange,
          listing.exchangeShortName,
          listing.provider,
          listing.currency,
        ]
          .filter(Boolean)
          .join(" · ")}
      </div>
    </div>
  );
}

export function CompanySymbolSelector({
  input,
  onManualSymbolChange,
  groupControl,
  comparisonEditor,
}: CompanySymbolSelectorProps) {
  const company = useCompanySelection(input);
  const id = useId();
  const listId = `${id}-list`;
  const statusId = `${id}-status`;
  const signature = scopeSignature(input);
  const scope = useRef({ signature, generation: 0 });
  if (scope.current.signature !== signature)
    scope.current = { signature, generation: scope.current.generation + 1 };
  const identity = JSON.stringify([scope.current.generation, input.context.symbol]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(-1);
  const pending = useRef<PendingSymbol | null>(null);
  const acknowledgement = useRef<RawAcknowledgement | null>(null);
  const latest = useRef({
    identity,
    onManualSymbolChange,
    draft,
    state: company.searchState,
  });
  latest.current = {
    identity,
    onManualSymbolChange,
    draft,
    state: company.searchState,
  };
  const currentDraft = draft?.identity === identity ? draft : null;
  const multiple = Boolean(comparisonEditor) && input.context.symbol.includes(",");
  const open = currentDraft?.open ?? false;
  const rows =
    company.searchState.kind === "ready" ? company.searchState.result.rows : [];
  const selectedName = company.selection?.name ?? "";
  const values = {
    name: currentDraft?.mode === "name" ? currentDraft.value : selectedName,
    symbol: currentDraft?.mode === "symbol" ? currentDraft.value : input.context.symbol,
  };

  function cancelManual() {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
    acknowledgement.current = null;
  }
  function flushManual() {
    const next = pending.current;
    cancelManual();
    const current = latest.current;
    if (next?.identity !== current.identity) return;
    const feedback =
      current.state.kind === "failed"
        ? current.state.result.failure.message
        : current.draft?.feedback;
    if (
      isSingleSymbol(next.value) &&
      current.draft?.identity === next.identity &&
      current.draft.mode === "symbol" &&
      (current.draft.open || feedback !== undefined) &&
      current.draft.value === next.value
    ) {
      acknowledgement.current = {
        fromIdentity: next.identity,
        scope: scope.current.generation,
        symbol: next.value,
        requery:
          current.draft.open &&
          (current.state.kind === "loading" || current.state.kind === "ready"),
        feedback,
      };
    }
    current.onManualSymbolChange(next.value);
  }
  function edit(mode: SearchMode, value: string, changed = false) {
    acknowledgement.current = null;
    setDraft({ identity, mode, value, open: true });
    setActive(-1);
    company.search(mode, value);
    if (changed && mode === "symbol" && !multiple) {
      cancelManual();
      pending.current = { identity, value, timer: setTimeout(flushManual, 1250) };
    }
  }
  function close() {
    if (acknowledgement.current?.feedback === undefined) acknowledgement.current = null;
    company.cancel();
    setDraft((previous) =>
      previous
        ? {
            ...previous,
            open: false,
            feedback:
              company.searchState.kind === "failed"
                ? company.searchState.result.failure.message
                : previous.feedback,
          }
        : null,
    );
    setActive(-1);
  }
  function choose(listing: ListingChoice) {
    // A resolved listing supersedes the raw Symbol draft, including its old timer.
    cancelManual();
    if (company.choose(listing).kind === "applied") setDraft(null);
    setActive(-1);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>, mode: SearchMode) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) edit(mode, values[mode]);
      if (rows.length)
        setActive((previous) =>
          event.key === "ArrowDown"
            ? (previous + 1) % rows.length
            : (previous <= 0 ? rows.length : previous) - 1,
        );
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && rows[active]) choose(rows[active]);
      else if (mode === "symbol") flushManual();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelManual();
      close();
      setDraft(null);
    } else if (event.key === "Tab") close();
  }

  useEffect(() => {
    const expected = acknowledgement.current;
    cancelManual();
    setActive(-1);
    if (
      expected &&
      draft?.identity === expected.fromIdentity &&
      (draft.open || expected.feedback !== undefined) &&
      draft.mode === "symbol" &&
      draft.value === expected.symbol &&
      input.context.symbol === expected.symbol &&
      scope.current.generation === expected.scope
    ) {
      setDraft({ ...draft, identity, feedback: expected.feedback });
      // The hook has invalidated its former context; establish a fresh user request.
      if (expected.requery) company.search("symbol", draft.value);
      else company.cancel();
    } else setDraft(null);
  }, [identity]);
  useEffect(() => setActive(-1), [company.searchState]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView?.({ block: "nearest" });
  }, [active, id]);
  useEffect(() => () => cancelManual(), []);

  const current = company.selection
    ? `Current company: ${company.selection.name ?? "Name unavailable"} (${company.selection.symbol}).`
    : multiple
      ? `Multiple companies: ${input.context.symbol}. Choosing a listing replaces the symbol list.`
      : `Company unresolved. Current Symbol: ${input.context.symbol || "empty"}.`;
  const feedback =
    company.error ??
    currentDraft?.feedback ??
    searchMessage(company.searchState, input.source !== null);
  return (
    <div className="min-w-0 w-full body-xs-regular text-ds-text-body">
      <PopoverRoot
        open={open}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <Anchor asChild>
          <div
            data-company-fields
            className="flex flex-wrap items-end gap-2 min-w-0 h-auto"
          >
            {(["name", "symbol"] as const).map((mode) => (
              <div key={mode} className="flex-1 basis-40 min-w-0">
                <CompanyField
                  mode={mode}
                  value={values[mode]}
                  listId={listId}
                  statusId={statusId}
                  open={open && currentDraft?.mode === mode}
                  activeId={
                    active >= 0 && rows[active] ? `${id}-option-${active}` : undefined
                  }
                  loading={company.searchState.kind === "loading"}
                  nameUnavailable={mode === "name" && company.selection?.name === null}
                  onFocus={() => edit(mode, values[mode])}
                  onChange={(value) => edit(mode, value, true)}
                  onBlur={() => {
                    if (mode === "symbol") flushManual();
                    close();
                  }}
                  onKeyDown={(event) => keyDown(event, mode)}
                />
                {mode === "symbol" && (
                  <div className="flex flex-wrap gap-2 items-center min-w-0">
                    {groupControl}
                    {comparisonEditor}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Anchor>
        <PopoverContent
          id={listId}
          role="listbox"
          aria-label="Company listings (up to 20 matches)"
          align="start"
          className="min-w-0 w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] max-h-64 overflow-y-auto body-xs-regular"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {rows.map((listing, index) => (
            <ListingOption
              key={index}
              listing={listing}
              id={`${id}-option-${index}`}
              active={active === index}
              multiple={multiple}
              choose={() => choose(listing)}
            />
          ))}
          {rows.length === 0 && (
            <div className="text-ds-text-caption px-2 py-1">{feedback}</div>
          )}
        </PopoverContent>
      </PopoverRoot>
      <div
        id={statusId}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="text-ds-text-caption break-words mt-1"
      >
        {currentDraft && "Search draft. "}
        {current} {feedback}
      </div>
    </div>
  );
}
