import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartTypeGallery } from "../../General/Table/Chart/editor/ChartTypeGallery";
import { chartTypeGalleryGroups } from "../../General/Table/Chart/editor/chartTypeGalleryCatalog";

const meta = {
  title: "Organisms/ChartTypeGallery",
  component: ChartTypeGallery,
  parameters: { docs: { description: { component: "Gallery component preview only. Chart rendering, Set Up, Customize and persistence are separate integration work." } } },
} satisfies Meta<typeof ChartTypeGallery>;
export default meta;
type Story = StoryObj<typeof meta>;

function GalleryPreview() {
  const [selectedType, setSelectedType] = useState("groupedColumn");
  return <div style={{ width: 260 }}>
    <p style={{ fontSize: 12, marginBottom: 12 }}>Gallery component preview only</p>
    <div style={{ height: 315 }}>
      <ChartTypeGallery groups={chartTypeGalleryGroups} selectedType={selectedType} onSelect={setSelectedType} />
    </div>
    <p style={{ fontSize: 12, marginTop: 12 }}>Selected model: <output>{selectedType}</output></p>
  </div>;
}

export const Controlled: Story = {
  args: { groups: chartTypeGalleryGroups, selectedType: "groupedColumn", onSelect: () => {} },
  render: () => <GalleryPreview />,
};
