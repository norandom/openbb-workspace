import { useId, useState, type ReactNode } from "react";

export function ApplicationEditorGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <section className="chart-titles-panel">
      <button
        type="button"
        className="chart-titles-heading"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        <span aria-hidden="true">{expanded ? "⌄" : "›"}</span> {label}
      </button>
      {expanded && (
        <div id={id} role="region" aria-label={label} style={{ paddingTop: 12 }}>
          {children}
        </div>
      )}
    </section>
  );
}
