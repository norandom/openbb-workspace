import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChartArtifact } from "~/components/AI/artifacts/ChartArtifact";

const fixture = vi.hoisted(() => ({ options: undefined as any }));
vi.mock("ag-charts-react", () => ({ AgCharts: ({ options }: any) => { fixture.options = options; return <div data-testid="community-chart">{options.data.map((r: any) => `${r.date}:${r.income ?? "missing"}`).join(",")}</div>; } }));
vi.mock("~/lib/state/theme", () => ({ useShallowThemeStore: (select: any) => select({ theme: "light", decimalDigits: 3 }) }));
vi.mock("~/lib/state/copilot", () => ({ useShallowCopilotStore: (select: any) => select({}) }));
vi.mock("~/lib/state/walkthrough", () => ({ useWalkthroughStore: { setState: vi.fn() } }));
vi.mock("~/components/AI/artifacts/ArtifactShared", () => ({ ArtifactActions: () => null }));
vi.mock("~/components/General/Table/Chart/themes", () => ({ useAgThemes: () => ({ customChartThemes: { light: {} }, chartThemes: ["light"] }) }));
vi.mock("~/components/General/Table/AgGridUtils", () => ({ convertToReadableLabel: String, isDate: () => false, isDateTime: () => false }));
vi.mock("~/lib/constants", () => ({ CHART_TYPE_TO_SERIES_TYPE: {} }));
vi.mock("~/lib/utils", () => ({ formatNumber: (v: number, digits: number) => v.toFixed(digits), formatNumberMagnitude: String }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => ({ widget: {} }) }));
afterEach(() => { cleanup(); fixture.options = undefined; });

it("rejects unsupported chart artifacts and recovers without mutating saved rows or parameters", () => {
  const artifact = { type: "chart", name: "Income", content: [{ date: "2025-12-31", income: null }, { date: "2026-01-01", income: 0 }], chart_params: { chartType: "waterfall", xKey: "date", yKey: ["income"] } } as any;
  const before = structuredClone(artifact);
  const view = render(<ChartArtifact artifact={artifact} />);
  expect(screen.getByRole("status").textContent).toContain("unsupported standalone chart series");
  expect(screen.queryByTestId("community-chart")).toBeNull();
  expect(artifact).toEqual(before);
  view.rerender(<ChartArtifact artifact={{ ...artifact, chart_params: { ...artifact.chart_params, chartType: "line" } }} />);
  expect(screen.getByTestId("community-chart").textContent).toBe("2025-12-31:missing,2026-01-01:0");
  expect(fixture.options.series[0].type).toBe("line");
  expect(fixture.options.data).toEqual(before.content);
  expect(artifact).toEqual(before);
});
