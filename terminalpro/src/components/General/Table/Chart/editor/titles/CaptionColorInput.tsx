import { useEffect, useRef, useState } from "react";
import { RgbaColorPicker } from "react-colorful";
import { color } from "echarts/core";
import * as Popover from "@radix-ui/react-popover";

export function CaptionColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => setDraft(value), [value]);
  const parsed = color.parse(draft);
  const valid = !!parsed;
  const rgba = parsed || color.parse(value) || [0, 0, 0, 1];
  function close() {
    setOpen(false);
    opener.current?.focus();
  }
  function update(text: string) {
    setDraft(text);
    if (color.parse(text)) onChange(text);
  }
  return (
    <div className="chart-caption-color">
      <div className="chart-caption-row">
        <span>Color</span>
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Anchor asChild>
            <div className="chart-caption-color-value">
              <Popover.Trigger asChild>
                <button
                  type="button"
                  aria-label="Choose color"
                  aria-expanded={open}
                  ref={opener}
                  style={{ backgroundColor: value }}
                />
              </Popover.Trigger>
              <input
                aria-label="Color"
                value={draft}
                aria-invalid={!valid}
                onChange={(event) => update(event.target.value)}
              />
            </div>
          </Popover.Anchor>
          <Popover.Portal
            container={
              opener.current?.closest<HTMLElement>(".dark, [data-theme]") || undefined
            }
          >
            <Popover.Content
              side="top"
              align="end"
              sideOffset={6}
              aria-label="Color picker"
              className="chart-caption-picker"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  close();
                }
              }}
            >
              <RgbaColorPicker
                color={{ r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] }}
                onChange={({ r, g, b, a }) => update(`rgba(${r}, ${g}, ${b}, ${a})`)}
              />
              <input
                aria-label="Picker color"
                value={draft}
                aria-invalid={!valid}
                onChange={(event) => update(event.target.value)}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {!valid && (
        <span className="chart-caption-error" role="status">
          Enter a valid color
        </span>
      )}
    </div>
  );
}
