import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ChartSetupPanel, type ChartSetupEdit, type ChartSetupState } from "../../General/Table/Chart/editor/setup/ChartSetupPanel";

const meta = { title: "Organisms/ChartSetupPanel", component: ChartSetupPanel } satisfies Meta<typeof ChartSetupPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const initialSetup: ChartSetupState = { categoryId: "period", aggregate: false, aggregationMethod: "sum", series: [{ id: "revenue", label: "Revenue (USD millions)" }, { id: "income", label: "Operating Income (USD millions)" }], switchCategorySeries: false };
export function SetupPreview() {
  const [value, setValue] = useState(initialSetup);
  function edit(change: ChartSetupEdit) {
    setValue((current) => {
      if (change.kind === "category") return { ...current, categoryId: change.value };
      if (change.kind === "aggregation-method") return { ...current, aggregationMethod: change.value };
      if (change.kind === "aggregate") return { ...current, aggregate: change.value };
      if (change.kind === "switch-category-series") return { ...current, switchCategorySeries: change.value };
      if (change.kind === "series-remove") return { ...current, series: current.series.filter((item) => item.id !== change.id) };
      if (change.kind === "series-order") return { ...current, series: change.ids.flatMap((id) => current.series.filter((item) => item.id === id)) };
      return current;
    });
  }
  return <div><p>Controlled Set Up preview with synthetic values. Session storage, data transformation and financial rendering remain pending.</p>
    <div style={{ width: 260 }}><ChartSetupPanel value={value} categories={[{ value: "period", label: "Period" }, { value: "region", label: "Region (example)" }]} aggregationMethods={[{ value: "sum", label: "Sum" }, { value: "mean", label: "Mean (example)" }]} onEdit={edit} /></div>
    <output aria-label="Setup state">{JSON.stringify(value)}</output>
  </div>;
}
export const Controlled: Story = {
  args: { value: initialSetup, categories: [{ value: "period", label: "Period" }], aggregationMethods: [{ value: "sum", label: "Sum" }], onEdit: () => {} },
  render: () => <SetupPreview />,
};
