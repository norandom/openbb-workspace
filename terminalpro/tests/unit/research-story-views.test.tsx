import { readFileSync } from "node:fs";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchStoryViews } from "~/components/Widgets/ResearchStoryViews";
import {
  decodeStoryRun,
  type StoryBinding,
  type StoryRun,
} from "~/lib/modeling/storyContract";
import type { StoryControllerSnapshot } from "~/lib/modeling/storyController";
import { createStoryState } from "~/lib/modeling/storyState";

vi.mock("~/components/General/Table/Chart/echarts/EChartsHost", () => ({
  EChartsHost: ({ options }: { options: unknown }) => (
    <div data-testid="chart-option">{JSON.stringify(options)}</div>
  ),
}));
afterEach(cleanup);

function pendingSnapshot(): StoryControllerSnapshot {
  const step = {
    status: "pending",
    run: null,
    canRetry: false,
    message: null,
  } as const;
  return { saved: createStoryState(), steps: { comparison: step, regime: step } };
}

it("clears the previous verdict and announces pending evidence", () => {
  render(
    <ResearchStoryViews
      snapshot={pendingSnapshot()}
      setCharts={vi.fn()}
      retry={vi.fn()}
      readOnly={false}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "Price returns from FMP" }),
  ).toBeInTheDocument();
  const verdict = screen.getByRole("region", { name: "Verdict" });
  expect(within(verdict).getByRole("status")).toHaveTextContent("Pending");
  expect(verdict).not.toHaveTextContent("Insufficient data");
});

const fixturePath = process.env.QOPENBB_STORY_WIRE_FIXTURE;
const binding: StoryBinding = {
  selection: {
    commodity_symbol: "DBC",
    technology_symbol: "XLK",
    observation_date: "2024-04-03",
  },
  schedule: {
    calendar_id: "NYSE_ARCA",
    schedule_revision: "synthetic-nyse-arca.2024r1",
  },
  cutoff: {
    observation_date: "2024-04-03",
    decision_at: "2024-04-04T03:59:59.999999Z",
    evaluated_at: "2024-05-03T16:00:00Z",
    session_timezone: "America/New_York",
  },
};

describe.runIf(Boolean(fixturePath))("installed dated evidence", () => {
  const { runs } = fixturePath
    ? (JSON.parse(readFileSync(fixturePath, "utf8")) as {
        runs: Record<string, StoryRun>;
      })
    : { runs: {} };
  function renderRuns(comparisonKey = "comparison", regimeKey = "regime") {
    const snapshot = pendingSnapshot();
    snapshot.saved = { ...snapshot.saved, ...binding };
    const comparison = decodeStoryRun(
      runs[comparisonKey],
      "comparison",
      binding,
      runs[comparisonKey].run_id,
    );
    expect(comparison).toBeDefined();
    snapshot.steps.comparison = {
      status: "ready",
      run: comparison!,
      canRetry: false,
      message: null,
    };
    const regime = decodeStoryRun(
      runs[regimeKey],
      "regime",
      binding,
      runs[regimeKey].run_id,
    );
    expect(regime).toBeDefined();
    snapshot.steps.regime = {
      status: "ready",
      run: regime!,
      canRetry: false,
      message: null,
    };
    const setCharts = vi.fn();
    return {
      snapshot,
      setCharts,
      ...render(
        <ResearchStoryViews
          snapshot={snapshot}
          setCharts={setCharts}
          retry={vi.fn()}
          readOnly={false}
        />,
      ),
    };
  }

  it("shows both legs and supports keyboard-native chart preferences independently", () => {
    const { snapshot, setCharts, rerender } = renderRuns();
    expect(screen.getByRole("region", { name: "Verdict" })).toHaveTextContent(
      "Supported",
    );
    expect(
      screen.getByText("DBC also had higher realized volatility."),
    ).toBeInTheDocument();
    for (const symbol of ["DBC", "XLK"]) {
      fireEvent.click(
        screen.getByText(`${symbol} session closes`, { selector: "summary" }),
      );
      fireEvent.click(
        screen.getByText(`${symbol} daily simple returns`, { selector: "summary" }),
      );
      expect(
        within(
          screen.getByRole("table", { name: `${symbol} session closes` }),
        ).getAllByRole("row"),
      ).toHaveLength(65);
      expect(
        within(
          screen.getByRole("table", { name: `${symbol} daily simple returns` }),
        ).getAllByRole("row"),
      ).toHaveLength(64);
    }
    expect(
      within(
        screen.getByRole("table", { name: "DBC daily simple returns" }),
      ).getAllByRole("cell")[0],
    ).toHaveTextContent("20%");
    fireEvent.change(screen.getByLabelText("Price returns input chart type"), {
      target: { value: "bar" },
    });
    const charts = setCharts.mock.calls[0][0];
    expect(charts.returns.input).toMatchObject({
      chart_type: "bar",
      x_axis: "date",
      y_axis: "price_usd",
    });
    expect(charts.returns.result).toEqual(snapshot.saved.charts.returns.result);
    snapshot.saved = { ...snapshot.saved, charts };
    rerender(
      <ResearchStoryViews
        snapshot={snapshot}
        setCharts={setCharts}
        retry={vi.fn()}
        readOnly={false}
      />,
    );
    expect(screen.getByLabelText("Price returns input chart type")).toHaveValue("bar");
    const figure = within(
      screen.getByRole("figure", { name: "Price returns input chart" }),
    );
    expect(JSON.parse(figure.getByTestId("chart-option").textContent!)).toMatchObject({
      series: [{ type: "bar" }, { type: "bar" }],
    });
  });

  it("shows the verified exact endpoints and real-yield change", () => {
    renderRuns();
    expect(
      screen.getByText("Real yield change", { selector: "strong" }).parentElement,
    ).toHaveTextContent("+0.25 pp");
    expect(screen.getByText(/This product uses the FRED® API/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("DFII10 endpoint rows", { selector: "summary" }));
    const table = within(screen.getByRole("table", { name: "DFII10 endpoint rows" }));
    expect(table.getAllByRole("row")).toHaveLength(3);
    expect(table.getByText("2024-04-03")).toBeInTheDocument();
    expect(table.getByText("1.75%")).toBeInTheDocument();
  });

  it("retains the exact negative verdict with a dated macro endpoint unavailable", () => {
    renderRuns("tiny_negative", "unavailable_macro");
    const verdict = screen.getByRole("region", { name: "Verdict" });
    expect(verdict).toHaveTextContent("Not supported. XLK outperformed DBC.");
    expect(verdict).toHaveTextContent("-0.00000000000000000001 pp");
    expect(
      screen.getByText("Unavailable DFII10 endpoint by cutoff · 2024-04-03."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("DFII10 endpoint rows", { selector: "summary" }));
    const table = within(screen.getByRole("table", { name: "DFII10 endpoint rows" }));
    expect(table.getAllByRole("row")).toHaveLength(2);
    expect(table.queryByText("2024-04-03")).not.toBeInTheDocument();
  });

  it("retains the available leg when the other leg has a provider failure", () => {
    renderRuns("failed_leg");
    expect(screen.getByRole("region", { name: "Verdict" })).toHaveTextContent(
      /Insufficient data.*Affected price evidence · XLK/,
    );
    const returns = within(
      screen.getByRole("region", { name: "Price returns from FMP" }),
    );
    expect(
      returns.getByText("The FMP plan does not grant access to this history."),
    ).toBeInTheDocument();
    expect(
      returns.getByText("DBC session closes", { selector: "summary" }),
    ).toBeInTheDocument();
    expect(
      returns.queryByText("XLK session closes", { selector: "summary" }),
    ).not.toBeInTheDocument();
  });
});
