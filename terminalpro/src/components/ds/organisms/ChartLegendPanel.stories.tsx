import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  ChartLegendPanel,
  type ChartLegendPanelProps,
} from "../../General/Table/Chart/editor/legend/ChartLegendPanel";

const bounds = { min: 0, max: 40, step: 1 };
const args: ChartLegendPanelProps = {
  value: {
    enabled: true,
    font: "Verdana",
    weight: "predefined",
    size: 11,
    color: "#FFFFFF",
    position: "top",
    spacing: 20,
    markerSize: 11,
    markerStroke: 0,
    itemSpacing: 5,
    horizontalSpacing: 32,
    verticalSpacing: 8,
  },
  fonts: [
    { value: "Verdana", label: "Verdana" },
    { value: "Arial", label: "Arial" },
  ],
  weights: [
    { value: "predefined", label: "Predefined" },
    { value: "400-italic", label: "Italic" },
  ],
  sizes: [11, 18, 24].map((value) => ({ value, label: String(value) })),
  positions: ["top", "right", "bottom", "left"].map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
  })),
  bounds: {
    spacing: { ...bounds, max: 200 },
    markerSize: bounds,
    markerStroke: { ...bounds, max: 10 },
    itemSpacing: bounds,
    horizontalSpacing: bounds,
    verticalSpacing: bounds,
  },
  onEdit: () => {},
};
function Preview(props: ChartLegendPanelProps) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ width: 260, background: "var(--surface-card)" }}>
      <p>
        Controlled Legend only. Menu choices are examples. Renderer and storage
        integration remain pending.
      </p>
      <ChartLegendPanel
        {...props}
        value={value}
        onEdit={(edit) =>
          setValue((previous) => ({ ...previous, [edit.field]: edit.value }))
        }
      />
    </div>
  );
}
export default {
  title: "Chart/ChartLegendPanel",
  component: ChartLegendPanel,
  args,
  render: (props) => <Preview {...props} />,
} satisfies Meta<typeof ChartLegendPanel>;
export const Controlled: StoryObj<typeof ChartLegendPanel> = {};
