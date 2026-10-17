import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  ChartTitlesPanel,
  type ChartCaptionState,
  type ChartTitlesPanelProps,
} from "../../General/Table/Chart/editor/titles/ChartTitlesPanel";

const caption: ChartCaptionState = {
  enabled: true,
  text: "Revenue",
  font: "Verdana",
  weight: "predefined",
  size: 18,
  color: "rgba(39, 198, 160, 0.502)",
  spacing: 10,
};
const args: ChartTitlesPanelProps = {
  value: {
    title: { ...caption },
    subtitle: { ...caption, text: "USD million", size: 14 },
    horizontalAxisTitle: { ...caption, text: "Period", size: 12 },
    verticalAxisTitle: { ...caption, text: "USD million", size: 12 },
  },
  fonts: [
    { value: "Verdana", label: "Verdana" },
    { value: "Arial", label: "Arial" },
  ],
  weights: [
    { value: "predefined", label: "Predefined" },
    { value: "bold", label: "Bold" },
    { value: "italic", label: "Italic" },
  ],
  sizes: [12, 14, 18, 24].map((value) => ({ value, label: String(value) })),
  spacingBounds: { min: 0, max: 100, step: 1 },
  onEdit: () => {},
};
function Preview(props: ChartTitlesPanelProps) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ width: 260, background: "var(--surface-card)" }}>
      <p>
        Controlled Titles only. Example menu choices and bounds; other Customize groups
        and storage are pending.
      </p>
      <ChartTitlesPanel
        {...props}
        value={value}
        onEdit={(edit) =>
          setValue((previous) => ({
            ...previous,
            [edit.caption]: { ...previous[edit.caption], [edit.field]: edit.value },
          }))
        }
      />
    </div>
  );
}
export default {
  title: "Chart/ChartTitlesPanel",
  component: ChartTitlesPanel,
  args,
  render: (props) => <Preview {...props} />,
} satisfies Meta<typeof ChartTitlesPanel>;
export const Controlled: StoryObj<typeof ChartTitlesPanel> = {};
