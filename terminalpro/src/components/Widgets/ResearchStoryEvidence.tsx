import { useId } from "react";
import { exactDecimalSign, type StoryLegFailure } from "~/lib/modeling/storyContract";
import type { StoryEvidence, StoryOutputEvidence } from "~/lib/modeling/storyEvidence";
import type { ChartPoint } from "./ResearchStoryChart";

type TableProps = { label: string; columns: string[]; rows: string[][] };

export const legFailureText: Record<StoryLegFailure, string> = {
  missing_data: "FMP history is missing for this window.",
  upstream: "The FMP service was unavailable.",
  entitlement: "The FMP plan does not grant access to this history.",
  invalid_response: "FMP returned an invalid history response.",
  timeout: "The FMP request timed out.",
  throttling: "FMP rate limited the history request.",
};

export function DatedEvidence({ label, columns, rows }: TableProps) {
  const title = useId();
  if (!rows.length) return null;
  return (
    <details className="min-w-0 rounded border border-ds-border px-2 py-1">
      <summary className="cursor-pointer body-sm-semibold">{label}</summary>
      <div
        role="region"
        aria-labelledby={title}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: The scroll region needs a separate keyboard tab stop.
        tabIndex={0}
        className="max-h-64 overflow-auto"
      >
        <table className="w-full text-left text-sm">
          <caption id={title} className="sr-only">
            {label}
          </caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="p-1">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]}>
                <th scope="row" className="p-1 font-normal tabular-nums">
                  {row[0]}
                </th>
                {row.slice(1).map((cell, index) => (
                  <td key={columns[index + 1]} className="break-all p-1 tabular-nums">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// A simple return is stored as a ratio. Shift its decimal exponent to preserve the source precision.
export function ratioPercent(value: string) {
  const [mantissa, exponent = "0"] = value.toLowerCase().split("e");
  const power = BigInt(exponent) + 2n;
  const [whole, fraction = ""] = mantissa.replace(/^[+-]/u, "").split(".");
  const digits = whole + fraction;
  const decimal = BigInt(whole.length) + power;
  const sign = mantissa.startsWith("-") ? "-" : "";
  if (decimal > 100n || decimal < -100n) return `${mantissa}e${power}%`;
  const position = Number(decimal);
  const percent =
    position <= 0
      ? `0.${"0".repeat(-position)}${digits}`
      : `${digits.padEnd(position, "0").slice(0, position)}.${digits.slice(position)}`;
  return (
    sign +
    percent
      .replace(/^0+(?=\d)/u, "")
      .replace(/(\.\d*?)0+$/u, "$1")
      .replace(/\.$/u, "") +
    "%"
  );
}

const displayNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  useGrouping: false,
});

export function displayDecimal(value: string) {
  const number = Number(value);
  const rounded = displayNumber.format(number);
  if (
    !Number.isFinite(number) ||
    (Number(rounded) === 0 && exactDecimalSign(value) !== 0)
  )
    return value;
  return rounded;
}

export function percentagePoints(value: string) {
  return `${(exactDecimalSign(value) === 1 && !value.startsWith("+") ? "+" : "") + value} pp`;
}

export function ExactAmount({ exact, display }: { exact: string; display: string }) {
  if (exact === display) return <>{display}</>;
  return (
    <span className="break-all" title={exact}>
      {display}
      <span className="sr-only"> (exact {exact})</span>
    </span>
  );
}

export function resultPoints(
  label: string,
  output: StoryOutputEvidence | undefined,
  display: (value: string) => string,
): ChartPoint[] {
  if (output?.status !== "verified" || output.value === null) return [];
  return [{ label, value: output.value, display: display(output.value) }];
}

export function WindowDetails({ evidence }: { evidence: StoryEvidence }) {
  return (
    <p>
      Observation date {evidence.selection.observation_date}.{" "}
      {evidence.window && (
        <>
          Window {evidence.window.start} to {evidence.window.end}.{" "}
          {evidence.window.observationCount} trading-session dates in the window.{" "}
        </>
      )}
      Calendar {evidence.schedule.calendar_id}, revision{" "}
      {evidence.schedule.schedule_revision}.
    </p>
  );
}

export function EvidenceFinding({
  label,
  output,
  format = (value) => value,
  exact = format,
}: {
  label: string;
  output?: StoryOutputEvidence;
  format?: (value: string) => string;
  exact?: (value: string) => string;
}) {
  return (
    <div>
      <p>
        <strong>{label}</strong>
        {" · "}
        {output?.value !== null && output?.value !== undefined ? (
          <ExactAmount exact={exact(output.value)} display={format(output.value)} />
        ) : (
          "Unavailable"
        )}
      </p>
      <p>
        {output?.status === "verified"
          ? "Verified against the independent reference."
          : output?.status === "withheld"
            ? "Result withheld."
            : output
              ? "Result could not be verified."
              : "Result unavailable."}
        {output?.reason && <> {output.reason}</>}
      </p>
      {Boolean(output?.checks.length) && (
        <details>
          <summary className="cursor-pointer">Model checks for {label}</summary>
          <ul>
            {output?.checks.map((check) => (
              <li key={check.rule_id}>
                {check.rule_id} · {check.status}
                {check.explanation && ` · ${check.explanation}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
