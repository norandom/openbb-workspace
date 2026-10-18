import { useEffect, useState } from "react";
import "../titles/chartTitlesPanel.css";

export interface ChartNumberInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  rangeStep: number;
  numberStep: number | "any";
  onChange: (value: number) => void;
}

export function ChartNumberInput({
  label,
  value,
  min,
  max,
  rangeStep,
  numberStep,
  onChange,
}: ChartNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(String(value));
    setInvalid(false);
  }, [value]);
  function update(input: HTMLInputElement) {
    setDraft(input.value);
    const valid =
      input.value !== "" &&
      input.validity.valid &&
      Number.isFinite(input.valueAsNumber);
    setInvalid(!valid);
    if (valid) onChange(input.valueAsNumber);
  }
  return (
    <div className="chart-caption-row">
      <span>{label}</span>
      <div className="chart-caption-spacing">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={rangeStep}
          value={value}
          onChange={(event) => update(event.currentTarget)}
        />
        <input
          aria-label={`${label} value`}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={numberStep}
          value={draft}
          aria-invalid={invalid}
          onChange={(event) => update(event.currentTarget)}
        />
      </div>
    </div>
  );
}
