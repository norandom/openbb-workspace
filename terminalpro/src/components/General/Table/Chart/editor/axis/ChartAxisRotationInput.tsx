import { useEffect, useRef, useState } from "react";

export interface ChartAxisRotationInputProps {
  value: number | undefined;
  onChange: (value: number) => void;
}

function normalize(angle: number) {
  return Math.floor(((angle + 180) % 360 + 360) % 360 - 180);
}
function display(value: number | undefined) {
  return value === undefined ? 0 : value < 0 ? 360 + value : value;
}

export function ChartAxisRotationInput({ value, onChange }: ChartAxisRotationInputProps) {
  const [draft, setDraft] = useState(String(display(value)));
  const stopDrag = useRef<(() => void) | undefined>(undefined);
  useEffect(() => setDraft(String(display(value))), [value]);
  useEffect(() => () => stopDrag.current?.(), []);
  const valid = draft.trim() === "" || (Number.isFinite(Number(draft)) && Number(draft) >= 0 && Number(draft) <= 360);
  function update(text: string) {
    setDraft(text);
    const angle = Number(text);
    if (Number.isFinite(angle) && angle >= 0 && angle <= 360) onChange(normalize(angle));
  }
  function beginDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    stopDrag.current?.();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerId = event.pointerId;
    function move(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return;
      const angle = Math.atan2(pointer.clientY - rect.top - rect.height / 2, pointer.clientX - rect.left - rect.width / 2) * 180 / Math.PI;
      const next = normalize(angle);
      setDraft(String(display(next)));
      onChange(next);
    }
    function stop(pointer?: PointerEvent) {
      if (pointer && pointer.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      stopDrag.current = undefined;
    }
    stopDrag.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    move(event.nativeEvent);
  }
  const radians = (value ?? 0) * Math.PI / 180;
  return (
    <div className="chart-caption-row chart-axis-rotation">
      <span>Label rotation</span>
      <div className="chart-axis-rotation-controls">
        <div className="chart-axis-rotation-dial" role="img" aria-label="Rotation dial" onPointerDown={beginDrag}>
          <span style={{ left: 12 + Math.cos(radians) * 8, top: 12 + Math.sin(radians) * 8 }} />
        </div>
        <input aria-label="Label rotation" type="number" min={0} max={360} step="any"
          inputMode="decimal" value={draft} aria-invalid={!valid}
          onChange={(event) => update(event.target.value)} />
        <span>°</span>
      </div>
    </div>
  );
}
