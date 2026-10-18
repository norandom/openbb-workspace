import { useEffect, useState } from "react";
import "./chartPaddingPanel.css";

export type ChartPaddingState = Record<"top" | "right" | "bottom" | "left", number>;
export type ChartPaddingEdit = { side: keyof ChartPaddingState; value: number };
export type ChartPaddingPanelProps = {
  value: ChartPaddingState;
  onEdit: (edit: ChartPaddingEdit) => void;
  bounds: { min: number; max: number; step: number };
};
const sides = ["top", "right", "bottom", "left"] as const;
function validNumber(text: string, min: number) {
  return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) &&
    Number.isFinite(Number(text)) && Number(text) >= min;
}
function PaddingSide({ side, value, bounds, onEdit }: {
  side: keyof ChartPaddingState;
  value: number;
  bounds: ChartPaddingPanelProps["bounds"];
  onEdit: ChartPaddingPanelProps["onEdit"];
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const label = side[0].toUpperCase() + side.slice(1);
  const max = Number.isFinite(value) ? Math.max(bounds.max, value) : bounds.max;
  function update(text: string) {
    setDraft(text);
    if (validNumber(text, bounds.min)) onEdit({ side, value: Number(text) });
  }
  return <div className="chart-padding-row">
    <span>{label}</span>
    <div className="chart-padding-inputs">
      <input aria-label={label} type="range" {...bounds} max={max} value={value}
        onChange={(event) => update(event.target.value)} />
      <input aria-label={`${label} value`} inputMode="decimal" value={draft}
        aria-invalid={!validNumber(draft, bounds.min)} onChange={(event) => update(event.target.value)} />
    </div>
  </div>;
}
export function ChartPaddingPanel({ value, bounds, onEdit }: ChartPaddingPanelProps) {
  return <fieldset className="chart-padding-panel" aria-label="Padding">
    <legend>Padding</legend>
    {sides.map((side) => <PaddingSide key={side} side={side} value={value[side]} bounds={bounds} onEdit={onEdit} />)}
  </fieldset>;
}
