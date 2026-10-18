import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import {
  ChartSeriesStylePanel,
  type SeriesStyleControl,
} from "../../General/Table/Chart/editor/series/ChartSeriesStylePanel";
const meta = {
  title: "Organisms/ChartSeriesStylePanel",
  component: ChartSeriesStylePanel,
} satisfies Meta<typeof ChartSeriesStylePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const initialSeriesControls: SeriesStyleControl[] = [
  {
    field: "strokeWidth",
    label: "Stroke Width",
    value: 1,
    min: 0,
    max: 10,
    rangeStep: 1,
    numberStep: "any",
  },
  {
    field: "lineDash",
    label: "Line Dash",
    value: 0,
    min: 0,
    max: 30,
    rangeStep: 1,
    numberStep: "any",
  },
  {
    field: "strokeOpacity",
    label: "Line Opacity",
    value: 1,
    min: 0,
    max: 1,
    rangeStep: 0.05,
    numberStep: 0.05,
  },
  {
    field: "fillOpacity",
    label: "Fill Opacity",
    value: 1,
    min: 0,
    max: 1,
    rangeStep: 0.05,
    numberStep: 0.05,
  },
];
export function SeriesStylePreview() {
  const [controls, setControls] = useState(initialSeriesControls);
  return (
    <div>
      <p>
        Series numeric styling preview. Labels, other family controls, axes and
        live chart bindings remain pending.
      </p>
      <div style={{ width: 260 }}>
        <ChartSeriesStylePanel
          controls={controls.map((control) => ({
            ...control,
            max: Math.max(control.value, control.max),
          }))}
          onEdit={(edit) =>
            setControls((current) =>
              current.map((control) =>
                control.field === edit.field
                  ? { ...control, value: edit.value }
                  : control,
              ),
            )
          }
        />
      </div>
      <output aria-label="Series styling state">
        {JSON.stringify(controls)}
      </output>
    </div>
  );
}
export const Controlled: Story = {
  args: { controls: initialSeriesControls, onEdit: () => {} },
  render: () => <SeriesStylePreview />,
};
