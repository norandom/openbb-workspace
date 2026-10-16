import { describe, expect, it, vi } from "vitest";
import { createDefaultSeries, getFiscalPeriodString } from "~/components/General/Table/Chart/utils";
import { getCustomChartTheme, getOpenBBChartTheme } from "~/components/General/Table/Chart/themes";

vi.mock("~/lib/utils", () => ({ formatNumber: (n: number, digits = 2) => n.toFixed(digits), formatNumberMagnitude: String }));
vi.mock("~/lib/constants", () => ({ CHART_TYPE_TO_SERIES_TYPE: { line: "line" } }));
vi.mock("~/components/General/Table/AgGridUtils", () => ({ isDate: (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v), isDateTime: (v: unknown) => typeof v === "string" && v.includes("T") }));
vi.mock("~/components/Widget.context", () => ({ useWidgetContext: () => ({ widget: { storage: {} } }) }));
vi.mock("~/lib/state/tableChartThemes", () => ({ useShallowTableChartThemesStore: () => ({}) }));
vi.mock("~/components/General/Table/hooks/constants", () => ({ customCssPart: {}, getDefaultAgGridTheme: () => ({}) }));

describe("standalone Community chart helpers", () => {
  it("preserves UTC date labels and caller financial precision", () => {
    expect(getFiscalPeriodString(new Date("2025-12-31T00:00:00Z"), () => ({ isQuarterly: false, isAnnual: false }))).toBe("2025-12-31");
    const series = createDefaultSeries({ chartType: "line", getDecimalPlaces: () => 3 });
    const result = series.tooltip.renderer({ datum: { date: "2025-12-31", revenue: 12.3456 }, xKey: "date", yKey: "revenue", seriesId: "LineSeries", title: "Revenue" } as any);
    expect(result.data).toEqual([{ label: "revenue", value: "12.346" }]);
  });

  it("keeps light/dark palettes while excluding unsupported chart features", () => {
    for (const mode of ["light", "dark"] as const) {
      const theme = getOpenBBChartTheme(mode);
      const custom = getCustomChartTheme({ baseTheme: theme.baseTheme, palette: { fills: ["#123456"], strokes: ["#654321"] }, params: { fontSize: 12 }, backgroundImage: { enabled: true, url: "https://example.invalid/image.png", width: 20, height: 20, opacity: 1 } });
      expect(custom.palette.fills).toEqual(["#123456"]);
      expect(custom.overrides.common).not.toHaveProperty("navigator");
      expect(custom.overrides.common).not.toHaveProperty("zoom");
      expect(custom.overrides.common).not.toHaveProperty("background.image");
      expect(custom.overrides).not.toHaveProperty("waterfall");
      expect(custom.overrides).not.toHaveProperty("funnel");
    }
  });
});
