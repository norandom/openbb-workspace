import {
  ChartNumberInput,
  type ChartNumberInputProps,
} from "./ChartNumberInput";

export type SeriesStyleField =
  | "strokeWidth"
  | "lineDash"
  | "strokeOpacity"
  | "fillOpacity";
export interface SeriesStyleControl
  extends Omit<ChartNumberInputProps, "onChange"> {
  field: SeriesStyleField;
}
export interface ChartSeriesStylePanelProps {
  controls: readonly SeriesStyleControl[];
  onEdit: (edit: { field: SeriesStyleField; value: number }) => void;
}

export function ChartSeriesStylePanel({
  controls,
  onEdit,
}: ChartSeriesStylePanelProps) {
  return (
    <div className="chart-titles-panel chart-caption-section chart-caption-fields">
      {controls.map(({ field, ...control }) => (
        <ChartNumberInput
          key={field}
          {...control}
          onChange={(value) => onEdit({ field, value })}
        />
      ))}
    </div>
  );
}
