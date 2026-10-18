import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import {
  ChartMarkersPanel,
  type ChartMarkersPanelProps,
} from "../../General/Table/Chart/editor/markers/ChartMarkersPanel";

const args: ChartMarkersPanelProps = {
  value: { enabled: true, shape: "circle", size: 7, strokeWidth: 0 },
  shapes: ["square", "circle", "cross", "diamond", "plus", "triangle", "heart"].map((value) => ({
    value, label: value[0].toUpperCase() + value.slice(1),
  })),
  onEdit: () => {},
};
function Preview(props: ChartMarkersPanelProps) {
  const [value, setValue] = useState(props.value);
  return (
    <div style={{ width: 260, background: "var(--surface-card)" }}>
      <p>Controlled Markers. The caller owns family eligibility, rendering and storage.</p>
      <ChartMarkersPanel {...props} value={value}
        onEdit={(edit) => setValue((previous) => ({ ...previous, [edit.field]: edit.value }))} />
    </div>
  );
}
export default {
  title: "Chart/ChartMarkersPanel",
  component: ChartMarkersPanel,
  args,
  render: (props) => <Preview {...props} />,
} satisfies Meta<typeof ChartMarkersPanel>;
export const Controlled: StoryObj<typeof ChartMarkersPanel> = {};
