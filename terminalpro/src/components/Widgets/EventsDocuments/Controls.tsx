import { useId, useState } from "react";
import type { ControlsProps } from "~/lib/eventsDocuments/controller";
import type { Choices, SelectionIssue, Slot } from "~/lib/eventsDocuments/selection";

const fieldClass = "rounded border border-ds-border bg-card px-2 py-1 outline-offset-2 focus-visible:outline focus-visible:outline-2";
const companies = { AAPL: "Apple", MSFT: "Microsoft" } as const;
const names = { start_date: "Start date", end_date: "End date", page: "Page", limit: "Limit", year: "Year", quarter: "Quarter" } as const;
type Field = keyof typeof names;
const queryFields = {
  calendar: ["start_date", "end_date"],
  filings: ["start_date", "end_date", "page", "limit"],
  transcript: ["year", "quarter"],
  news: ["start_date", "end_date", "page", "limit"],
} satisfies Record<Slot, Field[]>;
const groups = {
  calendar: "Calendar window",
  filings: "Filing bounds",
  transcript: "Transcript period",
  news: "News bounds",
} as const;

function CompanyControls({ choices, issues, onApplySymbol }: ControlsProps) {
  const [draft, setDraft] = useState("");
  const errorId = useId();
  const { symbol } = choices;
  const company = companies[symbol as keyof typeof companies];
  return (
    <div className="space-y-2">
      <p>Company {company ?? symbol} · Query symbol <strong>{symbol}</strong></p>
      <fieldset className="flex flex-wrap gap-2">
        <legend>Choose company</legend>
        {Object.entries(companies).map(([listing, label]) => (
          <button key={listing} className={fieldClass} type="button" aria-pressed={symbol === listing}
            onClick={() => { onApplySymbol(listing); setDraft(""); }}>{label} ({listing})</button>
        ))}
      </fieldset>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        onApplySymbol(draft);
      }}>
        <label className="grid gap-1">Custom listing symbol
          <input className={fieldClass} value={draft} onChange={(event) => setDraft(event.target.value)}
            aria-invalid={Boolean(issues.symbol)} aria-describedby={issues.symbol ? errorId : undefined} />
        </label>
        <button type="submit" className={fieldClass}>Apply symbol</button>
        {issues.symbol && <p id={errorId} role="alert">{issues.symbol.field}. {issues.symbol.bounds}</p>}
      </form>
    </div>
  );
}

type QueryControlsProps<K extends Slot> = {
  slot: K;
  bounds: Choices[K];
  issue?: SelectionIssue;
  apply: (slot: K, bounds: Choices[K]) => void;
};

function formChoices<K extends Slot>(slot: K, draft: Partial<Record<Field, string>>): Choices[K] {
  const fields: Field[] = queryFields[slot];
  const entries = fields.flatMap<[Field, string | number]>((field) => {
    const value = draft[field] ?? "";
    if (field === "start_date" || field === "end_date") {
      return value === "" && slot === "news" ? [] : [[field, value]];
    }
    return [[field, /^-?\d+$/.test(value) ? Number(value) : NaN]];
  });
  return Object.fromEntries(entries) as Choices[K];
}

function QueryControls<K extends Slot>({ slot, bounds, issue, apply }: QueryControlsProps<K>) {
  const [draft, setDraft] = useState<Partial<Record<Field, string>>>(() =>
    Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, String(value)])),
  );
  const errorId = useId();
  return (
    <form onSubmit={(event) => { event.preventDefault(); apply(slot, formChoices(slot, draft)); }}>
      <fieldset className="flex flex-wrap items-end gap-2">
        <legend>{groups[slot]}</legend>
        {queryFields[slot].map((field) => (
          <label key={field} className="grid gap-1">
            {names[field]}
            <input className={`${fieldClass} w-36`}
              type={field.endsWith("_date") ? "date" : "text"}
              inputMode={field.endsWith("_date") ? undefined : "numeric"}
              value={draft[field] ?? ""}
              onChange={(event) => setDraft({ ...draft, [field]: event.target.value })}
              aria-invalid={issue?.field === field}
              aria-describedby={issue?.field === field ? errorId : undefined} />
          </label>
        ))}
        <button type="submit" className={fieldClass}>Apply {groups[slot].toLowerCase()}</button>
        {issue && <p id={errorId} role="alert">{names[issue.field as Field] ?? issue.field}. {issue.bounds}</p>}
      </fieldset>
    </form>
  );
}

export function Controls(props: ControlsProps) {
  const { choices, issues, onApplyBounds } = props;
  return (
    <div className="space-y-3">
      <CompanyControls {...props} />
      {(Object.keys(queryFields) as Slot[]).map((slot) => (
        <QueryControls key={slot} slot={slot} bounds={choices[slot]} issue={issues[slot]} apply={onApplyBounds} />
      ))}
    </div>
  );
}
