import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { init } from "echarts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EChartsHostProps } from "~/components/General/Table/Chart/echarts/EChartsHost";
import { Earnings, type EarningsProps } from "~/components/Widgets/EventsDocuments/Earnings";
import { parseFinancialEvidence } from "~/lib/companyResearch/financialEnvelope";
import { projectCalendar } from "~/lib/eventsDocuments/calendar";
import type { BodyReceipt, CalendarTokens, KnownEvidence, Scope } from "~/lib/eventsDocuments/reader";

const harness = vi.hoisted(() => ({ theme: "light", chart: vi.fn<(request: EChartsHostProps) => void>() }));
vi.mock("~/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: (props: EChartsHostProps) => {
    harness.chart(props);
    return <div />;
  },
}));
vi.mock("~/lib/state/theme", () => ({
  useThemeStore: (select: (state: { theme: string }) => string) => select({ theme: harness.theme }),
}));

const retrievedAt = "2026-11-22T11:58:52.123456Z";
const reportDate = "2026-11-19";
const lastUpdated = "2026-11-20T11:13:00.123456";
const scope: Scope<"calendar"> = {
  query: { slot: "calendar", parameters: { provider: "fmp", symbol: "AAPL", start_date: "2026-11-16", end_date: "2026-11-22" } },
  provider: "fmp", dataset: "earnings_calendar_fmp", route: "equity/calendar/earnings", generation: 3,
};
const row = { symbol: "AAPL", report_date: reportDate, last_updated: lastUpdated };
const other = { ...row, symbol: "MSFT", eps_actual: 14 };
const tokens = {
  0: { eps_actual: "14" }, 1: { eps_actual: "0", revenue_actual: "9007199254740993" },
  2: { eps_consensus: "-1.5000", revenue_consensus: "2e+08" },
};
const rows = [
  other,
  { ...row, eps_actual: 0, eps_consensus: null, revenue_actual: Number("9007199254740993") },
  { ...row, eps_consensus: -1.5, revenue_consensus: 2e8, fiscal_period: "Q3", source_timezone: "US/Eastern", confirmation_status: "confirmed" },
];

function receipt(results: Record<string, unknown>[] = rows, clipped = true, exact: CalendarTokens = tokens): BodyReceipt<KnownEvidence, "calendar"> {
  const evidence = parseFinancialEvidence("earnings", { results, extra: { results_metadata: { __qopenbb_financial__: {
    schema_version: 1, provider: "fmp", dataset: scope.dataset, source: { endpoint: scope.route },
    retrieved_at: retrievedAt, effective_query: scope.query.parameters,
    bounds: { requested_limit: 250, effective_limit: 250, returned_count: results.length, truncated: clipped || null, completeness: clipped ? "partial" : "unknown" },
    fields: {
      eps_actual: { definition: "Actual EPS", unit: "currency_per_share" },
      revenue_actual: { definition: "Actual revenue", unit: "currency", scale: 1000, currency: "JPY" },
    },
  } } } });
  if (evidence.metadata.status !== "known") throw new Error("Invalid evidence fixture");
  return {
    status: results.length ? "success" : "empty", httpStatus: 200, scope, providerRetrievedAt: retrievedAt,
    evidence: { ...evidence, metadata: evidence.metadata }, tokens: exact,
  };
}

function props(state: EarningsProps["state"] = receipt(), symbol = "AAPL"): EarningsProps {
  return {
    state, symbol, display: { eps: "bar", revenue: "point" },
    projection: "providerRetrievedAt" in state ? projectCalendar(state, symbol) : undefined,
    onDisplayChange: vi.fn(), onRetry: vi.fn(),
  };
}

afterEach(() => { cleanup(); harness.chart.mockClear(); vi.restoreAllMocks(); });

describe("Events and Documents earnings calendar", () => {
  it.each(["light", "dark"])("renders attributed chart marks and exact accessible source text in %s", async (theme) => {
    harness.theme = theme;
    const user = userEvent.setup();
    render(<Earnings {...props()} />);
    const region = screen.getByRole("region", { name: "FMP earnings calendar" });
    expect(region).toHaveTextContent(/2026-11-16.*2026-11-22/);
    expect(region).toHaveTextContent(/Listing rows returned.*3/);
    expect(region).toHaveTextContent(/Source-order cap.*250/);
    expect(region).toHaveTextContent(/Clipping observed/);
    expect(region).toHaveTextContent(retrievedAt);
    const articles = within(region).getAllByRole("article");
    expect(articles).toHaveLength(2);
    expect(articles[0]).toHaveAccessibleName(/2026-11-19.*row 2/);
    expect(articles[1]).toHaveAccessibleName(/2026-11-19.*row 3/);
    expect(articles[0]).toHaveTextContent(lastUpdated);
    expect(articles[0]).toHaveTextContent(/Fiscal period.*Unknown.*Source timezone.*Unknown.*Confirmation status.*Unknown/);
    expect(articles[1]).toHaveTextContent(/Fiscal period.*Q3.*Source timezone.*US\/Eastern.*Confirmation status.*confirmed/);
    expect(articles[0]).toHaveTextContent(/Estimated EPS.*Missing/);
    expect(articles[0]).toHaveTextContent(/Estimated revenue.*Missing/);
    expect(articles[0]).toHaveTextContent(/JPY.*1000/);
    const charts = harness.chart.mock.calls.map(([request]) => request.options);
    expect(charts).toHaveLength(4);
    expect(charts.flatMap((option) => option.series)).toMatchObject([
      { type: "bar", data: [{ value: [0, 0], mark: { generation: 3, ordinal: 1, field: "eps_actual", exactText: "0" } }] },
      { type: "scatter", data: [{ value: [0, 9007199254740992], mark: { generation: 3, ordinal: 1, field: "revenue_actual", exactText: "9007199254740993" } }] },
      { type: "bar", data: [{ value: [1, -1.5], mark: { generation: 3, ordinal: 2, field: "eps_consensus", exactText: "-1.5000" } }] },
      { type: "scatter", data: [{ value: [1, 2e8], mark: { generation: 3, ordinal: 2, field: "revenue_consensus", exactText: "2e+08" } }] },
    ]);
    expect(charts[0].yAxis).toMatchObject({ name: "EPS per share" });
    expect(charts[1].yAxis).toMatchObject({ name: "Revenue (monetary amount)" });
    expect(charts[0].textStyle?.color).toBe(theme === "dark" ? "#e1e6ef" : "#263044");

    const trigger = within(articles[0]).getByRole("button", { name: /Actual revenue.*9007199254740993.*row 2/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const detail = screen.getByRole("region", { name: /Actual revenue source/ });
    expect(detail).toHaveFocus();
    expect(detail).toHaveTextContent(/Receipt generation.*3.*Listing result ordinal.*1.*Source field.*revenue_actual.*Exact source value.*9007199254740993/);
    expect(detail).toHaveTextContent(retrievedAt);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(detail).not.toBeInTheDocument();
  });

  it("renders visible ECharts bars and points, including zero, without fabricating missing marks", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<Earnings {...props()} />);
    const requests = harness.chart.mock.calls.map(([request]) => request);
    for (const { options } of requests) {
      const chart = init(null, undefined, { renderer: "svg", ssr: true, width: 500, height: 176 });
      try {
        chart.setOption(options);
        const svg = new DOMParser().parseFromString(chart.renderToSVGString(), "image/svg+xml");
        expect(svg.querySelectorAll('[ecmeta_ssr_type="chart"]')).toHaveLength(1);
      } finally {
        chart.dispose();
      }
    }
  });

  it("changes each display independently and returns focus to the heading when a row disappears", async () => {
    const user = userEvent.setup();
    const current = props();
    const { rerender } = render(<Earnings {...current} />);
    await user.selectOptions(screen.getByLabelText("EPS chart display"), "point");
    expect(current.onDisplayChange).toHaveBeenCalledExactlyOnceWith("eps", "point");
    rerender(<Earnings {...current} display={{ ...current.display, eps: "point" }} />);
    const updatedCharts = harness.chart.mock.calls.slice(-4).map(([request]) => request.options);
    expect(updatedCharts.flatMap((option) => option.series)).toMatchObject([
      { type: "scatter" }, { type: "scatter" }, { type: "scatter" }, { type: "scatter" },
    ]);
    expect(updatedCharts[0].yAxis).toMatchObject({ name: "EPS per share" });
    expect(updatedCharts[1].yAxis).toMatchObject({ name: "Revenue (monetary amount)" });
    await user.selectOptions(screen.getByLabelText("Revenue chart display"), "bar");
    expect(current.onDisplayChange).toHaveBeenLastCalledWith("revenue", "bar");

    const trigger = screen.getByRole("button", { name: /Actual EPS.*0.*row 2/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    rerender(<Earnings {...props({ status: "pending", scope }, "MSFT")} projection={current.projection} />);
    expect(screen.getByRole("heading", { name: "FMP earnings calendar" })).toHaveFocus();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Loading FMP earnings/);

    rerender(<Earnings {...current} />);
    screen.getByRole("button", { name: /Actual EPS.*0.*row 2/ }).focus();
    await user.keyboard("{Enter}");
    const displayControl = screen.getByLabelText("EPS chart display");
    displayControl.focus();
    rerender(<Earnings {...props({ status: "pending", scope }, "MSFT")} />);
    expect(displayControl).toHaveFocus();
  });

  it("distinguishes independent calendar conditions, unavailable times, and retryable failures", async () => {
    const user = userEvent.setup();
    const empty: EarningsProps["state"] = { status: "empty", httpStatus: 204, scope, providerRetrievedAt: null, respondedAt: retrievedAt };
    const { rerender } = render(<Earnings {...props(empty)} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Empty market calendar/);
    expect(screen.getByText("Provider retrieval time unavailable")).toBeInTheDocument();
    expect(screen.getByText("Local response time")).toBeInTheDocument();
    expect(screen.getByText("Provider coverage unknown")).toBeInTheDocument();

    rerender(<Earnings {...props(receipt([], false, {}))} />);
    expect(screen.getByRole("status")).toHaveTextContent(/FMP returned no calendar rows for AAPL/);
    expect(screen.queryByText("Local response time")).not.toBeInTheDocument();
    expect(screen.getByText(retrievedAt)).toBeInTheDocument();

    rerender(<Earnings {...props(receipt([other], false))} />);
    expect(screen.getByRole("status")).toHaveTextContent(/FMP returned no calendar rows for AAPL/);
    rerender(<Earnings {...props(receipt([row], false, {}))} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Matching rows have no reported figures/);
    expect(screen.getAllByText("Missing")).toHaveLength(4);
    expect(screen.getByRole("article")).toBeInTheDocument();
    expect(harness.chart).not.toHaveBeenCalled();
    const missing = screen.getByRole("button", { name: /Estimated EPS Missing/ });
    missing.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("region", { name: /Estimated EPS source/ }))
      .toHaveTextContent(/eps_consensus.*Exact source value.*Missing/);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(missing).toHaveFocus();

    const failed = props({ status: "failure", scope, code: "timeout", retryable: true, httpStatus: 400 });
    rerender(<Earnings {...failed} />);
    expect(screen.getByRole("status")).toHaveTextContent(/timed out/);
    await user.click(screen.getByRole("button", { name: "Retry FMP earnings calendar" }));
    expect(failed.onRetry).toHaveBeenCalledOnce();
    rerender(<Earnings {...props({ status: "invalid", issue: { field: "end_date", bounds: "At most seven days" } })} />);
    expect(screen.getByRole("status")).toHaveTextContent(/end_date.*At most seven days/);
  });
});
