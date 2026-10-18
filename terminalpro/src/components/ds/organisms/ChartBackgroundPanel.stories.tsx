import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartBackgroundPanel, type ChartBackgroundState } from "../../General/Table/Chart/editor/background/ChartBackgroundPanel";

const meta = { title: "Organisms/ChartBackgroundPanel", component: ChartBackgroundPanel } satisfies Meta<typeof ChartBackgroundPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const initialBackground: ChartBackgroundState = { visible: true, fill: "#151518" };
export function BackgroundPreview() {
  const [value, setValue] = useState(initialBackground);
  return <div><p>Background subsection only. Other Chart Style controls, chart rendering and storage remain pending.</p>
    <div style={{ width: 260 }}><ChartBackgroundPanel value={value}
      onEdit={({ field, value }) => setValue((current) => ({ ...current, [field]: value }))} /></div>
    <output aria-label="Background state">{JSON.stringify(value)}</output>
  </div>;
}
export const Controlled: Story = {
  args: { value: initialBackground, onEdit: () => {} },
  render: () => <BackgroundPreview />,
};
