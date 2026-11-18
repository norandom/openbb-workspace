import { useEffect, useId, useRef, useState } from "react";

export type CompanyDocumentKind = "news" | "transcript" | "filings";
export type CompanyDocumentRow = Readonly<{
  symbol?: string | null;
  symbols?: string | null;
  title?: string | null;
  date?: string | null;
  source?: string | null;
  publisher?: string | null;
  author?: string | null;
  excerpt?: string | null;
  content?: string | null;
  content_status?: "partial" | "metadata_only" | "completeness_unknown" | "full" | null;
  year?: number | null;
  quarter?: string | number | null;
  event_datetime?: string | null;
  filing_date?: string | null;
  accepted_date?: string | null;
  report_type?: string | null;
  cik?: string | null;
  url?: string | null;
  filing_url?: string | null;
  report_url?: string | null;
  images?: unknown;
}>;
export type CompanyDocumentsProps = {
  kind: CompanyDocumentKind;
  rows: readonly CompanyDocumentRow[];
  contextKey: string;
  provider?: string;
};

type Entry = { id: string; row: CompanyDocumentRow };
const textStyle = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

function safeLink(value: string | null | undefined) {
  if (
    !value ||
    !/^https?:\/\//i.test(value) ||
    /\s/.test(value) ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  try {
    const url = new URL(value);
    return url.hostname && !url.username && !url.password ? value : null;
  } catch {
    return null;
  }
}

function documentEntries(rows: readonly CompanyDocumentRow[]): Entry[] {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    // Canonical values keep focus and selection tied to evidence across immutable refreshes.
    const identity = JSON.stringify(
      Object.entries(row)
        .filter(([key]) => key !== "images")
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { id: `${identity}:${occurrence}`, row };
  });
}

function period(row: CompanyDocumentRow) {
  const quarter =
    row.quarter == null
      ? "Quarter unknown"
      : /^Q/i.test(String(row.quarter))
        ? String(row.quarter)
        : `Q${row.quarter}`;
  return `${quarter} ${row.year ?? "Year unknown"}`;
}

function label(row: CompanyDocumentRow, kind: CompanyDocumentKind) {
  const company = row.symbol || row.symbols || "Company unknown";
  const title =
    kind === "news"
      ? row.title || "Untitled article"
      : kind === "transcript"
        ? `Earnings call ${period(row)}`
        : row.report_type || "Filing form unknown";
  return `${company} · ${title} · ${row.filing_date || row.date || row.event_datetime || "Date unknown"}`;
}

function coverage(row: CompanyDocumentRow, kind: CompanyDocumentKind) {
  if (kind === "filings" || row.content_status === "metadata_only")
    return "Metadata only; document text is not supplied inline.";
  if (kind === "news" && row.excerpt?.trim())
    return "Partial excerpt; full article is not supplied inline.";
  if (row.content_status === "full") return "Full content (source reported)";
  if (row.content_status === "partial") return "Partial content";
  return "Completeness unknown";
}

function DocumentLinks({
  row,
  kind,
}: {
  row: CompanyDocumentRow;
  kind: CompanyDocumentKind;
}) {
  const candidates =
    kind === "filings"
      ? [
          ["Filing index", row.filing_url],
          ["Report document", row.report_url],
        ]
      : kind === "news"
        ? [["Article", row.url]]
        : [];
  return (
    <div className="flex flex-wrap gap-3">
      {candidates.map(([name, value]) => {
        const href = safeLink(value);
        return href ? (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {name}
          </a>
        ) : null;
      })}
    </div>
  );
}

function DocumentMetadata({
  row,
  kind,
  provider,
}: {
  row: CompanyDocumentRow;
  kind: CompanyDocumentKind;
  provider?: string;
}) {
  const entries = [
    ["Company", row.symbol || row.symbols || "Company unknown"],
    ["Provider", provider || "Provider unknown"],
    ["Source", row.source || "Source unknown"],
    ["Date", row.event_datetime || row.filing_date || row.date || "Date unknown"],
  ];
  if (kind === "news")
    entries.push(
      ["Publisher", row.publisher || "Publisher unknown"],
      ["Author", row.author || "Author unknown"],
    );
  if (kind === "transcript") entries.push(["Fiscal period", period(row)]);
  if (kind === "filings")
    entries.push(
      ["Form", row.report_type || "Form unknown"],
      ["CIK", row.cik || "CIK unknown"],
      ["Accepted", row.accepted_date || "Acceptance date unknown"],
    );
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([name, value]) => (
        <div key={name}>
          <dt className="text-ds-text-caption">{name}</dt>
          <dd style={textStyle}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocumentDetail({
  entry,
  kind,
  provider,
  close,
}: {
  entry: Entry;
  kind: CompanyDocumentKind;
  provider?: string;
  close: () => void;
}) {
  const detail = useRef<HTMLElement>(null);
  const titleId = useId();
  const { row } = entry;
  const body =
    kind === "news" ? row.excerpt : kind === "transcript" ? row.content : null;
  useEffect(() => {
    detail.current?.focus();
  }, []);
  return (
    <section
      ref={detail}
      tabIndex={-1}
      aria-label="Document detail"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
      className="min-w-0 space-y-3 rounded border border-ds-border p-3 outline-offset-2"
    >
      <button
        type="button"
        onClick={close}
        className="rounded border px-2 py-1 focus-visible:outline"
      >
        Close document
      </button>
      <h3 id={titleId} style={textStyle}>
        {label(row, kind)}
      </h3>
      <DocumentMetadata row={row} kind={kind} provider={provider} />
      <p>{coverage(row, kind)}</p>
      {body?.trim() && row.content_status !== "metadata_only" ? (
        <div data-testid="document-text" style={textStyle}>
          {body}
        </div>
      ) : kind !== "filings" ? (
        <p>No inline text supplied.</p>
      ) : null}
      <DocumentLinks row={row} kind={kind} />
    </section>
  );
}

function DocumentBrowser({
  rows,
  kind,
  provider,
}: Omit<CompanyDocumentsProps, "contextKey">) {
  const [selected, setSelected] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const entries = documentEntries(rows);
  const entry = entries.find((item) => item.id === selected);
  useEffect(() => {
    if (selected && !entry) {
      setSelected(null);
      buttons.current.values().next().value?.focus();
    }
  }, [selected, entry]);
  const close = () => {
    setSelected(null);
    if (selected) buttons.current.get(selected)?.focus();
  };
  return (
    <div className="h-full min-w-0 overflow-auto p-3 text-sm">
      {entries.length ? (
        <ul aria-label="Company documents" className="space-y-2">
          {entries.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                ref={(node) => {
                  if (node) buttons.current.set(item.id, node);
                  else buttons.current.delete(item.id);
                }}
                aria-expanded={selected === item.id}
                onClick={() => setSelected(item.id)}
                style={textStyle}
                className="w-full rounded border border-ds-border p-2 text-left focus-visible:outline"
              >
                {label(item.row, kind)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No documents supplied.</p>
      )}
      {entry && (
        <DocumentDetail
          key={entry.id}
          entry={entry}
          kind={kind}
          provider={provider}
          close={close}
        />
      )}
    </div>
  );
}

export default function CompanyDocuments(props: CompanyDocumentsProps) {
  return (
    <DocumentBrowser
      key={`${props.kind}:${props.contextKey}`}
      rows={props.rows}
      kind={props.kind}
      provider={props.provider}
    />
  );
}
