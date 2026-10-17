import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { ChartEditorDock, type ChartEditorTab } from "../../General/Table/Chart/editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "../../General/Table/Chart/editor/chartTypeGalleryCatalog";
import { ChartSetupPanel, type ChartSetupEdit, type ChartSetupState } from "../../General/Table/Chart/editor/setup/ChartSetupPanel";
import { ChartTitlesPanel, type ChartCaptionEdit, type ChartCaptionState } from "../../General/Table/Chart/editor/titles/ChartTitlesPanel";

const initialSetup: ChartSetupState = {
  categoryId: "period", aggregate: false, aggregationMethod: "sum",
  series: [{ id: "revenue", label: "Revenue" }, { id: "eps", label: "EPS" }],
  switchCategorySeries: false,
};
const caption = (text: string, size: number, spacing: number): ChartCaptionState => ({
  enabled: false, text, font: "Verdana, sans-serif", weight: "predefined", size, color: "#FFFFFF", spacing,
});

export function ChartEditorControlsPreview() {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<ChartEditorTab>("setup");
  const [selectedType, setSelectedType] = useState("groupedColumn");
  const [themeKey, setThemeKey] = useState(0);
  const [setup, setSetup] = useState(initialSetup);
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
    <p>Production controls preview: Set Up and Titles. Other Customize groups, chart rendering and persistence remain pending. Additional menu choices and bounds are candidate examples.</p>
    <button ref={opener} type="button" onClick={() => setOpen(true)}>Chart settings</button>
    <button type="button" onClick={() => setThemeKey((value) => value + 1)}>Rebuild preview theme</button>
    <div style={{ height: 520, marginTop: 12 }}>
      <ChartEditorDock open={open} activeTab={tab} onOpenChange={setOpen} onTabChange={setTab}
        themeResetKey={themeKey} openerRef={opener}
        galleryProps={{ groups: chartTypeGalleryGroups, selectedType, onSelect: setSelectedType }}
        setup={<ChartSetupPanel value={setup} categories={[{ value: "period", label: "Period" }, { value: "region", label: "Region" }]}
          aggregationMethods={[{ value: "sum", label: "Sum" }, { value: "average", label: "Average" }]} onEdit={editSetup} />}
        customize={<ChartTitlesPanel value={titles} fonts={[{ value: "Verdana, sans-serif", label: "Verdana, sans-serif" }, { value: "Arial, sans-serif", label: "Arial, sans-serif" }]}
          weights={[{ value: "predefined", label: "Predefined" }, { value: "normal", label: "Normal" }, { value: "bold", label: "Bold" }, { value: "italic", label: "Italic" }, { value: "bold-italic", label: "Bold Italic" }]}
          sizes={[12, 13, 16, 20].map((value) => ({ value, label: String(value) }))}
          spacingBounds={{ min: 0, max: 100, step: 1 }} onEdit={editCaption} />} />
    </div>
  </section>;
}

const meta = { title: "Organisms/ChartEditorControls", component: ChartEditorControlsPreview } satisfies Meta<typeof ChartEditorControlsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Controlled: Story = {};
