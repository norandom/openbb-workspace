import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash.isequal";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { useStateReducer } from "~/hooks/useStateReducer";
import {
  type EntityThemeSettings,
  useTableChartThemesStore,
} from "~/lib/state/tableChartThemes";
import { useShallowThemeStore } from "~/lib/state/theme";
import {
  type ChartSettingsState,
  type ChartThemeState,
  DEFAULT_CHART_THEME,
  getThemeDefaults,
  readChartTheme,
  serializeChartTheme,
} from "./chartThemeState";
import { THEME_MODES } from "./ThemeSettingsLayout";

function loadThemes(themeMode: ChartSettingsState["themeMode"]): ChartSettingsState {
  const { light, dark } = useTableChartThemesStore.getState();
  return {
    themeMode,
    light: readChartTheme(light?.chartTheme, "light"),
    dark: readChartTheme(dark?.chartTheme, "dark"),
  };
}

export function useChartSettings() {
  const theme = useShallowThemeStore((state) => state.theme);
  const [themesState, dispatch] = useStateReducer<ChartSettingsState>(
    { themeMode: theme },
    (state) => loadThemes(state.themeMode),
  );
  const saveThemeSettings = useTableChartThemesStore((s) => s.saveThemeSettings);
  useEffect(
    () =>
      useTableChartThemesStore.subscribe(
        (state) => ({ light: state.light?.chartTheme, dark: state.dark?.chartTheme }),
        (current) =>
          dispatch((previous) => ({
            ...previous,
            light: readChartTheme(current.light, "light"),
            dark: readChartTheme(current.dark, "dark"),
          })),
      ),
    [dispatch],
  );

  const changeTheme = useCallback(
    (edit: (state: ChartThemeState, mode: ChartSettingsState["themeMode"]) => void) => {
      dispatch((previous) => {
        const state = cloneDeep(previous[previous.themeMode]);
        edit(state, previous.themeMode);
        state.isReset = false;
        return { ...previous, [previous.themeMode]: state };
      });
    },
    [dispatch],
  );

  const handleInputChange = useCallback(
    (key: keyof ChartThemeState, asString = true) =>
      (v: string) => {
        if (
          key === "fills" ||
          key === "strokes" ||
          key === "backgroundImage" ||
          key === "isReset"
        )
          return;
        let value: string | number | null = v;
        if (!asString && key !== "selectedBaseTheme") {
          const numValue = Number.parseFloat(v);
          value = Number.isNaN(numValue)
            ? (DEFAULT_CHART_THEME[key] as number) || 0
            : numValue;
        }
        if ((key === "fontWeight" || key === "chromeFontWeight") && v === "")
          value = null;
        changeTheme((state) => {
          Object.assign(state, { [key]: value });
        });
      },
    [changeTheme],
  );

  const handleColorArrayChange = useCallback(
    (key: "fills" | "strokes", index: number) => (color: string) => {
      changeTheme((state) => {
        state[key][index] = color;
      });
    },
    [changeTheme],
  );

  const addColor = useCallback(
    () =>
      changeTheme((state, mode) => {
        const defaults = getThemeDefaults(mode);
        const index = Math.floor(Math.random() * defaults.fills.length);
        state.fills.push(defaults.fills[index]);
        state.strokes.push(defaults.strokes[index]);
      }),
    [changeTheme],
  );

  const removeColor = useCallback(
    (index: number) =>
      changeTheme((state) => {
        state.fills = state.fills.filter((_, i) => i !== index);
        state.strokes = state.strokes.filter((_, i) => i !== index);
      }),
    [changeTheme],
  );

  const handleSave = useCallback(async () => {
    const updated: EntityThemeSettings = {};
    for (const mode of THEME_MODES) {
      const { isReset, ...themeState } = themesState[mode];
      if (!isReset && isEqual(themeState, getThemeDefaults(mode))) continue;
      updated[mode] = {
        chartTheme: isReset ? null : serializeChartTheme(themesState[mode]),
      };
    }
    if (Object.keys(updated).length) return await saveThemeSettings(updated);
    toast.info("No changes detected in theme settings.");
  }, [themesState, saveThemeSettings]);

  const handleReset = useCallback(
    () =>
      dispatch((previous) => ({
        ...previous,
        [previous.themeMode]: {
          ...getThemeDefaults(previous.themeMode),
          isReset: true,
        },
      })),
    [dispatch],
  );
  const onThemeModeChange = useCallback(
    (themeMode: ChartSettingsState["themeMode"]) => dispatch({ themeMode }),
    [dispatch],
  );
  return {
    state: themesState[themesState.themeMode],
    themeMode: themesState.themeMode,
    handleInputChange,
    handleColorArrayChange,
    addColor,
    removeColor,
    handleSave,
    handleReset,
    onThemeModeChange,
  };
}
