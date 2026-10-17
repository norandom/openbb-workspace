import type { Meta, StoryObj } from "@storybook/react";
import { useRef, useState } from "react";
import { ChartEditorDock, type ChartEditorTab } from "../../General/Table/Chart/editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "../../General/Table/Chart/editor/chartTypeGalleryCatalog";

const meta = { title: "Organisms/ChartEditorDock", component: ChartEditorDock } satisfies Meta<typeof ChartEditorDock>;
export default meta;
type Story = StoryObj<typeof meta>;

function FixturePanel({ label }: { label: string }) {
  const [expanded, setExpanded] = useState(false);
  return <div style={{ padding: 12 }}><button type="button" onClick={() => setExpanded(!expanded)}>{label} group</button>{expanded && <label>Value <input defaultValue="Fixture value" /></label>}</div>;
}

export function DockPreview() {
  const [open, setOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ChartEditorTab>("chart");
  const [selectedType, setSelectedType] = useState("groupedColumn");
  const opener = useRef<HTMLButtonElement>(null);
  return <div>
    <p>Dock component preview only. Set Up and Customize are interactive fixtures; application controls and session wiring remain pending.</p>
    <button ref={opener} type="button" onClick={() => setOpen(true)}>Chart settings</button>
    <div style={{ height: 343, marginTop: 12 }}>
      <ChartEditorDock open={open} activeTab={activeTab} onOpenChange={setOpen} onTabChange={setActiveTab} themeResetKey="preview"
        openerRef={opener} galleryProps={{ groups: chartTypeGalleryGroups, selectedType, onSelect: setSelectedType }}
        setup={<FixturePanel label="Setup" />} customize={<FixturePanel label="Customize" />} />
    </div>
    <p>Selected model: <output>{selectedType}</output></p>
  </div>;
}

export const Controlled: Story = {
  args: { open: true, activeTab: "chart", onOpenChange: () => {}, onTabChange: () => {}, themeResetKey: "preview", galleryProps: { groups: chartTypeGalleryGroups, selectedType: "groupedColumn", onSelect: () => {} }, setup: <FixturePanel label="Setup" />, customize: <FixturePanel label="Customize" /> },
  render: () => <DockPreview />,
};
