import { DataTable, type DataTableColumn } from "~/components/ds/molecules/DataTable";
import type { Projection, SavedRun } from "~/lib/modeling/contract";

type Output = Projection["results"][0];

const columns: DataTableColumn<Output>[] = [
  {
    id: "value",
    header: "Value",
    width: "auto",
    cell: (row) => row.display_text ?? "—",
  },
  { id: "unit", header: "Unit", width: "auto", cell: (row) => row.unit },
  { id: "status", header: "Status", width: "auto", cell: (row) => row.status },
  { id: "freshness", header: "Freshness", width: "auto", cell: (row) => row.freshness },
  { id: "reason", header: "Reason", width: "fill", cell: (row) => row.reason },
];

export default function ModelingResult({
  run,
  output,
  stale,
}: {
  run: SavedRun;
  output: Projection;
  stale: boolean;
}) {
  const row = output.results[0];
  const displayed = stale ? { ...row, freshness: "stale" as const } : row;
  return (
    <section
      aria-label="Saved modeling result"
      className="flex flex-col gap-2 break-words"
    >
      <p>
        Saved run ID <code className="select-all">{run.run_id}</code>
      </p>
      <p>
        {run.descriptor.model_id} · Method {run.descriptor.method_version} ·{" "}
        {run.created_at}
      </p>
      <DataTable
        columns={columns}
        data={[displayed]}
        getRowId={(row) => row.output_id}
      />
      <p>{row.semantic_definition}</p>
      {row.check_explanations && <p>{row.check_explanations}</p>}
      <details open>
        <summary>Assumptions</summary>
        <p>
          Version {run.assumptions.version} · Effective {run.assumptions.effective_date}
        </p>
        <ul className="list-disc pl-5">
          {run.assumptions.assumptions.map((item) => (
            <li key={item.assumption_id}>
              {item.assumption_id} = {String(item.value)} {item.unit} ({item.origin}).{" "}
              {item.rationale}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Checks and verification</summary>
        <ul className="list-disc pl-5">
          {output.checks.map((check) => (
            <li key={check.rule_id}>
              {check.rule_id} v{check.rule_version} · {check.severity} · {check.status}.{" "}
              {check.explanation}
            </li>
          ))}
          {output.verification.map((item) => (
            <li key={item.output_id}>
              Independent verification · {item.status}. {item.explanation}
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Trace</summary>
        {output.trace.length === 0 && <p>No calculation trace is available.</p>}
        <ul className="list-disc pl-5">
          {output.trace.map((trace) => (
            <li key={trace.trace_id}>
              <p>
                {trace.formula_id} v{trace.formula_version} · {trace.expression}
              </p>
              <p>Inputs {trace.input_ids.join(", ")}</p>
              <p>Source records {trace.source_record_ids.join(", ")}</p>
              <ul className="list-disc pl-5">
                {trace.substitutions
                  .concat(trace.intermediate_values)
                  .map((item, index) => (
                    <li key={`${item.name}-${index}`}>
                      {item.name} = {item.value} {item.unit} {item.currency}
                      {item.scale !== 0 && ` × 10^${item.scale}`}
                      {item.period_end &&
                        ` · ${item.period_start ?? ""} through ${item.period_end}`}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
