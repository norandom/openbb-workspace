import { useId, useRef, useState, type ReactNode } from "react";
import { Switch } from "../../../../../ds/atoms/Switch";
import "./chartSetupPanel.css";

export type ChartSetupChoice = { value: string; label: string };
export type ChartSetupState = {
  categoryId: string;
  aggregate: boolean;
  aggregationMethod: string;
  series: readonly { id: string; label: string }[];
  switchCategorySeries: boolean;
};
export type ChartSetupEdit =
  | { kind: "category" | "aggregation-method"; value: string }
  | { kind: "aggregate" | "switch-category-series"; value: boolean }
  | { kind: "series-remove" | "series-add"; id: string }
  | { kind: "series-order"; ids: readonly string[] };
export type ChartSetupPanelProps = {
  value: ChartSetupState;
  categories: readonly ChartSetupChoice[];
  availableSeries?: readonly ChartSetupChoice[];
  aggregationMethods: readonly ChartSetupChoice[];
  onEdit: (edit: ChartSetupEdit) => void;
};

function Group({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return <section className="chart-setup-group">
    <button type="button" className="chart-setup-heading" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span aria-hidden="true">{open ? "⌄" : "›"}</span>{label}
    </button>
    {open && <div id={id} className="chart-setup-content">{children}</div>}
  </section>;
}

function Choice({ label, value, choices, onChange }: { label: string; value: string; choices: readonly ChartSetupChoice[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    {!choices.some((choice) => choice.value === value) && <option value={value}>{value}</option>}
    {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select>;
}

function Series({ series, onEdit }: Pick<ChartSetupState, "series"> & Pick<ChartSetupPanelProps, "onEdit">) {
  const dragged = useRef<string | null>(null);
  function reorder(source: string | null, target: string) {
    if (source === null) return;
    const ids = series.map((item) => item.id);
    const from = ids.indexOf(source);
    const to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onEdit({ kind: "series-order", ids });
  }
  return <div className="chart-setup-series">{series.map((item, index) => <div key={item.id} className="chart-setup-chip"
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
    onDrop={(event) => { event.preventDefault(); reorder(dragged.current, item.id); dragged.current = null; }}>
    <button type="button" className="chart-setup-grip" draggable aria-label={`Reorder ${item.label}`} title="Drag or use Up and Down arrows to reorder"
      onDragStart={(event) => { dragged.current = item.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }}
      onDragEnd={() => { dragged.current = null; }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const target = series[index + (event.key === "ArrowUp" ? -1 : 1)];
        if (target) reorder(item.id, target.id);
      }}><span aria-hidden="true">⠿</span></button>
    <span className="chart-setup-series-label">{item.label}</span>
    <button type="button" className="chart-setup-remove" aria-label={`Remove ${item.label}`} onClick={() => onEdit({ kind: "series-remove", id: item.id })}><span aria-hidden="true">×</span></button>
  </div>)}</div>;
}

export function ChartSetupPanel({ value, categories, availableSeries = [], aggregationMethods, onEdit }: ChartSetupPanelProps) {
  const unselected = availableSeries.filter((choice) => !value.series.some((series) => series.id === choice.value));
  return <div className="chart-setup-panel">
    <Group label={value.switchCategorySeries ? "Series Labels" : "Categories"}>
      <Choice label="Category" value={value.categoryId} choices={categories} onChange={(next) => onEdit({ kind: "category", value: next })} />
      {value.categoryId !== "AG-GRID-DEFAULT-CATEGORY" && <>
        <div className="chart-setup-switch"><Switch label="Aggregate" checked={value.aggregate} onCheckedChange={(next) => onEdit({ kind: "aggregate", value: next })} /></div>
        {value.aggregate && <Choice label="Aggregation method" value={value.aggregationMethod} choices={aggregationMethods} onChange={(next) => onEdit({ kind: "aggregation-method", value: next })} />}
      </>}
    </Group>
    <Group label={value.switchCategorySeries ? "Category Values" : "Series"}><Series series={value.series} onEdit={onEdit} />
      {unselected.length > 0 && <div className="chart-setup-add"><select aria-label="Add a series" value="" onChange={(event) => {
        const choice = unselected.find((_, index) => String(index) === event.target.value);
        if (choice) onEdit({ kind: "series-add", id: choice.value });
      }}>
        <option value="" disabled>Add a series</option>
        {unselected.map((choice, index) => <option key={choice.value} value={String(index)}>{choice.label}</option>)}
      </select><span aria-hidden="true">+</span></div>}
      <div className="chart-setup-switch chart-setup-transpose"><Switch label="Switch Category / Series" checked={value.switchCategorySeries} onCheckedChange={(next) => onEdit({ kind: "switch-category-series", value: next })} /></div>
    </Group>
  </div>;
}
