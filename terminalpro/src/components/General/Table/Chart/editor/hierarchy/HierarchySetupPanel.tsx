import { type ReactNode, useId, useRef, useState } from "react";
import { Switch } from "../../../../../ds/atoms/Switch";
import type { HierarchySetupEdit } from "../../application/hierarchySetupTypes";
import type { HierarchySetupSelection } from "../../application/hierarchyTypes";
import {
  DEFAULT_SETUP_CATEGORY,
  SETUP_AGGREGATIONS,
} from "../../application/setupTypes";
import type { SnapshotColumn } from "../../compatibility/snapshotTypes";
import "../setup/chartSetupPanel.css";

export interface HierarchySetupPanelProps {
  readonly columns: readonly SnapshotColumn[];
  readonly selection: HierarchySetupSelection;
  readonly onEdit: (edit: HierarchySetupEdit) => void;
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const id = useId();
  return (
    <section className="chart-setup-group">
      <button
        type="button"
        className="chart-setup-heading"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? "⌄" : "›"}</span>
        {label}
      </button>
      {open && (
        <div id={id} className="chart-setup-content">
          {children}
        </div>
      )}
    </section>
  );
}

function AddField({
  label,
  choices,
  onAdd,
}: {
  label: string;
  choices: readonly SnapshotColumn[];
  onAdd: (id: string) => void;
}) {
  if (choices.length === 0) return null;
  return (
    <div className="chart-setup-add">
      <select
        aria-label={label}
        value=""
        onChange={(event) => {
          const choice = choices.find(
            (_, index) => String(index) === event.target.value,
          );
          if (choice) onAdd(choice.id);
        }}
      >
        <option value="" disabled>
          {label}
        </option>
        {choices.map((choice, index) => (
          <option key={choice.id} value={String(index)}>
            {choice.label}
          </option>
        ))}
      </select>
      <span aria-hidden="true">+</span>
    </div>
  );
}

function OrderedFields({
  ids,
  columns,
  numeric,
  onRemove,
  onOrder,
}: {
  ids: readonly string[];
  columns: readonly SnapshotColumn[];
  numeric?: boolean;
  onRemove: (id: string) => void;
  onOrder: (ids: readonly string[]) => void;
}) {
  const dragged = useRef<string | null>(null);
  function reorder(source: string | null, target: string) {
    if (source === null) return;
    const order = [...ids];
    const from = order.indexOf(source);
    const to = order.indexOf(target);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    onOrder(order);
  }
  return (
    <div className="chart-setup-series">
      {ids.map((id, index) => {
        const label = columns.find((column) => column.id === id)?.label ?? id;
        return (
          <div
            key={id}
            className="chart-setup-chip"
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              reorder(dragged.current, id);
              dragged.current = null;
            }}
          >
            <button
              type="button"
              className="chart-setup-grip"
              draggable
              aria-label={`Reorder ${label}`}
              title="Drag or use Up and Down arrows to reorder"
              onDragStart={(event) => {
                dragged.current = id;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => {
                dragged.current = null;
              }}
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const target = ids[index + (event.key === "ArrowUp" ? -1 : 1)];
                if (target !== undefined) reorder(id, target);
              }}
            >
              <span aria-hidden="true">⠿</span>
            </button>
            <span className="chart-setup-series-label">
              {label}
              {numeric && <small> ({index === 0 ? "Size" : "Color"})</small>}
            </span>
            <button
              type="button"
              className="chart-setup-remove"
              aria-label={`Remove ${label}`}
              onClick={() => onRemove(id)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function Aggregation({
  selection,
  onEdit,
}: Pick<HierarchySetupPanelProps, "selection" | "onEdit">) {
  if (selection.categoryIds.length === 0) return null;
  return (
    <>
      <div className="chart-setup-switch">
        <Switch
          label="Aggregate"
          checked={selection.aggFunc !== undefined}
          onCheckedChange={(value) => onEdit({ kind: "aggregate", value })}
        />
      </div>
      {selection.aggFunc !== undefined && (
        <select
          aria-label="Aggregation method"
          value={selection.aggFunc}
          onChange={(event) => {
            const value = SETUP_AGGREGATIONS.find(
              (method) => method === event.target.value,
            );
            if (value) onEdit({ kind: "aggregation-method", value });
          }}
        >
          {SETUP_AGGREGATIONS.map((value) => (
            <option key={value} value={value}>
              {value[0].toUpperCase() + value.slice(1)}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

export function HierarchySetupPanel({
  columns,
  selection,
  onEdit,
}: HierarchySetupPanelProps) {
  const available = (role: SnapshotColumn["role"], ids: readonly string[]) =>
    columns.filter(
      (column) =>
        column.role === role &&
        column.id !== DEFAULT_SETUP_CATEGORY &&
        !ids.includes(column.id),
    );
  return (
    <div className="chart-setup-panel">
      <Group label="Categories">
        <OrderedFields
          ids={selection.categoryIds}
          columns={columns}
          onRemove={(id) => onEdit({ kind: "category-remove", id })}
          onOrder={(ids) => onEdit({ kind: "category-order", ids })}
        />
        <AddField
          label="Add a category"
          choices={available("category", selection.categoryIds)}
          onAdd={(id) => onEdit({ kind: "category-add", id })}
        />
        <Aggregation selection={selection} onEdit={onEdit} />
      </Group>
      <Group label="Series">
        <OrderedFields
          ids={selection.seriesIds}
          columns={columns}
          numeric
          onRemove={(id) => onEdit({ kind: "series-remove", id })}
          onOrder={(ids) => onEdit({ kind: "series-order", ids })}
        />
        {selection.seriesIds.length < 2 && (
          <AddField
            label="Add a series"
            choices={available("number", selection.seriesIds)}
            onAdd={(id) => onEdit({ kind: "series-add", id })}
          />
        )}
      </Group>
    </div>
  );
}
