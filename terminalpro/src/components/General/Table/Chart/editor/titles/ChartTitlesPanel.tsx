import { useState } from "react";
import { Switch } from "../../../../../ds/atoms/Switch";
import { CaptionFields } from "./CaptionFields";
import "./chartTitlesPanel.css";

export type ChartCaptionId =
  | "title"
  | "subtitle"
  | "horizontalAxisTitle"
  | "verticalAxisTitle";
export interface ChartCaptionState {
  enabled: boolean;
  text: string;
  font: string;
  weight: string;
  color: string;
  size: number;
  spacing: number;
}
export type ChartCaptionEdit = {
  [Field in keyof ChartCaptionState]: {
    caption: ChartCaptionId;
    field: Field;
    value: ChartCaptionState[Field];
  };
}[keyof ChartCaptionState];
export interface CaptionChoice<T> {
  value: T;
  label: string;
}
export interface CaptionTypographyChoices {
  fonts: readonly CaptionChoice<string>[];
  weights: readonly CaptionChoice<string>[];
  sizes: readonly CaptionChoice<number>[];
}
export interface CaptionOptions extends CaptionTypographyChoices {
  spacingBounds: { min: number; max: number; step: number };
}
export interface ChartTitlesPanelProps extends CaptionOptions {
  value: Record<ChartCaptionId, ChartCaptionState>;
  availableCaptions?: readonly ChartCaptionId[];
  optionsByCaption?: Readonly<Record<ChartCaptionId, CaptionOptions>>;
  onEdit: (edit: ChartCaptionEdit) => void;
}
const captions: readonly [ChartCaptionId, string][] = [
  ["title", "Chart Title"],
  ["subtitle", "Subtitle"],
  ["horizontalAxisTitle", "Horizontal Axis Title"],
  ["verticalAxisTitle", "Vertical Axis Title"],
];

export type AvailableChartTitlesProps = Omit<ChartTitlesPanelProps, "value" | "optionsByCaption"> & {
  value: Partial<Record<ChartCaptionId, ChartCaptionState>>;
  optionsByCaption?: Readonly<Partial<Record<ChartCaptionId, CaptionOptions>>>;
};
export function ChartTitlesPanel(props: AvailableChartTitlesProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="chart-titles-panel">
      <button
        type="button"
        className="chart-titles-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">{expanded ? "⌄" : "›"}</span> Titles
      </button>
      {expanded &&
        captions.filter(([caption]) => (!props.availableCaptions || props.availableCaptions.includes(caption)) && props.value[caption]).map(([caption, label]) => (
          <fieldset key={caption} className="chart-caption-section" aria-label={label}>
            <div className="chart-caption-toggle">
              <span>{label}</span>
              <Switch
                aria-label={label}
                checked={props.value[caption]!.enabled}
                onCheckedChange={(value) =>
                  props.onEdit({ caption, field: "enabled", value })
                }
              />
            </div>
            {props.value[caption]!.enabled && (
              <CaptionFields
                {...props}
                {...props.optionsByCaption?.[caption]}
                caption={caption}
                state={props.value[caption]!}
              />
            )}
          </fieldset>
        ))}
    </div>
  );
}
