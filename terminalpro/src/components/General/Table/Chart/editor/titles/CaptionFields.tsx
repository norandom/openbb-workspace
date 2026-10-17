import { useEffect, useState } from "react";
import type {
  CaptionChoice,
  ChartCaptionId,
  ChartTitlesPanelProps,
} from "./ChartTitlesPanel";
import { CaptionColorInput } from "./CaptionColorInput";

function Choice<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly CaptionChoice<T>[];
  onChange: (value: T) => void;
}) {
  const known = choices.some((choice) => choice.value === value);
  return (
    <label className="chart-caption-row">
      <span>{label}</span>
      <select
        aria-label={label}
        value={String(value)}
        onChange={(event) => {
          const choice = choices.find(
            (item) => String(item.value) === event.target.value,
          );
          if (choice) onChange(choice.value);
        }}
      >
        {!known && <option value={String(value)}>{String(value)}</option>}
        {choices.map((choice) => (
          <option key={choice.value} value={String(choice.value)}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Spacing({
  value,
  bounds,
  onChange,
}: {
  value: number;
  bounds: ChartTitlesPanelProps["spacingBounds"];
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function validNumber(text: string) {
    const number = Number(text);
    return (
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) &&
      Number.isFinite(number) &&
      number >= bounds.min &&
      number <= bounds.max
    );
  }
  const valid = validNumber(draft);
  function update(text: string) {
    setDraft(text);
    const number = Number(text);
    if (validNumber(text)) onChange(number);
  }
  return (
    <div className="chart-caption-row">
      <span>Spacing</span>
      <div className="chart-caption-spacing">
        <input
          aria-label="Spacing"
          type="range"
          {...bounds}
          value={value}
          onChange={(event) => update(event.target.value)}
        />
        <input
          aria-label="Spacing value"
          inputMode="decimal"
          value={draft}
          aria-invalid={!valid}
          onChange={(event) => update(event.target.value)}
        />
      </div>
    </div>
  );
}

export function CaptionFields({
  caption,
  value,
  fonts,
  weights,
  sizes,
  spacingBounds,
  onEdit,
}: ChartTitlesPanelProps & { caption: ChartCaptionId }) {
  const state = value[caption];
  return (
    <div className="chart-caption-fields">
      <label className="chart-caption-row">
        <span>Title</span>
        <input
          aria-label="Title"
          value={state.text}
          onChange={(event) =>
            onEdit({ caption, field: "text", value: event.target.value })
          }
        />
      </label>
      <Choice
        label="Font"
        value={state.font}
        choices={fonts}
        onChange={(value) => onEdit({ caption, field: "font", value })}
      />
      <Choice
        label="Weight"
        value={state.weight}
        choices={weights}
        onChange={(value) => onEdit({ caption, field: "weight", value })}
      />
      <Choice
        label="Size"
        value={state.size}
        choices={sizes}
        onChange={(value) => onEdit({ caption, field: "size", value })}
      />
      <CaptionColorInput
        value={state.color}
        onChange={(value) => onEdit({ caption, field: "color", value })}
      />
      <Spacing
        value={state.spacing}
        bounds={spacingBounds}
        onChange={(value) => onEdit({ caption, field: "spacing", value })}
      />
    </div>
  );
}
