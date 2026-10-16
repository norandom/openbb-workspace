import type { Part, ThemeDefaultParams } from "ag-grid-community";
import {
  colorSchemeDark,
  colorSchemeLight,
  iconSetAlpine,
  iconSetMaterial,
  iconSetQuartz,
  ModuleRegistry,
  themeAlpine,
} from "ag-grid-community";
import { AllEnterpriseModule } from "ag-grid-enterprise";
import { AgGridReact } from "ag-grid-react";
import cloneDeep from "lodash/cloneDeep";
import isEqual from "lodash.isequal";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useDebounceValue } from "usehooks-ts";
import { useStateReducer } from "~/hooks/useStateReducer";
import {
  type EntityThemeSettings,
  type ThemeDefaultParamsT,
  type ThemeSettings,
  useTableChartThemesStore,
} from "~/lib/state/tableChartThemes";
import { useShallowThemeStore } from "~/lib/state/theme";
import {
  customCssPart,
  getDefaultAgGridThemeParams,
} from "../General/Table/hooks/constants";
import { TableThemeControls } from "./TableThemeControls";
import { THEME_MODES, ThemeSettingsLayout } from "./ThemeSettingsLayout";
import { columnDefs, defaultGridProps, sampleData } from "./tablePreviewData";

ModuleRegistry.registerModules([AllEnterpriseModule]);

interface IconSetOption {
  id: "iconSetQuartz" | "iconSetAlpine" | "iconSetMaterial";
  label: string;
  themePart: Part<unknown>;
}

const iconSets: IconSetOption[] = [
  { id: "iconSetAlpine", label: "Alpine", themePart: iconSetAlpine },
  { id: "iconSetQuartz", label: "Quartz", themePart: iconSetQuartz() },
  { id: "iconSetMaterial", label: "Material", themePart: iconSetMaterial },
];

interface TableThemeState extends Partial<ThemeDefaultParamsT> {
  selectedIconSet: (typeof iconSets)[0];
  isReset?: boolean;
}

const THEME_DEFAULT: TableThemeState = {
  selectedIconSet: iconSets[0],
  rowVerticalPaddingScale: 0.97,
  cellHorizontalPaddingScale: 0.8,
};

type TableSettingsState = {
  light?: TableThemeState;
  dark?: TableThemeState;
  themeMode?: "light" | "dark";
};

const STATE_DEFAULT: TableSettingsState = {
  light: {
    ...THEME_DEFAULT,
    ...getDefaultAgGridThemeParams("light"),
  },
  dark: {
    ...THEME_DEFAULT,
    ...getDefaultAgGridThemeParams("dark"),
  },
};

function updateState(
  currentTheme: ThemeSettings["tableTheme"],
  mode: "light" | "dark",
  updatedState: Partial<TableSettingsState>,
) {
  if (currentTheme) {
    updatedState[mode] = {
      ...THEME_DEFAULT,
      ...((currentTheme.params || {}) as ThemeDefaultParamsT),
      selectedIconSet:
        iconSets.find((i) => i.id === currentTheme.iconSet) ?? iconSets[0],
      isReset: false,
    };
  } else {
    updatedState[mode] = { ...STATE_DEFAULT[mode], isReset: true };
  }
}

function initializer(state: TableSettingsState): TableSettingsState {
  const { light, dark } = useTableChartThemesStore.getState();
  const chartThemes = { light: light?.tableTheme, dark: dark?.tableTheme };
  const updatedState = {} as Partial<TableSettingsState>;
  for (const mode of THEME_MODES) {
    updateState(chartThemes[mode], mode, updatedState);
  }
  return { ...state, ...updatedState };
}

export function TableSettings() {
  const theme = useShallowThemeStore((state) => state.theme);
  const [themesState, dispatch] = useStateReducer<TableSettingsState>(
    { themeMode: theme },
    initializer,
  );

  const saveThemeSettings = useTableChartThemesStore((s) => s.saveThemeSettings);

  useEffect(() => {
    const unsub = useTableChartThemesStore.subscribe(
      (state) => ({ light: state.light?.tableTheme, dark: state.dark?.tableTheme }),
      (current) => {
        const updatedState = {} as Partial<TableSettingsState>;
        for (const mode of THEME_MODES) {
          updateState(current[mode], mode, updatedState);
        }

        if (Object.keys(updatedState).length > 0) {
          dispatch(cloneDeep(updatedState));
        }
      },
    );

    return () => unsub();
  }, []);

  const handleInputChange = useCallback(
    (key: keyof TableThemeState, asString = true) =>
      (v: string) => {
        dispatch((prev) => {
          let value = v as string | number;
          if (!asString) {
            const numValue = Number.parseFloat(v);
            value = (Number.isNaN(numValue) ? THEME_DEFAULT[key] : numValue) as number;
          }

          return {
            ...prev,
            [prev.themeMode]: {
              ...prev[prev.themeMode],
              [key]: value || STATE_DEFAULT[prev.themeMode][key],
              isReset: false,
            },
          };
        });
      },
    [],
  );

  const state = themesState[themesState.themeMode];

  const handleSave = useCallback(async () => {
    let hasChanges = false;
    const updatedState = {} as EntityThemeSettings;
    for await (const mode of THEME_MODES) {
      const { isReset, ...agTheme } = themesState[mode];
      const { selectedIconSet, ...rest } = agTheme;
      const iconSet = selectedIconSet.id;

      const params = Object.fromEntries(
        Object.entries(rest).filter(
          ([, value]) => ![undefined, null, ""].some((v) => v === value),
        ),
      ) as ThemeDefaultParams;

      if (!isReset && isEqual(agTheme, STATE_DEFAULT[mode])) {
        console.log(`No changes detected for ${mode} theme, skipping save.`);
        continue;
      }
      hasChanges = true;
      updatedState[mode] = { tableTheme: isReset ? null : { iconSet, params } };
    }

    if (hasChanges) return await saveThemeSettings(updatedState);

    toast.info("No changes detected in theme settings.");
  }, [themesState, saveThemeSettings]);

  const handleIconSetChange = useCallback((value: string) => {
    const iconSet = iconSets.find((i) => i.id === value);
    if (iconSet) {
      dispatch((prev) => ({
        ...prev,
        [prev.themeMode]: {
          ...prev[prev.themeMode],
          selectedIconSet: iconSet,
          isReset: false,
        },
      }));
    }
  }, []);

  const handleReset = useCallback(
    () =>
      dispatch((s) => ({
        ...s,
        [s.themeMode]: {
          ...STATE_DEFAULT[s.themeMode],
          isReset: true,
        },
      })),
    [],
  );

  const gridTheme = useMemo(() => {
    const { selectedIconSet, isReset, ...params } = state;

    const filteredThemeParams = Object.fromEntries(
      Object.entries(params).filter(
        ([, value]) => ![undefined, null, ""].some((v) => v === value),
      ),
    );

    const gridTheme = themeAlpine
      .withPart(themesState.themeMode === "dark" ? colorSchemeDark : colorSchemeLight)
      .withPart(selectedIconSet.themePart)
      .withPart(customCssPart)
      .withParams(filteredThemeParams);

    return gridTheme;
  }, [state, themesState.themeMode]);

  const [debouncedGridTheme] = useDebounceValue(gridTheme, 300);

  const controls = (
    <TableThemeControls
      {...{ state, themesState, handleInputChange, handleIconSetChange, iconSets }}
    />
  );

  const preview = (
    <AgGridReact
      className="ag-grid h-full w-full"
      debug={true}
      theme={debouncedGridTheme}
      columnDefs={columnDefs}
      rowData={sampleData}
      {...defaultGridProps}
    />
  );

  return (
    <ThemeSettingsLayout
      onSave={handleSave}
      onReset={handleReset}
      preview={preview}
      selectedThemeMode={themesState.themeMode}
      onThemeModeChange={(themeMode) => dispatch({ themeMode })}
    >
      {controls}
    </ThemeSettingsLayout>
  );
}
