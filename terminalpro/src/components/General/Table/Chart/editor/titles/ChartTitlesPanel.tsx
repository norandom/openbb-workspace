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
export interface ChartTitlesPanelProps {
  value: Record<ChartCaptionId, ChartCaptionState>;
  fonts: readonly CaptionChoice<string>[];
  weights: readonly CaptionChoice<string>[];
  sizes: readonly CaptionChoice<number>[];
  spacingBounds: { min: number; max: number; step: number };
  onEdit: (edit: ChartCaptionEdit) => void;
}
const captions: readonly [ChartCaptionId, string][] = [
  ["title", "Chart Title"],
  ["subtitle", "Subtitle"],
  ["horizontalAxisTitle", "Horizontal Axis Title"],
  ["verticalAxisTitle", "Vertical Axis Title"],
];

export function ChartTitlesPanel(props: ChartTitlesPanelProps) {
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
        captions.map(([caption, label]) => (
          <fieldset key={caption} className="chart-caption-section" aria-label={label}>
            <div className="chart-caption-toggle">
              <span>{label}</span>
              <Switch
                aria-label={label}
                checked={props.value[caption].enabled}
                onCheckedChange={(value) =>
                  props.onEdit({ caption, field: "enabled", value })
                }
              />
            </div>
            {props.value[caption].enabled && (
              <CaptionFields {...props} caption={caption} />
            )}
          </fieldset>
        ))}
    </div>
  );
}
