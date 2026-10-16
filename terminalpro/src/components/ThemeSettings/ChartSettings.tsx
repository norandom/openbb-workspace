import { AgCharts } from "ag-charts-react";
import { useMemo } from "react";
import { useDebounceValue } from "usehooks-ts";
import { ChartPaletteControls } from "./ChartPaletteControls";
import { ChartParameterControls } from "./ChartParameterControls";
import { buildChartPreview } from "./chartThemePreview";
import { ThemeSettingsLayout } from "./ThemeSettingsLayout";
import { useChartSettings } from "./useChartSettings";

export function ChartSettings() {
  const settings = useChartSettings();
  const chartOptions = useMemo(
    () => buildChartPreview(settings.state, settings.themeMode),
    [settings.state, settings.themeMode],
  );
  const [debouncedChartOptions] = useDebounceValue(chartOptions, 300);
  return (
    <ThemeSettingsLayout
      onSave={settings.handleSave}
      onReset={settings.handleReset}
      preview={<AgCharts options={debouncedChartOptions} className="w-full h-full" />}
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
