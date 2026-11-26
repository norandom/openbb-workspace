import { type StorySide, storySides } from "~/lib/modeling/storyContract";
import { type StoryEvidence, storyVerdict } from "~/lib/modeling/storyEvidence";
import type {
  StoryChartLane,
  StoryCharts,
  StoryChartView,
  StoryState,
} from "~/lib/modeling/storyState";
import { type ChartSeries, ResearchStoryChart } from "./ResearchStoryChart";
import {
  DatedEvidence,
  displayDecimal,
  EvidenceFinding,
  ExactAmount,
  legFailureText,
  percentagePoints,
  ratioPercent,
  resultPoints,
  WindowDetails,
} from "./ResearchStoryEvidence";

type ChartOwner = {
  charts: StoryCharts;
  readOnly: boolean;
  setChart: (
    view: StoryChartView,
    lane: StoryChartLane,
    change: {
      chart_type?: "line" | "bar";
      series?: string[];
    },
  ) => void;
};
type FindingProps = ChartOwner & { evidence: StoryEvidence };

const percent = (value: string) => `${value}%`;
const displayPercent = (value: string) => percent(displayDecimal(value));
const displaySpread = (value: string) => percentagePoints(displayDecimal(value));
const chartLabels = {
  returns: "Price returns",
  risk: "Realized volatility",
  real_yields: "Real yields",
};
const lanes = ["input", "result"] as const;

function FindingCharts({
  view,
  series,
  captions,
  owner,
}: {
  view: StoryChartView;
  series: Record<StoryChartLane, ChartSeries[]>;
  captions: Record<StoryChartLane, string>;
  owner: ChartOwner;
}) {
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {lanes.map((lane) => (
        <ResearchStoryChart
          key={lane}
          label={`${chartLabels[view]} ${lane} chart`}
          caption={captions[lane]}
          config={owner.charts[view][lane]}
          series={series[lane]}
          readOnly={owner.readOnly}
          onChange={(change) => owner.setChart(view, lane, change)}
        />
      ))}
    </div>
  );
}

function proxyLeg(evidence: StoryEvidence, side: StorySide, risk: boolean) {
  const symbol =
    side === "left"
      ? evidence.selection.commodity_symbol
      : evidence.selection.technology_symbol;
  const source = evidence.priceSource?.legs.find((leg) => leg.side === side);
  const resultId = side + (risk ? "_volatility" : "_momentum");
  const inputId = side + (risk ? "_daily_return" : "_close");
  const output = evidence.outputs[resultId];
  const rows = risk
    ? (output?.dailyReturns ?? []).map((item) => [
        item.period_end ?? "",
        ratioPercent(item.value),
        item.period_start ?? "",
      ])
    : (output?.rows ?? [])
        .filter((row) => row.table_id === `${side}_closes` && row.value !== null)
        .map((row) => [row.observation_date, row.value!]);
  return {
    symbol,
    source,
    output,
    rows,
    input: {
      id: inputId,
      label: symbol,
      points: rows.map(([date, value]) => ({
        label: date,
        value: risk ? value.slice(0, -1) : value,
        display: risk ? value : `${value} USD`,
      })),
    },
    result: {
      id: resultId,
      label: symbol,
      points: resultPoints(symbol, output, percent),
    },
  };
}

function ProxyEvidence({
  leg,
  risk,
}: {
  leg: ReturnType<typeof proxyLeg>;
  risk: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <EvidenceFinding
        label={leg.symbol}
        output={leg.output}
        format={displayPercent}
        exact={percent}
      />
      {leg.source?.retrievedAt && (
        <p>
          {leg.symbol} historical closes as retrieved from FMP at{" "}
          <time>{leg.source.retrievedAt}</time>.
        </p>
      )}
      {leg.source?.failure && <p>{legFailureText[leg.source.failure]}</p>}
      {leg.rows.length > 0 && (
        <p>
          {leg.rows.length} {risk ? "daily simple returns" : "session closes"}. Dates{" "}
          {leg.rows[0][0]} to {leg.rows.at(-1)?.[0]}.
          {!risk && (
            <>
              {" "}
              Opening endpoint {leg.rows[0][1]} USD · Closing endpoint{" "}
              {leg.rows.at(-1)?.[1]} USD.
            </>
          )}
        </p>
      )}
      <DatedEvidence
        label={leg.symbol + (risk ? " daily simple returns" : " session closes")}
        columns={
          risk
            ? ["Ending session", "Simple return (%)", "Starting session"]
            : ["Session date", "Close (USD)"]
        }
        rows={leg.rows}
      />
    </div>
  );
}

export function ProxyFindings({
  evidence,
  view,
  ...owner
}: FindingProps & { view: "returns" | "risk" }) {
  const risk = view === "risk";
  const legs = storySides.map((side) => proxyLeg(evidence, side, risk));
  const captionSource = `${legs.map(({ symbol }) => symbol).join(" and ")} · FMP`;
  return (
    <>
      <WindowDetails evidence={evidence} />
      <p>
        {risk
          ? "Annualized realized volatility from 63 daily simple returns."
          : "Split-adjusted price returns in percent. Dividends excluded."}{" "}
        Freshness follows the saved FMP retrieval for each leg. Historical publication
        and vintage are unknown.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {legs.map((leg) => (
          <ProxyEvidence key={leg.symbol} leg={leg} risk={risk} />
        ))}
      </div>
      {!risk && (
        <EvidenceFinding
          label="Spread (commodity minus technology)"
          output={evidence.outputs.momentum_spread}
          format={displaySpread}
          exact={percentagePoints}
        />
      )}
      <FindingCharts
        view={view}
        owner={owner}
        captions={{
          input: `${risk ? "Daily simple returns" : "Split-adjusted closes"} · ${captionSource}`,
          result: `${risk ? "Annualized realized volatility" : "Split-adjusted price returns"} · ${captionSource}`,
        }}
        series={{
          input: legs.map((leg) => leg.input),
          result: legs.map((leg) => leg.result),
        }}
      />
    </>
  );
}

export const fredNotice =
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

export function MacroFindings({ evidence, ...owner }: FindingProps) {
  const { window, availableMacroRows, outputs, source, cutoff } = evidence;
  const rows = [...availableMacroRows].sort((a, b) =>
    a.observation_date.localeCompare(b.observation_date),
  );
  const missing = window
    ? [window.start, window.end].filter(
        (date) => !rows.some((row) => row.observation_date === date),
      )
    : [];
  const period = window
    ? `${window.start} to ${window.end}`
    : evidence.selection.observation_date;
  return (
    <>
      <WindowDetails evidence={evidence} />
      <p>
        Freshness follows the saved FRED retrieval at <time>{source.retrieved_at}</time>
        . Treasury constant-maturity real yield. Exact window endpoints must be
        available by the selected observation day cutoff in {cutoff.session_timezone},
        expressed in UTC as <time>{cutoff.decision_at}</time>.
      </p>
      <EvidenceFinding label="DFII10 regime" output={outputs.regime} />
      <EvidenceFinding
        label="Real yield change"
        output={outputs.change}
        format={displaySpread}
        exact={percentagePoints}
      />
      {missing.length > 0 && (
        <p>
          Unavailable DFII10 {missing.length === 1 ? "endpoint" : "endpoints"} by cutoff
          · {missing.join(", ")}.
        </p>
      )}
      {rows.length > 0 && (
        <ul>
          {rows.map((row) => (
            <li key={row.record_id}>
              DFII10 on {row.observation_date} · {percent(row.value!)}
            </li>
          ))}
        </ul>
      )}
      <DatedEvidence
        label="DFII10 endpoint rows"
        columns={["Observation date", "Real yield (%)", "Published at", "Vintage at"]}
        rows={rows.map((row) => [
          row.observation_date,
          percent(row.value!),
          row.published_at ?? "Unavailable",
          row.vintage_at ?? "Unavailable",
        ])}
      />
      <FindingCharts
        view="real_yields"
        owner={owner}
        captions={{
          input:
            "DFII10 endpoints · Board of Governors of the Federal Reserve System via FRED",
          result:
            "DFII10 endpoint change · Board of Governors of the Federal Reserve System via FRED",
        }}
        series={{
          input: [
            {
              id: "dfii10",
              label: "DFII10",
              points: rows.map((row) => ({
                label: row.observation_date,
                value: row.value!,
                display: percent(row.value!),
              })),
            },
          ],
          result: [
            {
              id: "change",
              label: "Real yield change",
              points: resultPoints(period, outputs.change, percentagePoints),
            },
          ],
        }}
      />
    </>
  );
}

export function VerdictFinding({
  evidence,
  pending,
  selection,
  error,
}: {
  evidence?: StoryEvidence;
  pending: boolean;
  selection: StoryState["selection"];
  error?: string | null;
}) {
  if (pending) return <p role="status">Pending verified price-return spread…</p>;
  const result = storyVerdict(evidence);
  const {
    commodity_symbol: commodity,
    technology_symbol: technology,
    observation_date: date,
  } = selection;
  const window = evidence?.window;
  const period = window
    ? `${window.start} to ${window.end}`
    : `observation date ${date}`;
  if (result.verdict === "insufficient_data") {
    const affected = evidence?.priceSource?.legs
      .filter(({ side }) => evidence.outputs[`${side}_momentum`]?.status !== "verified")
      .map(({ symbol }) => symbol);
    return (
      <p role="status">
        <strong>Insufficient data.</strong> {commodity} and {technology} · {period}.{" "}
        {error ?? result.reason}
        {Boolean(affected?.length) && (
          <> Affected price evidence · {affected?.join(", ")}.</>
        )}
      </p>
    );
  }
  const outcome =
    result.verdict === "tie"
      ? "The proxies tied."
      : result.verdict === "supported"
        ? `${commodity} outperformed ${technology}.`
        : `${technology} outperformed ${commodity}.`;
  return (
    <div role="status">
      <p>
        <strong>
          {result.verdict === "supported" ? "Supported." : "Not supported."}
        </strong>{" "}
        {outcome} {commodity} and {technology} · {period}. Realized price-return spread
        (commodity minus technology){" "}
        <ExactAmount
          exact={percentagePoints(result.spread!)}
          display={displaySpread(result.spread!)}
        />
        .
      </p>
      {result.higherRiskWinner && (
        <p>
          {result.verdict === "supported" ? commodity : technology} also had higher
          realized volatility.
        </p>
      )}
    </div>
  );
}
