import type { ResolvedSnapshotInput } from "../../../src/components/General/Table/Chart/compatibility/snapshotTypes";
import type {
  CartesianCaptionAppearance,
  CartesianSeriesAppearance,
  ResolvedCartesianStyle,
} from "../../../src/components/General/Table/Chart/echarts/cartesianTypes";

/** Synthetic homogeneous USD millions; original mixed-unit UI capture is not numerical evidence. */
export const appearanceSnapshot: ResolvedSnapshotInput = {
  stateAddress: "synthetic/appearance",
  dataRevision: 7,
  originalModel: null,
  sourceMode: "flat",
  categoryColumnId: "period",
  selectedColumnIds: ["period", "revenue", "costs"],
  columns: [
    { id: "period", label: "Period", role: "category" },
    { id: "revenue", label: "Amount", role: "number", unit: "USD", scale: 1000000 },
    { id: "costs", label: "Amount", role: "number", unit: "USD", scale: 1000000 },
  ],
  rows: [
    { id: "q1", category: "Q1", values: { revenue: 100, costs: 40 } },
    { id: "q2", category: "Q2", values: { revenue: null, costs: null } },
    { id: "q3", category: "Q3", values: { revenue: 140, costs: 60 } },
    { id: "q4", category: "Q4", values: { revenue: 160, costs: 70 } },
  ],
  selectedRange: null,
};
export const appearanceStyle: ResolvedCartesianStyle = {
  background: "#ffffff",
  palette: ["#145da0", "#b33b32"],
  textColor: "#202020",
  fontFamily: "sans-serif",
  fontSize: 12,
  title: "Revenue and costs (USD millions)",
  titleEnabled: true,
  typography: {
    title: { color: "#101010", fontFamily: "serif", fontSize: 18 },
    legend: { color: "#303030", fontFamily: "monospace", fontSize: 11 },
    axis: { color: "#505050", fontFamily: "sans-serif", fontSize: 10 },
  },
  line: { connectMissingData: true, markers: { enabled: false } },
  legend: { visible: true, position: "bottom" },
  precision: 2,
  series: {},
};
/** Original dark UI observed retained title/enabled state, connected gaps and circular size-seven markers.
 * Colors and fallback expectations below are synthetic rules, not captured AG effective defaults. */
export const appearanceProvenance = {
  originalObservation:
    "2026-10-17 original 38dffc33389aca0e4a87e0e88d42f7067aa220df dark UI",
  syntheticRules: "chart-appearance-design.md Deterministic appearance precedence",
} as const;
export const expectedAppearanceData = {
  revenue: [100, null, 140, 160],
  costs: [40, null, 60, 70],
} as const;
export const markerStyle: ResolvedCartesianStyle = {
  ...appearanceStyle,
  line: {
    connectMissingData: false,
    markers: { enabled: true, shape: "circle", size: 7 },
  },
  series: {
    revenue: {
      color: "#111111",
      lineWidth: 2,
      fill: "#222222",
      stroke: "#333333",
      strokeWidth: 0.5,
      markerFill: "#444444",
      markerStroke: "#555555",
      markerStrokeWidth: 0,
    },
  },
};
export const expectedRevenueAppearance: CartesianSeriesAppearance = {
  itemStyle: { color: "#444444", borderColor: "#555555", borderWidth: 0 },
  lineStyle: { color: "#333333", width: 0.5 },
  connectNulls: false,
  showSymbol: true,
  symbol: "circle",
  symbolSize: 7,
};
export const reorderedAppearanceSnapshot: ResolvedSnapshotInput = {
  ...appearanceSnapshot,
  selectedColumnIds: ["period", "costs", "revenue"],
};
export const expectedPaletteReorder = {
  original: { revenue: "#145da0", costs: "#b33b32" },
  reordered: { costs: "#145da0", revenue: "#b33b32" },
  identityOverride: { revenue: "#333333" },
} as const;
export const retainedTitleCases: readonly {
  style: ResolvedCartesianStyle;
  expected: { show: boolean; text: string };
}[] = [
  {
    style: { ...appearanceStyle, titleEnabled: false },
    expected: { show: false, text: "Revenue and costs (USD millions)" },
  },
  {
    style: { ...appearanceStyle, titleEnabled: true },
    expected: { show: true, text: "Revenue and costs (USD millions)" },
  },
  {
    style: { ...appearanceStyle, title: "", titleEnabled: false },
    expected: { show: false, text: "" },
  },
  {
    style: { ...appearanceStyle, title: "", titleEnabled: true },
    expected: { show: true, text: "" },
  },
];
export const expectedCaptions: CartesianCaptionAppearance = {
  title: {
    text: "Revenue and costs (USD millions)",
    show: true,
    textStyle: { color: "#101010", fontFamily: "serif", fontSize: 18 },
  },
  legendText: { color: "#303030", fontFamily: "monospace", fontSize: 11 },
  axisLabelStyle: { color: "#505050", fontFamily: "sans-serif", fontSize: 10 },
};

export const expectedRevenueColumnAppearance: CartesianSeriesAppearance = {
  itemStyle: { color: "#222222", borderColor: "#333333", borderWidth: 0.5 },
};
export const enabledPaletteMarkerStyle: ResolvedCartesianStyle = {
  ...appearanceStyle,
  line: {
    connectMissingData: true,
    markers: { enabled: true, shape: "circle", size: 7 },
  },
};
export const expectedPaletteMarkerAppearance: CartesianSeriesAppearance = {
  itemStyle: { color: "#145da0", borderColor: "#145da0", borderWidth: 0 },
  lineStyle: { color: "#145da0" },
  connectNulls: true,
  showSymbol: true,
  symbol: "circle",
  symbolSize: 7,
};
