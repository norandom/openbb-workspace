import type { BarSeriesOption, EChartsOption, LineSeriesOption } from "echarts";
import type {
  ChartSnapshot,
  SnapshotColumn,
  SnapshotDiagnostic,
} from "../compatibility/snapshotTypes";
import type { ResolvedCartesianStyle, TranslateCartesian } from "./cartesianTypes";

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const dimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const positions = ["top", "bottom", "left", "right"];

function styleValid(value: unknown): value is ResolvedCartesianStyle {
  if (!record(value)) return false;
  if (
    ![value.background, value.textColor, value.fontFamily].every(
      (item) => typeof item === "string",
    )
  )
    return false;
  if (
    !Array.isArray(value.palette) ||
    value.palette.length === 0 ||
    !value.palette.every((item: unknown) => typeof item === "string")
  )
    return false;
  if (
    !dimension(value.fontSize) ||
    !dimension(value.precision) ||
    !Number.isInteger(value.precision) ||
    value.precision > 20
  )
    return false;
  if (value.title !== undefined && typeof value.title !== "string") return false;
  if (
    !record(value.legend) ||
    typeof value.legend.visible !== "boolean" ||
    typeof value.legend.position !== "string" ||
    !positions.includes(value.legend.position)
  )
    return false;
  if (!record(value.series)) return false;
  return Object.values(value.series).every(
    (override) =>
      record(override) &&
      (override.color === undefined || typeof override.color === "string") &&
      (override.lineWidth === undefined || dimension(override.lineWidth)),
  );
}

function diagnostic(
  code: string,
  path: readonly (string | number)[],
  message: string,
): SnapshotDiagnostic {
  return { code, path, message };
}

function unitDiagnostics(
  columns: readonly SnapshotColumn[],
  descriptors: readonly SnapshotColumn[],
): SnapshotDiagnostic[] {
  const first = columns[0];
  return columns.flatMap((column) => {
    const index = descriptors.findIndex((descriptor) => descriptor.id === column.id);
    if (!column.unit || !dimension(column.scale) || column.scale === 0) {
      return [
        diagnostic(
          "unknown-unit",
          ["columns", index, !column.unit ? "unit" : "scale"],
          "Selected series require an explicit unit and positive scale.",
        ),
      ];
    }
    if (column.unit !== first?.unit || column.scale !== first?.scale) {
      return [
        diagnostic(
          "incompatible-unit",
          ["columns", index, column.unit !== first?.unit ? "unit" : "scale"],
          "Selected series must share the same unit and scale; no conversion is applied.",
        ),
      ];
    }
    return [];
  });
}

// Escape provider labels before passing them to ECharts' HTML tooltip renderer.
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] ?? character,
  );
}

function tooltip(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  precision: number,
  params: unknown,
): string {
  const entries = Array.isArray(params) ? params : [params];
  const index = entries.find(
    (entry: unknown) => record(entry) && typeof entry.dataIndex === "number",
  )?.dataIndex;
  const row = typeof index === "number" ? snapshot.rows[index] : undefined;
  if (!row) return "";
  const lines = columns.map((column) => {
    const value = row.values[column.id];
    return `${escapeHtml(column.label)}: ${typeof value === "number" ? value.toFixed(precision) : "—"}`;
  });
  return [escapeHtml(String(row.category)), ...lines].join("<br/>");
}

function seriesOptions(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  family: string,
  style: ResolvedCartesianStyle,
): (BarSeriesOption | LineSeriesOption)[] {
  return columns.map((column) => {
    const override = style.series[column.id];
    const common = {
      id: column.id,
      // ECharts legend selection addresses names, so names must also use stable IDs.
      name: column.id,
      data: snapshot.rows.map((row) => row.values[column.id] ?? null),
      itemStyle: {
        color: override?.color,
        borderWidth: family === "line" ? undefined : override?.lineWidth,
      },
    };
    if (family === "line") {
      return {
        ...common,
        type: "line",
        connectNulls: false,
        lineStyle: { color: override?.color, width: override?.lineWidth },
      };
    }
    if (family === "stackedColumn")
      return { ...common, type: "bar", stack: "total", stackStrategy: "samesign" };
    return { ...common, type: "bar" };
  });
}

function buildOptions(
  snapshot: ChartSnapshot,
  columns: readonly SnapshotColumn[],
  family: string,
  style: ResolvedCartesianStyle,
): EChartsOption {
  const labels = new Map(columns.map((column) => [column.id, column.label]));
  return {
    backgroundColor: style.background,
    color: [...style.palette],
    textStyle: {
      color: style.textColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
    },
    title:
      style.title === undefined
        ? undefined
        : {
            text: style.title,
            textStyle: {
              color: style.textColor,
              fontFamily: style.fontFamily,
              fontSize: style.fontSize,
            },
          },
    legend: {
      show: style.legend.visible,
      [style.legend.position]: 0,
      data: columns.map((column) => column.id),
      formatter: (name: string) => labels.get(name) ?? name,
      textStyle: {
        color: style.textColor,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
      },
    },
    xAxis: {
      type: "category",
      data: snapshot.rows.map((_, index) => String(index)),
      axisLabel: {
        color: style.textColor,
        formatter: (value: string) =>
          String(snapshot.rows[Number(value)]?.category ?? ""),
      },
      axisPointer: {
        label: {
          formatter: (params) =>
            String(snapshot.rows[Number(params.value)]?.category ?? ""),
        },
      },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        color: style.textColor,
        formatter: (value: number) => value.toFixed(style.precision),
      },
    },
    tooltip: {
      trigger: "axis",
      formatter: (params) => tooltip(snapshot, columns, style.precision, params),
    },
    series: seriesOptions(snapshot, columns, family, style),
  };
}

export const translateCartesian: TranslateCartesian = (snapshot, family, style) => {
  if (!["groupedColumn", "stackedColumn", "line"].includes(family)) {
    return {
      status: "unsupported",
      diagnostics: [
        diagnostic(
          "unsupported-family",
          ["family"],
          "Only groupedColumn, stackedColumn and line are supported.",
        ),
      ],
    };
  }
  if (snapshot.sourceMode !== "flat") {
    return {
      status: "unsupported",
      diagnostics: [
        diagnostic(
          "unsupported-source",
          ["sourceMode"],
          "Only flat unaggregated observations are supported.",
        ),
      ],
    };
  }
  try {
    if (!styleValid(style))
      return {
        status: "invalid",
        diagnostics: [
          diagnostic("invalid-style", ["style"], "Resolved style fields are invalid."),
        ],
      };
    const columns = snapshot.selectedColumnIds.flatMap((id) =>
      snapshot.columns.filter((column) => column.id === id && column.role === "number"),
    );
    const diagnostics = unitDiagnostics(columns, snapshot.columns);
    if (diagnostics.length) return { status: "unsupported", diagnostics };
    return {
      status: "supported",
      options: buildOptions(snapshot, columns, family, style),
    };
  } catch {
    return {
      status: "invalid",
      diagnostics: [
        diagnostic(
          "invalid-style",
          ["style"],
          "Resolved style cannot be safely inspected.",
        ),
      ],
    };
  }
};
