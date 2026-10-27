import { useMemo } from "react";
import { useDebounceValue } from "usehooks-ts";
import { ChartPaletteControls } from "./ChartPaletteControls";
import { ChartParameterControls } from "./ChartParameterControls";
import { ChartThemePreviewHost } from "./chartThemePreviewHost";
import { ThemeSettingsLayout } from "./ThemeSettingsLayout";
import { useChartSettings } from "./useChartSettings";

export function ChartSettings() {
  const settings = useChartSettings();
  const previewDraft = useMemo(
    () => ({ state: settings.state, mode: settings.themeMode }),
    [settings.state, settings.themeMode],
  );
  const [debouncedPreviewDraft] = useDebounceValue(previewDraft, 300);
  return (
    <ThemeSettingsLayout
      onSave={settings.handleSave}
      onReset={settings.handleReset}
      preview={<ChartThemePreviewHost {...debouncedPreviewDraft} />}
      selectedThemeMode={settings.themeMode}
      onThemeModeChange={settings.onThemeModeChange}
    >
      <div className="flex flex-col gap-6">
        <ChartPaletteControls {...settings} />
        <ChartParameterControls {...settings} />
      </div>
    </ThemeSettingsLayout>
  );
}
