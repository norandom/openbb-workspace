import type { EChartsOption } from "echarts";
import { type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EChartsHost } from "~/components/General/Table/Chart/echarts/EChartsHost";
import type { CalendarField } from "~/lib/eventsDocuments/evidence";
import type { CalendarProjection, CalendarRow } from "~/lib/eventsDocuments/calendar";
import type { ControlsProps, EventsDocumentsSnapshot } from "~/lib/eventsDocuments/controller";
import type { FailureCode } from "~/lib/eventsDocuments/reader";
import type { ChartDisplay, ChartMeasure, Choices } from "~/lib/eventsDocuments/selection";
import { useThemeStore } from "~/lib/state/theme";

export type EarningsProps = {
  state: EventsDocumentsSnapshot["slots"]["calendar"];
  projection?: CalendarProjection;
  symbol: string;
  display: Choices["charts"];
  onDisplayChange: ControlsProps["onChartDisplayChange"];
  onRetry: () => void;
};

const measures = {
  eps: { title: "EPS", unit: "EPS per share", fields: ["eps_actual", "eps_consensus"] },
  revenue: { title: "Revenue", unit: "Revenue (monetary amount)", fields: ["revenue_actual", "revenue_consensus"] },
} as const;

const labels: Record<CalendarField, string> = {
  eps_actual: "Actual EPS", eps_consensus: "Estimated EPS",
  revenue_actual: "Actual revenue", revenue_consensus: "Estimated revenue",
};

const failureCopy: Record<FailureCode, string> = {
  authentication: "FMP authentication failed.",
  entitlement: "FMP entitlement is required for this calendar.",
  throttling: "FMP rate limited the calendar request.",
  timeout: "The FMP calendar request timed out.",
  invalid_parameters: "The data API rejected the calendar query.",
  invalid_response: "The data API could not validate the FMP calendar response.",
  upstream: "FMP could not supply the earnings calendar.",
  internal_error: "The data API could not complete the calendar request.",
  transport: "The data API could not be reached for the FMP calendar.",
  unavailable: "The data API is unavailable for the FMP calendar.",
  invalid_evidence: "The FMP calendar evidence could not be validated.",
  permission_denied: "Workspace access to the FMP calendar is unavailable.",
  unknown: "The FMP calendar request failed.",
};

const conditions = {
  empty_market: "Empty market calendar for this window.",
  no_issuer_match: (symbol: string) => `FMP returned no calendar rows for ${symbol} in this window.`,
  missing_figures: "Matching rows have no reported figures.",
};

const measureKeys = ["eps", "revenue"] as const;
const controlClass = "rounded border border-ds-border bg-card px-2 py-1 focus-visible:outline focus-visible:outline-2";

function rowKey(row: CalendarRow) {
  return `${row.symbol}:${row.generation}:${row.ordinal}`;
}

function rowTitle(row: CalendarRow) {
  return `Report date ${row.reportDate} · listing row ${row.ordinal + 1}`;
}

function units({ unit, currency, scale }: CalendarRow["fields"][CalendarField]) {
  const label = unit === "currency_per_share" ? "Currency per share" : unit === "currency" ? "Monetary amount" : unit;
  return `${label} · Currency ${currency ?? "Unknown"} · Source scale ${scale ?? "Unknown"}`;
}

function chartOptions(row: CalendarRow, measure: ChartMeasure, display: ChartDisplay, theme: "light" | "dark"): EChartsOption {
  const { fields, unit } = measures[measure];
  const color = theme === "dark" ? "#e1e6ef" : "#263044";
  const gridColor = theme === "dark" ? "#424b5d" : "#d8dde6";
  const palette = theme === "dark" ? ["#86b9fc", "#f6a76c"] : ["#1767a9", "#a85b24"];
  const data = fields.flatMap((field, index) => {
    const mark = row.fields[field].mark;
    return mark ? [{
      name: labels[field],
      value: [index, mark.plotValue],
      mark,
      itemStyle: { color: palette[index] },
      tooltip: {
        formatter: `${rowTitle(row)}\nReceipt ${mark.generation} · ordinal ${mark.ordinal} · ${mark.field}\n${labels[field]}: ${mark.exactText}\n${units(row.fields[field])}`,
      },
    }] : [];
  });
  return {
    animation: false,
    textStyle: { color },
    tooltip: { trigger: "item", renderMode: "richText", confine: true },
    grid: { containLabel: true, left: 8, right: 12, top: 30, bottom: 8 },
    xAxis: { type: "category", data: ["Actual", "Estimate"], boundaryGap: true, axisLabel: { color } },
    yAxis: { type: "value", name: unit, axisLabel: { color }, splitLine: { lineStyle: { color: gridColor } } },
    // Keep a reported zero visible at the baseline; missing fields have no data item.
    series: [display === "bar"
      ? { type: "bar", data, encode: { x: 0, y: 1 }, barMaxWidth: 48, barMinHeight: 2 }
      : { type: "scatter", data, encode: { x: 0, y: 1 }, symbolSize: 10 }],
  };
}

function MeasureChart({ row, measure, display }: { row: CalendarRow; measure: ChartMeasure; display: ChartDisplay }) {
  const theme = useThemeStore((state) => state.theme);
  const revision = useRef(0);
  const [failedRevision, setFailedRevision] = useState<number>();
  const request = useMemo(() => ({
    options: chartOptions(row, measure, display, theme),
    revision: ++revision.current,
  }), [row, measure, display, theme]);
  return (
    <figure aria-label={`${measures[measure].unit} chart · ${rowTitle(row)}`}>
      {failedRevision === request.revision && <p role="alert">Chart unavailable. Exact figures are listed below.</p>}
      <EChartsHost {...request} className="h-44 w-full" onError={() => setFailedRevision(request.revision)} />
    </figure>
  );
}

type Inspection = { rowKey: string; field: CalendarField };

type RowProps = {
  row: CalendarRow;
  display: Choices["charts"];
  inspect: (row: CalendarRow, field: CalendarField, button: HTMLButtonElement) => void;
  selection: CalendarField | undefined;
  detail?: ReactNode;
};

function EarningsRow({ row, display, inspect, selection, detail }: RowProps) {
  const headingId = useId();
  return (
    <article aria-labelledby={headingId} className="space-y-2 rounded border border-ds-border p-3">
      <h3 id={headingId} className="body-sm-semibold">{rowTitle(row)}</h3>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3">
        <dt>Last updated</dt><dd>{row.lastUpdated ?? "Unknown"}</dd>
        <dt>Fiscal period</dt><dd>{row.fiscalPeriod === "unknown" ? "Unknown" : row.fiscalPeriod}</dd>
        <dt>Source timezone</dt><dd>{row.timezone === "unknown" ? "Unknown" : row.timezone}</dd>
        <dt>Confirmation status</dt><dd>{row.confirmationStatus === "unknown" ? "Unknown" : row.confirmationStatus}</dd>
      </dl>
      <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
        {measureKeys.map((measure) => (
          <div key={measure} className="min-w-0">
            <h4 className="body-sm-semibold">{measures[measure].unit}</h4>
            {measures[measure].fields.some((field) => row.fields[field].mark !== null) &&
              <MeasureChart row={row} measure={measure} display={display[measure]} />}
            <dl>
              {measures[measure].fields.map((field) => {
                const text = row.fields[field].mark?.exactText ?? "Missing";
                return (
                  <div key={field} className="mb-2">
                    <dt>{labels[field]}</dt>
                    <dd>
                      <button
                        type="button"
                        className={`${controlClass} max-w-full break-all text-left`}
                        aria-label={`${labels[field]} ${text} · ${rowTitle(row)} · inspect source`}
                        aria-expanded={selection === field}
                        onClick={(event) => inspect(row, field, event.currentTarget)}
                      >
                        {text}
                      </button>
                      <p className="text-ds-text-caption">{units(row.fields[field])}</p>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
      {detail}
    </article>
  );
}

function ReceiptTimes({ receipt }: { receipt: CalendarProjection["receipt"] }) {
  return receipt.httpStatus === 204 ? (
    <>
      <dt>Provider retrieval time unavailable</dt><dd />
      <dt>Local response time</dt><dd>{receipt.respondedAt}</dd>
    </>
  ) : (
    <><dt>Provider retrieval time</dt><dd>{receipt.providerRetrievedAt}</dd></>
  );
}

function SourceDetail({ row, field, projection, onClose }: {
  row: CalendarRow; field: CalendarField; projection: CalendarProjection; onClose: () => void;
}) {
  const heading = useId();
  const detail = useRef<HTMLElement>(null);
  useLayoutEffect(() => { detail.current?.focus(); }, [field, row]);
  const observation = row.fields[field];
  const { receipt } = projection;
  const { start_date, end_date } = receipt.scope.query.parameters;
  const endpoint = receipt.httpStatus === 200 ? receipt.evidence.metadata.value.source.endpoint : receipt.scope.route;
  return (
    <section
      ref={detail}
      tabIndex={-1}
      aria-labelledby={heading}
      className="rounded border border-ds-border p-3 focus:outline focus:outline-2"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <h4 id={heading} className="body-sm-semibold">{labels[field]} source · {rowTitle(row)}</h4>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 break-words">
        <dt>Source</dt><dd>FMP · {endpoint}</dd>
        <dt>Listing</dt><dd>{row.symbol}</dd>
        <dt>Report date</dt><dd>{row.reportDate}</dd>
        <dt>Effective calendar window</dt><dd>{start_date} to {end_date} inclusive</dd>
        <dt>Receipt generation</dt><dd>{row.generation}</dd>
        <dt>Listing result ordinal</dt><dd>{row.ordinal}</dd>
        <dt>Source field</dt><dd>{field}</dd>
        <dt>Exact source value</dt><dd className="break-all">{observation.mark?.exactText ?? "Missing"}</dd>
        <dt>Units</dt><dd>{units(observation)}</dd>
        <ReceiptTimes receipt={receipt} />
      </dl>
      <button type="button" className={controlClass} onClick={onClose}>Close source details</button>
    </section>
  );
}

function calendarStatus(state: EarningsProps["state"], projection: CalendarProjection | undefined, symbol: string) {
  switch (state.status) {
    case "idle": return "Awaiting an earnings calendar query.";
    case "pending": return "Loading FMP earnings calendar.";
    case "invalid": return `${state.issue.field} · ${state.issue.bounds}`;
    case "failure": return failureCopy[state.code];
    case "success":
    case "empty": {
      switch (projection?.reason) {
        case "empty_market": return conditions.empty_market;
        case "no_issuer_match": return conditions.no_issuer_match(symbol);
        case "missing_figures": return conditions.missing_figures;
        case null: return "Current FMP earnings calendar.";
        default: return "Current calendar evidence is unavailable.";
      }
    }
  }
}

function CalendarScope({ state, projection, symbol }: Pick<EarningsProps, "state" | "projection" | "symbol">) {
  const dates = "scope" in state ? state.scope.query.parameters : undefined;
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3">
      <dt>Selected listing</dt><dd>{symbol}</dd>
      {dates && <><dt>Effective calendar window</dt><dd>{dates.start_date} to {dates.end_date} inclusive</dd></>}
      <dt>Source-order cap</dt><dd>{projection?.limit ?? 250} matching rows</dd>
      {projection && (
        <>
          <dt>Listing rows returned</dt><dd>{projection.returnedCount}</dd>
          <dt>Listing result</dt><dd>{projection.clipped ? "Clipping observed" : "Clipping not observed"}</dd>
          <dt>Coverage</dt><dd>Provider coverage unknown</dd>
          <ReceiptTimes receipt={projection.receipt} />
        </>
      )}
    </dl>
  );
}

function DisplayControls({ display, onDisplayChange }: Pick<EarningsProps, "display" | "onDisplayChange">) {
  return (
    <div className="flex flex-wrap gap-3">
      {measureKeys.map((measure) => (
        <label key={measure} className="flex items-center gap-2">
          {measures[measure].title} chart display
          <select
            className={controlClass}
            value={display[measure]}
            onChange={(event) => onDisplayChange(measure, event.target.value === "point" ? "point" : "bar")}
          >
            <option value="bar">Bar</option>
            <option value="point">Point</option>
          </select>
        </label>
      ))}
    </div>
  );
}

export function Earnings({ state, projection, symbol, display, onDisplayChange, onRetry }: EarningsProps) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>();
  const [inspection, setInspection] = useState<Inspection>();
  const current = projection && projection.receipt === state && projection.symbol === symbol ? projection : undefined;
  const selectedRow = current?.rows.find((row) => inspection?.rowKey === rowKey(row));

  useLayoutEffect(() => {
    if (selectedRow || !trigger.current) return;
    const invoker = trigger.current;
    trigger.current = undefined;
    const activeElement = document.activeElement;
    if (activeElement === document.body || activeElement === invoker) {
      (invoker.isConnected ? invoker : heading.current)?.focus();
    }
    setInspection(undefined);
  }, [selectedRow]);

  function inspect(row: CalendarRow, field: CalendarField, button: HTMLButtonElement) {
    trigger.current = button;
    setInspection({ rowKey: rowKey(row), field });
  }

  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} ref={heading} tabIndex={-1} className="body-md-semibold focus:outline focus:outline-2">FMP earnings calendar</h2>
      <CalendarScope state={state} projection={current} symbol={symbol} />
      <p role="status">{calendarStatus(state, current, symbol)}</p>
      {state.status === "failure" && state.retryable && (
        <button type="button" className={controlClass} onClick={onRetry}>Retry FMP earnings calendar</button>
      )}
      <DisplayControls display={display} onDisplayChange={onDisplayChange} />
      {current?.rows.map((row) => (
        <EarningsRow
          key={rowKey(row)}
          row={row}
          display={display}
          inspect={inspect}
          selection={selectedRow === row ? inspection?.field : undefined}
          detail={selectedRow === row && inspection && (
            <SourceDetail row={row} field={inspection.field} projection={current} onClose={() => setInspection(undefined)} />
          )}
        />
      ))}
    </section>
  );
}
