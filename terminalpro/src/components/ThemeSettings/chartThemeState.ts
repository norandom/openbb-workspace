import type { AgChartThemeName } from "ag-charts-community";
import type { ChartThemeParams, ThemeSettings } from "~/lib/state/tableChartThemes";

export interface ChartThemeState {
  selectedBaseTheme: AgChartThemeName;
  fills: string[];
  strokes: string[];
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | null;
  foregroundColor?: string;
  backgroundColor?: string;
  accentColor?: string;
  borderColor?: string;
  textColor?: string;
  subtleTextColor?: string;
  padding?: number;
  chromeBackgroundColor?: string;
  chromeTextColor?: string;
  chromeFontFamily?: string;
  chromeFontSize?: number;
  chromeFontWeight?: string | null;
  chromeSubtleTextColor?: string;
  inputBackgroundColor?: string;
  inputTextColor?: string;
  gridLineColor?: string;
  axisColor?: string;
  crosshairLabelBackgroundColor?: string;
  crosshairLabelTextColor?: string;
  backgroundImage: NonNullable<ThemeSettings["chartTheme"]["backgroundImage"]>;

  isReset?: boolean;
}

export const DEFAULT_DARK_FILLS = [
  "#5090dc",
  "#ffa03a",
  "#459d55",
  "#34bfe1",
  "#e1cc00",
  "#9669cb",
  "#b5b5b5",
  "#bd5aa7",
  "#8a6224",
  "#ef5452",
];

export const DEFAULT_DARK_STROKES = [
  "#74a8e6",
  "#ffbe70",
  "#6cb176",
  "#75d4ef",
  "#f6e559",
  "#aa86d8",
  "#a1a1a1",
  "#ce7ab9",
  "#997b52",
  "#ff7872",
];

export const DEFAULT_LIGHT_FILLS = [
  "#5BC0EB",
  "#FDE74C",
  "#9BC53D",
  "#E55934",
  "#FA7921",
  "#C45AB3",
  "#8B7355",
  "#E67E22",
  "#3498DB",
  "#E74C3C",
];

export const DEFAULT_LIGHT_STROKES = [
  "#4A90A4",
  "#D4BE41",
  "#7F9B32",
  "#C84A2A",
  "#D4621B",
  "#A84A94",
  "#6D5A44",
  "#C86A1C",
  "#2980B9",
  "#C0392B",
];

export const DEFAULT_CHART_THEME: ChartThemeState = {
  selectedBaseTheme: "ag-default",
  fills: DEFAULT_LIGHT_FILLS,
  strokes: DEFAULT_LIGHT_STROKES,
  fontFamily: "",
  fontSize: 12,
  fontWeight: null,
  foregroundColor: "",
  backgroundColor: "",
  accentColor: "",
  borderColor: "",
  textColor: "",
  subtleTextColor: "",
  padding: undefined,
  chromeBackgroundColor: "",
  chromeTextColor: "",
  chromeFontFamily: "",
  chromeFontSize: undefined,
  chromeFontWeight: null,
  chromeSubtleTextColor: "",
  inputBackgroundColor: "",
  inputTextColor: "",
  gridLineColor: "",
  axisColor: "",
  crosshairLabelBackgroundColor: "",
  crosshairLabelTextColor: "",
  backgroundImage: {
    enabled: false,
    url: "",
    width: 50,
    height: 50,
    left: undefined,
    top: undefined,
    right: 10,
    bottom: 10,
    opacity: 1,
  },
};

export function getThemeDefaults(mode: "light" | "dark"): ChartThemeState {
  return {
    ...DEFAULT_CHART_THEME,
    backgroundImage: { ...DEFAULT_CHART_THEME.backgroundImage },
    selectedBaseTheme: mode === "dark" ? "ag-default-dark" : "ag-default",
    fills: [...(mode === "dark" ? DEFAULT_DARK_FILLS : DEFAULT_LIGHT_FILLS)],
    strokes: [...(mode === "dark" ? DEFAULT_DARK_STROKES : DEFAULT_LIGHT_STROKES)],
    backgroundColor: mode === "dark" ? "#151518" : "#FFFFFF",
  };
}

export type ThemeMode = "light" | "dark";
export type ChartSettingsState = {
  light: ChartThemeState;
  dark: ChartThemeState;
  themeMode: ThemeMode;
};

export function readChartTheme(
  currentTheme: ThemeSettings["chartTheme"],
  mode: ThemeMode,
): ChartThemeState {
  const defaults = getThemeDefaults(mode);
  if (!currentTheme) return { ...defaults, isReset: true };
  const fills = [...(currentTheme.palette.fills || defaults.fills)];
  const strokes = [...(currentTheme.palette.strokes || defaults.strokes)];
  const defaultStroke = mode === "dark" ? "#74a8e6" : "#4A90A4";
  while (strokes.length < fills.length) strokes.push(defaultStroke);
  return {
    ...defaults,
    selectedBaseTheme: currentTheme.baseTheme,
    fills,
    strokes: strokes.slice(0, fills.length),
    ...currentTheme.params,
    backgroundImage: { ...(currentTheme.backgroundImage || defaults.backgroundImage) },
    isReset: false,
  };
}

export function chartThemeParams(state: ChartThemeState): ChartThemeParams {
  const { selectedBaseTheme, fills, strokes, backgroundImage, isReset, ...params } =
    state;
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  ) as ChartThemeParams;
}

export function serializeChartTheme(
  state: ChartThemeState,
): ThemeSettings["chartTheme"] {
  const result: ThemeSettings["chartTheme"] = {
    baseTheme: state.selectedBaseTheme,
    palette: { fills: [...state.fills], strokes: [...state.strokes] },
    params: chartThemeParams(state),
  };
  // Preserve dormant Enterprise metadata when editing supported Community settings.
  result.backgroundImage = { ...state.backgroundImage };
  return result;
}
