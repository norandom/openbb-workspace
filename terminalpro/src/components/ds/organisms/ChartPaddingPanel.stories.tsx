import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartPaddingPanel, type ChartPaddingState } from "../../General/Table/Chart/editor/padding/ChartPaddingPanel";

const meta = { title: "Organisms/ChartPaddingPanel", component: ChartPaddingPanel } satisfies Meta<typeof ChartPaddingPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const initialPadding: ChartPaddingState = { top: 20, right: 20, bottom: 20, left: 20 };
export function PaddingPreview() {
  const [value, setValue] = useState(initialPadding);
  return <div><p>Padding subsection only. Other Chart Style controls and chart geometry remain pending.</p>
    <div style={{ width: 260 }}><ChartPaddingPanel value={value} bounds={{ min: 0, max: 200, step: 1 }}
      onEdit={({ side, value }) => setValue((current) => ({ ...current, [side]: value }))} /></div>
    <output aria-label="Padding state">{JSON.stringify(value)}</output>
  </div>;
}
export const Controlled: Story = {
  args: { value: initialPadding, bounds: { min: 0, max: 200, step: 1 }, onEdit: () => {} },
  render: () => <PaddingPreview />,
};
