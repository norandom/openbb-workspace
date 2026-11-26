import { Button } from "~/components/ds/atoms/Button";
import type { StoryControllerSnapshot } from "~/lib/modeling/storyController";
import type { StoryCharts, StoryRole } from "~/lib/modeling/storyState";

const views = [
  { label: "Price returns", role: "comparison" },
  { label: "Realized volatility", role: "comparison" },
  { label: "Real yields", role: "regime" },
] as const;

export type ResearchStoryViewsProps = {
  snapshot: StoryControllerSnapshot;
  setCharts: (charts: StoryCharts) => void;
  retry: (role: StoryRole) => Promise<void>;
  readOnly: boolean;
};

export function ResearchStoryViews({ snapshot, retry, readOnly }: ResearchStoryViewsProps) {
  return (
    <>
      {views.map(({ label, role }, index) => {
        const step = snapshot.steps[role];
        const offerRetry = index !== 1 && step.canRetry && !readOnly;
        return (
          <section key={label}>
            <h3 className="body-sm-semibold">{label}</h3>
            {step.status === "pending" && <p role="status">{label} pending…</p>}
            {step.message && <p role="alert">{step.message}</p>}
            {offerRetry && (
              <Button size="sm" variant="secondary" onClick={() => void retry(role)}>
                Retry {role === "comparison" ? "proxy comparison" : "real yields"}
              </Button>
            )}
          </section>
        );
      })}
    </>
  );
}
