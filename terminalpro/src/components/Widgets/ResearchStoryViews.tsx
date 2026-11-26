import { type ReactNode, useId, useMemo } from "react";
import { Button } from "~/components/ds/atoms/Button";
import type {
  StoryControllerSnapshot,
  StoryStep,
} from "~/lib/modeling/storyController";
import { projectStoryEvidence } from "~/lib/modeling/storyEvidence";
import {
  decodeStoryState,
  type StoryChartLane,
  type StoryCharts,
  type StoryChartView,
  type StoryRole,
} from "~/lib/modeling/storyState";
import {
  fredNotice,
  MacroFindings,
  ProxyFindings,
  VerdictFinding,
} from "./ResearchStoryFindings";

export type ResearchStoryViewsProps = {
  snapshot: StoryControllerSnapshot;
  setCharts: (charts: StoryCharts) => void;
  retry: (role: StoryRole) => Promise<void>;
  readOnly: boolean;
};

function FindingSection({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-2 rounded border border-ds-border p-3"
    >
      <h3 className="body-sm-semibold text-ds-text-heading" id={id}>
        {label}
      </h3>
      {children}
    </section>
  );
}

function StepStatus({
  step,
  label,
  retry,
  retryLabel,
}: {
  step: StoryStep;
  label: string;
  retry?: () => Promise<void>;
  retryLabel?: string;
}) {
  return (
    <>
      {step.status === "pending" && <p role="status">{label} pending…</p>}
      {step.message && <p role="alert">{step.message}</p>}
      {step.canRetry && retry && (
        <Button size="sm" variant="secondary" onClick={() => void retry()}>
          {retryLabel}
        </Button>
      )}
    </>
  );
}

export function ResearchStoryViews({
  snapshot,
  retry,
  readOnly,
  setCharts,
}: ResearchStoryViewsProps) {
  const { comparison, regime } = snapshot.steps;
  const price = useMemo(
    () => (comparison.run ? projectStoryEvidence(comparison.run) : undefined),
    [comparison.run],
  );
  const macro = useMemo(
    () => (regime.run ? projectStoryEvidence(regime.run) : undefined),
    [regime.run],
  );
  const { charts, selection } = snapshot.saved;
  function setChart(
    view: StoryChartView,
    lane: StoryChartLane,
    change: { chart_type?: "line" | "bar"; series?: string[] },
  ) {
    if (readOnly) return;
    const updated = {
      ...charts,
      [view]: { ...charts[view], [lane]: { ...charts[view][lane], ...change } },
    };
    const state = decodeStoryState({ ...snapshot.saved, charts: updated });
    if (state) setCharts(state.charts);
  }
  const owner = { charts, readOnly, setChart };
  return (
    <>
      <FindingSection label="Price returns from FMP">
        <StepStatus
          step={comparison}
          label="Price returns"
          retryLabel="Retry proxy comparison"
          retry={readOnly ? undefined : () => retry("comparison")}
        />
        {price && <ProxyFindings evidence={price} view="returns" {...owner} />}
      </FindingSection>
      <FindingSection label="Realized volatility from FMP">
        <StepStatus step={comparison} label="Realized volatility" />
        {price && <ProxyFindings evidence={price} view="risk" {...owner} />}
      </FindingSection>
      <FindingSection label="DFII10 real yields from the Board of Governors of the Federal Reserve System via FRED">
        <StepStatus
          step={regime}
          label="Real yields"
          retryLabel="Retry real yields"
          retry={readOnly ? undefined : () => retry("regime")}
        />
        {macro && <MacroFindings evidence={macro} {...owner} />}
        <p>{fredNotice}</p>
      </FindingSection>
      <FindingSection label="Verdict">
        <VerdictFinding
          evidence={price}
          pending={comparison.status === "pending"}
          selection={selection}
          error={comparison.message}
        />
      </FindingSection>
    </>
  );
}
