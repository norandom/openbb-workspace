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
import type {
  ListingChoice,
  SearchMode,
  SearchState,
} from "./companySelection.contract";
import { type CompanySelectionInput, useCompanySelection } from "./useCompanySelection";

export type CompanySymbolSelectorProps = Readonly<{
  input: CompanySelectionInput;
  onManualSymbolChange: (symbol: string) => void;
  groupControl?: ReactNode;
  comparisonEditor?: ReactNode;
}>;
type Draft = { identity: string; mode: SearchMode; value: string; open: boolean };
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
  const identity = JSON.stringify([
    input.context.widgetUuid,
    input.source?.sourceKey,
    input.context.provider,
    input.context.symbol,
    company.selection?.selectedAt,
  ]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [active, setActive] = useState(-1);
  const pending = useRef<PendingSymbol | null>(null);
  const latest = useRef({ identity, onManualSymbolChange });
  latest.current = { identity, onManualSymbolChange };
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
  }
  function flushManual() {
    const next = pending.current;
    cancelManual();
    if (next?.identity === latest.current.identity)
      latest.current.onManualSymbolChange(next.value);
  }
  function edit(mode: SearchMode, value: string, changed = false) {
    setDraft({ identity, mode, value, open: true });
    setActive(-1);
    company.search(mode, value);
    if (changed && mode === "symbol" && !multiple) {
      cancelManual();
      pending.current = { identity, value, timer: setTimeout(flushManual, 1250) };
    }
  }
  function close() {
    company.cancel();
    setDraft((previous) => (previous ? { ...previous, open: false } : null));
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
    cancelManual();
    setDraft(null);
    setActive(-1);
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
    company.error ?? searchMessage(company.searchState, input.source !== null);
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
