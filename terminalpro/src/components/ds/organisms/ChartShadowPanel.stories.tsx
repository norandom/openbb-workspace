import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartShadowPanel, type ChartShadowState } from "../../General/Table/Chart/editor/shadow/ChartShadowPanel";

const meta = { title: "Organisms/ChartShadowPanel", component: ChartShadowPanel } satisfies Meta<typeof ChartShadowPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const initialShadow: ChartShadowState = { enabled: false, color: "#00000080", blur: 5, xOffset: 3, yOffset: 3 };
export function ShadowPreview() {
  const [value, setValue] = useState(initialShadow);
  return <div><p>Shadow subsection only. Chart rendering, family eligibility and storage remain pending.</p>
    <div style={{ width: 260 }}><ChartShadowPanel value={value}
      onEdit={({ field, value }) => setValue((current) => ({ ...current, [field]: value }))} /></div>
    <output aria-label="Shadow state">{JSON.stringify(value)}</output>
  </div>;
}
export const Controlled: Story = {
  args: { value: initialShadow, onEdit: () => {} },
  render: () => <ShadowPreview />,
};
