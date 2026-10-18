import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  ChartTooltipsPanel,
  type ChartTooltipsState,
} from "../../General/Table/Chart/editor/tooltips/ChartTooltipsPanel";

const meta = {
  title: "Organisms/ChartTooltipsPanel",
  component: ChartTooltipsPanel,
} satisfies Meta<typeof ChartTooltipsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const tooltipModes = [
  { value: "single", label: "Single" },
  { value: "shared", label: "Multiple" },
  { value: "compact", label: "Compact" },
] as const;
export const initialTooltips: ChartTooltipsState = { enabled: true, mode: "shared" };
export function TooltipsPreview() {
  const [value, setValue] = useState(initialTooltips);
  return (
    <div>
      <p>
        Tooltips subsection within Series. Other Series controls and live chart bindings
        remain pending.
      </p>
      <div style={{ width: 260 }}>
        <ChartTooltipsPanel
          value={value}
          modes={tooltipModes}
          onEdit={(edit) =>
            setValue((current) => ({ ...current, [edit.field]: edit.value }))
          }
        />
      </div>
      <output aria-label="Tooltips state">{JSON.stringify(value)}</output>
    </div>
  );
}
export const Controlled: Story = {
  args: { value: initialTooltips, modes: tooltipModes, onEdit: () => {} },
  render: () => <TooltipsPreview />,
};
