import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { ChartEditorDock, type ChartEditorTab } from "../../General/Table/Chart/editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "../../General/Table/Chart/editor/chartTypeGalleryCatalog";
import { ChartSetupPanel, type ChartSetupEdit, type ChartSetupState } from "../../General/Table/Chart/editor/setup/ChartSetupPanel";
import { ChartTitlesPanel, type ChartCaptionEdit, type ChartCaptionState } from "../../General/Table/Chart/editor/titles/ChartTitlesPanel";
import { ChartLegendPanel, type ChartLegendState } from "../../General/Table/Chart/editor/legend/ChartLegendPanel";
import { ChartPaddingPanel } from "../../General/Table/Chart/editor/padding/ChartPaddingPanel";

import { ChartBackgroundPanel, type ChartBackgroundState } from "../../General/Table/Chart/editor/background/ChartBackgroundPanel";
import { ChartTooltipsPanel, type ChartTooltipsState } from "../../General/Table/Chart/editor/tooltips/ChartTooltipsPanel";
import { ChartSeriesStylePanel, type SeriesStyleField } from "../../General/Table/Chart/editor/series/ChartSeriesStylePanel";
import { ChartShadowPanel, type ChartShadowState } from "../../General/Table/Chart/editor/shadow/ChartShadowPanel";
import { ChartLabelsPanel, type ChartLabelsState } from "../../General/Table/Chart/editor/labels/ChartLabelsPanel";
import { ChartMarkersPanel, type ChartMarkersState } from "../../General/Table/Chart/editor/markers/ChartMarkersPanel";
import { ChartGridLinesPanel, type ChartGridLinesState } from "../../General/Table/Chart/editor/axis/ChartGridLinesPanel";
import { ChartTicksPanel, type ChartTicksState } from "../../General/Table/Chart/editor/axis/ChartTicksPanel";
import type { ReactNode } from "react";

const initialSetup: ChartSetupState = {
  categoryId: "period", aggregate: false, aggregationMethod: "sum",
  series: [{ id: "revenue", label: "Revenue" }, { id: "eps", label: "EPS" }],
  switchCategorySeries: false,
};
const caption = (text: string, size: number, spacing: number): ChartCaptionState => ({
  enabled: false, text, font: "Verdana, sans-serif", weight: "predefined", size, color: "#FFFFFF", spacing,
});

function CustomizeGroup({ label, children }: { label: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <section className="chart-titles-panel">
    <button type="button" className="chart-titles-heading" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <span aria-hidden="true">{expanded ? "⌄" : "›"}</span> {label}
    </button>
    {expanded && <div style={{ paddingTop: 12 }}>{children}</div>}
  </section>;
}
const fonts = ["Verdana, sans-serif", "Arial, sans-serif"].map((value) => ({ value, label: value }));
const weights = [{ value: "predefined", label: "Predefined" }, { value: "normal", label: "Normal" }, { value: "bold", label: "Bold" }, { value: "italic", label: "Italic" }, { value: "bold-italic", label: "Bold Italic" }];
const range = (max: number) => ({ min: 0, max, step: 1 });

export function ChartEditorControlsPreview({ dark = false, seriesType = "bar" }: { dark?: boolean; seriesType?: "bar" | "line" }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<ChartEditorTab>("setup");
  const [selectedType, setSelectedType] = useState(seriesType === "line" ? "line" : "groupedColumn");
  const isLine = ["line", "stackedLine", "normalizedLine"].includes(selectedType);
  const [themeKey, setThemeKey] = useState(0);
  const [setup, setSetup] = useState(initialSetup);
  const [padding, setPadding] = useState({ top: 20, right: 20, bottom: 20, left: 20 });
  const [background, setBackground] = useState<ChartBackgroundState>({ visible: true, fill: dark ? "#151518" : "#FFFFFF" });
  const [tooltips, setTooltips] = useState<ChartTooltipsState>({ enabled: true, mode: "shared" });
  const [seriesStyle, setSeriesStyle] = useState<Record<SeriesStyleField, number>>({ strokeWidth: seriesType === "line" ? 2 : 0, lineDash: 0, strokeOpacity: 1, fillOpacity: 1 });
  const [shadow, setShadow] = useState<ChartShadowState>({ enabled: false, color: "#00000080", blur: 5, xOffset: 3, yOffset: 3 });
  const [labels, setLabels] = useState<ChartLabelsState>({ enabled: false, font: "Verdana, sans-serif", weight: "predefined", size: 12, color: dark ? "#FFFFFF" : "#000000" });
  const [markers, setMarkers] = useState<ChartMarkersState>({ enabled: true, shape: "circle", size: 7, strokeWidth: 0 });
  const [axisDetails, setAxisDetails] = useState<Record<string, { grid: ChartGridLinesState; ticks: ChartTicksState }>>({
    horizontal: { grid: { enabled: false, color: "#515153", thickness: 1, lineDash: 0 }, ticks: { enabled: false, color: dark ? "#FFFFFF" : "#000000", width: 1, length: 6 } },
    vertical: { grid: { enabled: true, color: "#515153", thickness: 1, lineDash: 0 }, ticks: { enabled: false, color: dark ? "#FFFFFF" : "#000000", width: 1, length: 6 } },
  });
  const [legend, setLegend] = useState<ChartLegendState>({
    enabled: true, font: "Verdana, sans-serif", weight: "predefined", size: 11,
    color: dark ? "#FFFFFF" : "#000000", position: "top", spacing: 20,
    markerSize: 11, markerStroke: 0, itemSpacing: 5, horizontalSpacing: 32, verticalSpacing: 8,
  });
  const [titles, setTitles] = useState({
    title: caption("Chart Title", 12, 10), subtitle: caption("Subtitle", 13, 20),
    horizontalAxisTitle: caption("Horizontal Axis Title", 13, 25),
    verticalAxisTitle: caption("Vertical Axis Title", 13, 25),
  });
  const opener = useRef<HTMLButtonElement>(null);
  const editSetup = (edit: ChartSetupEdit) => setSetup((current) => {
    switch (edit.kind) {
      case "category": return { ...current, categoryId: edit.value };
      case "aggregate": return { ...current, aggregate: edit.value };
      case "aggregation-method": return { ...current, aggregationMethod: edit.value };
      case "switch-category-series": return { ...current, switchCategorySeries: edit.value };
      case "series-remove": return { ...current, series: current.series.filter((item) => item.id !== edit.id) };
      case "series-order": return { ...current, series: edit.ids.map((id) => current.series.find((item) => item.id === id)!) };
    }
  });
  const editCaption = (edit: ChartCaptionEdit) => setTitles((current) => ({
    ...current, [edit.caption]: { ...current[edit.caption], [edit.field]: edit.value },
  }));
  return <section>
    <p>Production controls preview: Set Up, Titles, Legend, chart padding, Background, Tooltips, Series styling, Shadow, ordinary Labels and line Markers. This preview covers bar/line controls; axis Grid Lines and Ticks are also available. Remaining axis fields, family-specific controls, live chart bindings and persistence remain pending. Menu choices and inherited tick colors are synthetic examples.</p>
    <button ref={opener} type="button" onClick={() => setOpen(true)}>Chart settings</button>
    <button type="button" onClick={() => setThemeKey((value) => value + 1)}>Rebuild preview theme</button>
    <div style={{ height: 520, marginTop: 12 }}>
      <ChartEditorDock open={open} activeTab={tab} onOpenChange={setOpen} onTabChange={setTab}
        themeResetKey={themeKey} openerRef={opener}
        galleryProps={{ groups: chartTypeGalleryGroups, selectedType, onSelect: setSelectedType }}
        setup={<ChartSetupPanel value={setup} categories={[{ value: "period", label: "Period" }, { value: "region", label: "Region" }]}
          aggregationMethods={[{ value: "sum", label: "Sum" }, { value: "average", label: "Average" }]} onEdit={editSetup} />}
        customize={<>
          <CustomizeGroup label="Chart Style">
            <ChartPaddingPanel value={padding} bounds={range(200)} onEdit={({ side, value }) => setPadding((current) => ({ ...current, [side]: value }))} />
            <ChartBackgroundPanel value={background} onEdit={({ field, value }) => setBackground((current) => ({ ...current, [field]: value }))} />
          </CustomizeGroup>
          <ChartTitlesPanel value={titles} fonts={fonts} weights={weights}
          sizes={[12, 13, 16, 20].map((value) => ({ value, label: String(value) }))}
          spacingBounds={{ min: 0, max: 100, step: 1 }} onEdit={editCaption} />
          <ChartLegendPanel value={legend} fonts={fonts} weights={weights}
            positions={["top", "right", "bottom", "left"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
            sizes={[8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36].map((value) => ({ value, label: String(value) }))}
            bounds={{ spacing: range(200), markerSize: range(40), markerStroke: range(10), itemSpacing: range(20), horizontalSpacing: range(50), verticalSpacing: range(50) }}
            onEdit={({ field, value }) => setLegend((current) => ({ ...current, [field]: value }))} />
          <CustomizeGroup label="Series">
            <ChartTooltipsPanel value={tooltips}
              modes={[{ value: "single", label: "Single" }, { value: "shared", label: "Multiple" }, { value: "compact", label: "Compact" }]}
              onEdit={({ field, value }) => setTooltips((current) => ({ ...current, [field]: value }))} />
            <ChartSeriesStylePanel controls={([
              ["strokeWidth", isLine ? "Line Width" : "Stroke Width", 10, 1, "any"],
              ["lineDash", "Line Dash", 30, 1, "any"],
              ["strokeOpacity", "Line Opacity", 1, 0.05, 0.05],
              ["fillOpacity", "Fill Opacity", 1, 0.05, 0.05],
            ] as const).filter(([field]) => !isLine || field !== "fillOpacity").map(([field, label, max, rangeStep, numberStep]) => ({ field, label, value: seriesStyle[field], min: 0, max: Math.max(max, seriesStyle[field]), rangeStep, numberStep }))}
              onEdit={({ field, value }) => setSeriesStyle((current) => ({ ...current, [field]: value }))} />
            {isLine && <ChartMarkersPanel value={markers}
              shapes={["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].map((value) => ({ value, label: value[0].toUpperCase() + value.slice(1) }))}
              onEdit={({ field, value }) => setMarkers((current) => ({ ...current, [field]: value }))} />}
            <ChartLabelsPanel value={labels} fonts={fonts} weights={weights}
              sizes={[8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36].map((value) => ({ value, label: String(value) }))}
              onEdit={({ field, value }) => setLabels((current) => ({ ...current, [field]: value }))} />
            {!isLine && <ChartShadowPanel value={shadow} onEdit={({ field, value }) => setShadow((current) => ({ ...current, [field]: value }))} />}
          </CustomizeGroup>
          {(["horizontal", "vertical"] as const).map((axis) => (
            <CustomizeGroup key={axis} label={axis === "horizontal" ? "Horizontal Axis" : "Vertical Axis"}>
              <ChartGridLinesPanel value={axisDetails[axis].grid}
                onEdit={({ field, value }) => setAxisDetails((current) => ({ ...current, [axis]: { ...current[axis], grid: { ...current[axis].grid, [field]: value } } }))} />
              <ChartTicksPanel value={axisDetails[axis].ticks} showLength={true}
                onEdit={({ field, value }) => setAxisDetails((current) => ({ ...current, [axis]: { ...current[axis], ticks: { ...current[axis].ticks, [field]: value } } }))} />
            </CustomizeGroup>
          ))}
        </>} />
    </div>
  </section>;
}

const meta = { title: "Organisms/ChartEditorControls", component: ChartEditorControlsPreview } satisfies Meta<typeof ChartEditorControlsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controlled: Story = {};
