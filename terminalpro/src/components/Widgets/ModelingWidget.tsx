import { useState } from "react";
import DraggableCard from "~/components/DraggableCard";
import { Button } from "~/components/ds/atoms/Button";
import { Input } from "~/components/ds/atoms/Input";
import { Select } from "~/components/ds/atoms/Select";
import { Textarea } from "~/components/ds/atoms/TextArea";
import { useWidgetContext } from "~/components/Widget.context";
import {
  createEvaluationClient,
  type FcfParameters,
} from "~/lib/modeling/evaluationClient";
import {
  bindEvaluation,
  parameter,
  selectSavedOutput,
  updateModelParameter,
  useExplicitEvaluation,
  useSavedOutput,
} from "~/lib/modeling/runBindings";
import { useAuthStore } from "~/lib/state/auth";
import ModelingResult from "./ModelingResult";

const client = createEvaluationClient(() => useAuthStore.getState().user?.token);

export default function ModelingWidget({ evaluator }: { evaluator: boolean }) {
  const { widget, updateWidget, isShared, isPreview } = useWidgetContext();
  const session = useAuthStore((state) => state.user?.uuid);
  const [refresh, setRefresh] = useState(0);
  const params = widget.storage?.params ?? {};
  const readOnly = isShared || isPreview;

  function saveParams(transform: (current: typeof params) => typeof params) {
    updateWidget(
      (current) => ({
        ...current,
        storage: {
          ...current.storage,
          params: transform(current.storage?.params ?? {}),
        },
      }),
      true,
    );
  }

  function edit(name: Parameters<typeof parameter>[1], value: string) {
    saveParams((current) => updateModelParameter(current, name, value));
  }

  const evaluation = useExplicitEvaluation(
    client,
    (submitted, runId) =>
      saveParams((current) => bindEvaluation(current, submitted, runId)),
    session,
  );
  const selection = selectSavedOutput(params, evaluator);
  const reading = useSavedOutput(
    client,
    selection,
    refresh + (widget.refreshQuery ?? 0),
    session,
  );
  const error = evaluation.error ?? reading?.error;
  const changed = evaluator && selection && params.evaluated !== selection.run_id;
  const stale = Boolean(changed || error || evaluation.pending);
  const canEvaluate = evaluator && !readOnly && Boolean(session);

  return (
    <DraggableCard lastUpdated={0}>
      <div className="flex h-full flex-col gap-2 overflow-auto p-2.5 text-xs">
        {evaluator ? (
          <FcfControls
            parameterValue={(name) => parameter(params, name)}
            edit={edit}
            readOnly={readOnly}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              aria-label="Run ID"
              placeholder="Saved run ID"
              size="sm"
              value={parameter(params, "run_id")}
              onChange={(value) => edit("run_id", value)}
              readOnly={readOnly}
            />
            <Input
              aria-label="Output ID"
              placeholder="Output ID"
              size="sm"
              value={parameter(params, "output_id")}
              onChange={(value) => edit("output_id", value)}
              readOnly={readOnly}
            />
            <Input
              aria-label="Expected run ID"
              placeholder="Expected run ID (optional)"
              size="sm"
              value={parameter(params, "expected_run_id")}
              onChange={(value) => edit("expected_run_id", value)}
              readOnly={readOnly}
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {canEvaluate && (
            <Button
              size="sm"
              disabled={evaluation.pending}
              onClick={() => {
                saveParams((current) => ({ ...current, evaluated: "" }));
                void evaluation.evaluate({
                  snapshot: parameter(params, "snapshot"),
                  assumption_version: parameter(params, "assumption_version"),
                  effective_date: parameter(params, "effective_date"),
                  capex_sign: parameter(params, "capex_sign"),
                });
              }}
            >
              Evaluate FCF yield
            </Button>
          )}
          {selection && (
            <Button
              variant="secondary"
              size="sm"
              disabled={reading?.pending || !session}
              onClick={() => setRefresh((value) => value + 1)}
            >
              Refresh saved result
            </Button>
          )}
        </div>
        {evaluation.pending && <p role="status">Evaluating FCF yield…</p>}
        {reading?.pending && <p role="status">Loading saved result…</p>}
        {error && <p role="alert">{error}</p>}
        {stale && reading?.result && <p role="status">Showing a stale saved result.</p>}
        {!!selection && !reading?.result && (
          <p>
            Saved run ID <code>{selection.run_id}</code>
          </p>
        )}
        {!evaluator && !selection && (
          <p>Enter a saved run ID and an output ID to load the saved result.</p>
        )}
        {reading?.result && <ModelingResult {...reading.result} stale={stale} />}
      </div>
    </DraggableCard>
  );
}

function FcfControls({
  parameterValue,
  edit,
  readOnly,
}: {
  parameterValue: (name: keyof FcfParameters) => string;
  edit: (name: keyof FcfParameters, value: string) => void;
  readOnly: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Input
          aria-label="Assumption version"
          placeholder="Assumption version"
          size="sm"
          value={parameterValue("assumption_version")}
          onChange={(value) => edit("assumption_version", value)}
          readOnly={readOnly}
        />
        <Input
          aria-label="Effective date"
          type="date"
          size="sm"
          value={parameterValue("effective_date")}
          onChange={(value) => edit("effective_date", value)}
          readOnly={readOnly}
        />
        <Select
          label="CapEx sign convention"
          placeholder="CapEx sign convention"
          size="sm"
          value={parameterValue("capex_sign")}
          onChange={(value) => edit("capex_sign", value)}
          disabled={readOnly}
          options={[
            { value: "cash_outflow_negative", label: "Cash outflow is negative" },
            { value: "spending_positive", label: "Spending is positive" },
          ]}
        />
      </div>
      <Textarea
        label="Input snapshot JSON"
        aria-label="Input snapshot JSON"
        autoheight={false}
        value={parameterValue("snapshot")}
        onChange={(value) => edit("snapshot", value)}
        readOnly={readOnly}
      />
    </>
  );
}
