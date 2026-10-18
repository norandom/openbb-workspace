import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  ChartLabelsPanel,
  type ChartLabelsPanelProps,
} from "../../General/Table/Chart/editor/labels/ChartLabelsPanel";

const args: ChartLabelsPanelProps = {
  value: { enabled: true, font: "Verdana, sans-serif", weight: "predefined", size: 12, color: "#FFFFFF" },
  fonts: [
    { value: "Verdana, sans-serif", label: "Verdana, sans-serif" },
    { value: "Arial, sans-serif", label: "Arial, sans-serif" },
  ],
  weights: [
    { value: "predefined", label: "Predefined" },
    { value: "400-italic", label: "Italic" },
    { value: "700", label: "Bold" },
  ],
  sizes: [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36].map(
    (value) => ({ value, label: String(value) }),
  ),
  onEdit: () => {},
};
function Preview(props: ChartLabelsPanelProps) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ width: 260, background: "var(--surface-card)" }}>
      <p>Controlled ordinary Labels. Family selection, rendering and storage remain caller responsibilities.</p>
      <ChartLabelsPanel {...props} value={value}
        onEdit={(edit) => setValue((previous) => ({ ...previous, [edit.field]: edit.value }))} />
    </div>
  );
}
export default {
  title: "Chart/ChartLabelsPanel",
  component: ChartLabelsPanel,
  args,
  render: (props) => <Preview {...props} />,
} satisfies Meta<typeof ChartLabelsPanel>;
export const Controlled: StoryObj<typeof ChartLabelsPanel> = {};
