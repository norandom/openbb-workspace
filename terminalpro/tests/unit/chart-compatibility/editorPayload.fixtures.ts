import type {
  JsonObject,
  RuntimeOptions,
} from "../../../src/components/General/Table/Chart/compatibility/legacyTypes";

// Independent synthetic outgoing-state observations, not effective renderer options.
export const editorPayloadProvenance = {
  sourceRevision: "38dffc33389aca0e4a87e0e88d42f7067aa220df",
  originalImage:
    "sha256:f48eb1c9b32e1f84d5199dafc943bc1fc10f3b1745ab29860975d002dc5c8a3f",
  dashboard: "11111111-1111-4111-8111-111111111111",
  sources: [
    {
      path: "artifacts/parity/editor-payload-capture/widget-writes.json",
      sha256: "038b51a8cab49352da8edc978b30519e3c88e2a285b35ed41fb578d563069017",
    },
    {
      path: "artifacts/parity/editor-payload-capture/payload-deltas.json",
      sha256: "237aa77c3ec40c1309a64110c55271fdf33e448fac258d3686968903383f6d0e",
    },
    {
      path: "artifacts/parity/editor-payload-capture/report.md",
      sha256: "b1dd87dfae8140a3695eb5fe79ede0b99ca1dab74a59f3b8c72f36ab3d669c54",
    },
  ],
} as const;

export interface CapturedEditorPayload {
  readonly stage: string;
  readonly chartType: string;
  readonly totalSeries: number;
  readonly isPivotMode: boolean;
  readonly model: JsonObject & { chartOptions: RuntimeOptions; cellRange: JsonObject };
}

export const capturedEditorPayloads: readonly CapturedEditorPayload[] = [
  {
    stage: "baseline",
    chartType: "groupedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "groupedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "title",
    chartType: "groupedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "groupedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "legend",
    chartType: "groupedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "groupedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
          legend: {
            position: "bottom",
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "stroke",
    chartType: "groupedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "groupedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
          legend: {
            position: "bottom",
          },
          series: {
            strokeWidth: 4,
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "stacked",
    chartType: "stackedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "stackedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
          legend: {
            position: "bottom",
          },
          series: {
            strokeWidth: 4,
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "grouped",
    chartType: "groupedColumn",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "groupedColumn",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
          legend: {
            position: "bottom",
          },
          series: {
            strokeWidth: 4,
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
  {
    stage: "line",
    chartType: "line",
    totalSeries: 2,
    isPivotMode: false,
    model: {
      chartType: "line",
      chartOptions: {
        common: {
          legend: {
            position: "top",
            maxHeight: 50,
          },
          axes: {
            number: {
              label: {
                fontSize: 11,
              },
            },
          },
        },
        bar: {
          title: {
            text: "Synthetic Revenue and EPS",
            enabled: true,
          },
          legend: {
            position: "bottom",
          },
          series: {
            strokeWidth: 4,
          },
        },
      },
      cellRange: {
        rowStartIndex: null,
        rowStartPinned: null,
        rowEndIndex: null,
        rowEndPinned: null,
        columns: ["period", "revenue", "eps"],
      },
      switchCategorySeries: false,
      suppressChartRanges: true,
      unlinkChart: false,
      version: "34.1.1",
    },
  },
];

export const capturedEditorDeltas = [
  {
    stage: "title",
    changes: {
      "data.widgets.0.storage.default.chartModel.chartOptions.bar.title.text": {
        after: "Synthetic Revenue and EPS",
      },
      "data.widgets.0.storage.default.chartModel.chartOptions.bar.title.enabled": {
        after: true,
      },
    },
  },
  {
    stage: "legend",
    changes: {
      "data.widgets.0.storage.default.chartModel.chartOptions.bar.legend.position": {
        after: "bottom",
      },
    },
  },
  {
    stage: "stroke",
    changes: {
      "data.widgets.0.storage.default.chartModel.chartOptions.bar.series.strokeWidth": {
        after: 4,
      },
    },
  },
  {
    stage: "stacked",
    changes: {
      "data.widgets.0.storage.chartType": {
        before: "groupedColumn",
        after: "stackedColumn",
      },
      "data.widgets.0.storage.default.chartModel.chartType": {
        before: "groupedColumn",
        after: "stackedColumn",
      },
    },
  },
  {
    stage: "grouped",
    changes: {
      "data.widgets.0.storage.chartType": {
        before: "stackedColumn",
        after: "groupedColumn",
      },
      "data.widgets.0.storage.default.chartModel.chartType": {
        before: "stackedColumn",
        after: "groupedColumn",
      },
    },
  },
  {
    stage: "line",
    changes: {
      "data.widgets.0.storage.chartType": {
        before: "groupedColumn",
        after: "line",
      },
      "data.widgets.0.storage.default.chartModel.chartType": {
        before: "groupedColumn",
        after: "line",
      },
    },
  },
] as const;
