/** DRAFT source expectations, not original browser acceptance. */
export const radialFamilies = [
  {
    family: "radialColumn", optionKey: "radial-column",
    categoryAxis: "angle-category", numericalAxis: "radius-number",
    absentRootGroupType: "grouped",
    sourceDefaults: {
      numericalInnerRadiusRatio: 0.5,
      categoryPaddingInner: 0, categoryGroupPaddingInner: 0,
      columnWidthRatio: 0.5, maxColumnWidthRatio: 0.5,
    },
  },
  {
    family: "radialBar", optionKey: "radial-bar",
    categoryAxis: "radius-category", numericalAxis: "angle-number",
    absentRootGroupType: "grouped",
    sourceDefaults: {
      categoryInnerRadiusRatio: 0.2,
      categoryPaddingInner: 0.2, categoryGroupPaddingInner: 0.2,
      categoryPaddingOuter: 0.1,
    },
  },
] as const;

/** Retained response retrieved 2026-10-20; fiscal periods, reported USD. */
export const radialRevenueComponents = {
  sourceSha256: "390dc8cbfc8302720a203bd9782d5e3b1f7363a4f762bdfcef079dbbe4c72f6b",
  csvSha256: "2be4fd02d6aa89ae20b95614fa0d21413db18e75a1b75b3458d1ca9d1e7ca7d8",
  fiscalYear: "2025",
  quarters: ["Q1", "Q2", "Q3", "Q4"],
  dates: ["2024-12-28", "2025-03-29", "2025-06-28", "2025-09-27"],
  costOfRevenue: [66025000000, 50492000000, 50318000000, 54125000000],
  grossProfit: [58275000000, 44867000000, 43718000000, 48341000000],
  // Reconciliation reference only; never plotted as a third stacked component.
  revenue: [124300000000, 95359000000, 94036000000, 102466000000],
} as const;

export const radialCompactRows = [
  { id: "r1", category: "A", primary: 1, secondary: 2 },
  { id: "r2", category: "B", primary: 4, secondary: 8 },
  { id: "r3", category: "C", primary: 9, secondary: 18 },
] as const;

/** Duplicate text has distinct identity; null is absence, not zero. */
export const radialEdgeRows = [
  { id: "r1", category: "A", primary: 10, secondary: -5 },
  { id: "r2", category: "A", primary: -5, secondary: 10 },
  { id: "r3", category: "B", primary: 0, secondary: 0 },
  { id: "r4", category: "C", primary: 20, secondary: -10 },
  { id: "r5", category: "D", primary: null, secondary: 4 },
  { id: "r6", category: "E", primary: 30, secondary: 6 },
] as const;

/** Source arithmetic only; does not assert original painted missing-row behavior. */
export const radialSignedArithmetic = {
  raw: [10, -5],
  positiveTotal: 10,
  negativeTotal: -5,
  denominator: 10,
  normalized: [100, -50],
} as const;

export const radialFreezeBlockers = [
  "Source-only color/font targets require review; edited targets confirmed in run 3",
  "Column constant-width boundary and single-row ECharts spike",
  "Bar angular nice-domain/ticks and category-ring order",
  "Normalized missing/later-valid parity or explicit correction decision",
  "All-zero/empty and navigator/mini-chart original effects",
] as const;

/** Actual original run 2, source 38dffc3; partial journey, not full acceptance. */
export const radialOriginalRun2 = {
  source: "38dffc33389aca0e4a87e0e88d42f7067aa220df",
  evidenceRoot: "artifacts/chart-radial/original/run-2/browser-output",
  groupRoot: {
    initialDefault: "absent",
    reselectGrouped: "absent",
    stacked: "stacked",
    normalized: "normalized",
    returnGroupedAfterModeChange: "grouped",
  },
  radialColumn: {
    ticks: {
      grouped: [0, 5, 10, 15, 20],
      stacked: [0, 10, 20, 30],
      normalized: [0, 20, 40, 60, 80, 100],
    },
    firstAxisControls: {
      thickness: 1, innerRadiusRatio: 0.5, fontSize: 11,
      orientation: "fixed", groupPadding: 0, seriesPadding: 0,
    },
  },
  radialBar: {
    ticks: {
      grouped: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18],
      stacked: [0, 5, 10, 15, 20, 25, 30, 35],
      normalized: [0, 20, 40, 60, 80, 100, 120, 140],
    },
    firstAxisControls: {
      thickness: 1, innerRadiusRatio: 0.2, fontSize: 12,
      orientation: "fixed", groupPadding: 0, seriesPadding: 0,
    },
  },
  compactNativeTooltipTuplesPerMode: 6,
  spinbuttonOrder: ["thickness", "innerRadiusRatio", "groupPadding", "seriesPadding"],
  limitation: "Journey stopped at duplicate-A import selector before mixed-data/control-edit checks.",
} as const;

/** Original run 3 saved edits/reload; color and typography targets remain source-only. */
export const radialObservedControlTargets = {
  radialColumn: {
    thickness: ["angle-category", "radius-number"],
    innerRadiusRatio: ["angle-category", "radius-number"],
    groupPadding: { field: "paddingInner", axes: ["angle-category"] },
    seriesPadding: { field: "groupPaddingInner", axes: ["angle-category"] },
    orientation: ["angle-category"],
  },
  radialBar: {
    thickness: ["angle-number", "radius-category"],
    innerRadiusRatio: ["angle-number", "radius-category"],
    groupPadding: { field: "paddingInner", axes: ["radius-category"] },
    seriesPadding: { field: "groupPaddingInner", axes: ["radius-category"] },
    orientation: ["angle-number"],
  },
  appliedValues: {
    thickness: 3, innerRadiusRatio: 0.25,
    paddingInner: 0.2, groupPaddingInner: 0.3, orientation: "parallel",
  },
  exactReload: true,
  sourceOnly: ["color target applicability", "label typography target applicability"],
} as const;

export const radialOriginalRun3SeriesControls = {
  strokeWidth: 0, lineDash: 0, strokeOpacity: 1,
  fillOpacity: 1, labelsEnabled: false,
  recordsPerFamily: 19,
  radialBarJourney: "passed",
  radialColumnJourney: "normalized missing suppresses later Primary E; owner decision pending",
} as const;


/** Source-derived applicability, not edited by the original browser probe. */
export const radialSourceOnlyControlTargets = {
  radialColumn: {
    color: ["angle-category", "radius-number"],
    labelTypography: ["angle-category", "radius-number"],
  },
  radialBar: {
    color: ["angle-number", "radius-category"],
    labelTypography: ["angle-number", "radius-category"],
  },
  provenance: "Pinned AG Grid source property-applicability dispatch; no browser edit assertion.",
} as const;
