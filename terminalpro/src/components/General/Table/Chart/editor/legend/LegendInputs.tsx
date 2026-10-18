import { useEffect, useState } from "react";

export interface LegendChoice<T> {
  value: T;
  label: string;
}
export interface LegendBounds {
  min: number;
  max: number;
  step: number;
}

export function LegendChoiceInput<T extends string | number>({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: T;
  choices: readonly LegendChoice<T>[];
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

export function LegendNumberInput({
  label,
  value,
  bounds,
  onChange,
}: {
  label: string;
  value: number;
  bounds: LegendBounds;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function validNumber(text: string) {
    return (
      /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim()) &&
      Number.isFinite(Number(text)) &&
      Number(text) >= bounds.min
    );
  }
  function update(text: string) {
    setDraft(text);
    if (validNumber(text)) onChange(Number(text));
  }
  const max = Number.isFinite(value) ? Math.max(bounds.max, value) : bounds.max;
  return (
    <div className="chart-caption-row">
      <span>{label}</span>
      <div className="chart-caption-spacing">
        <input
          aria-label={label}
          type="range"
          {...bounds}
          max={max}
          value={value}
          onChange={(event) => update(event.target.value)}
        />
        <input
          aria-label={`${label} value`}
          inputMode="decimal"
          value={draft}
          aria-invalid={!validNumber(draft)}
          onChange={(event) => update(event.target.value)}
        />
      </div>
    </div>
  );
}
