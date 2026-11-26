import type { EvaluationClient } from "./evaluationClient";
import {
  decodeStoryRun,
  storySides,
  type BoundStoryRun,
  type StoryBinding,
  type StoryRole,
} from "./storyContract";
import { StoryRequestError } from "./storyControllerError";
import {
  prepareStorySelection,
  type StorySelectionInputs,
} from "./storyControllerRequest";
import {
  encodeStoryState,
  type StoryCharts,
  type StorySelection,
  type StoryState,
} from "./storyState";

const roles = ["comparison", "regime"] as const;

export type StoryStep = {
  status: "idle" | "pending" | "ready" | "error";
  run: BoundStoryRun | null;
  canRetry: boolean;
  message: string | null;
};

export type StoryControllerSnapshot = {
  saved: StoryState;
  steps: Record<StoryRole, StoryStep>;
};

type StoryClient = Pick<EvaluationClient, "evaluateStory" | "readStoryRun">;

function emptyStep(status: StoryStep["status"]): StoryStep {
  return { status, run: null, canRetry: false, message: null };
}

function reopenedStep(runId: string | null): StoryStep {
  if (runId) return emptyStep("pending");
  return {
    ...emptyStep("error"),
    canRetry: true,
    message: "No saved run is available for this step.",
  };
}

function bindingFrom({ selection, schedule, cutoff }: StoryState) {
  return schedule && cutoff ? { selection, schedule, cutoff } : null;
}

function canRefreshPartial(run: BoundStoryRun) {
  return storySides.some((side) => {
    const failure = run.legReceipts?.[side].failure;
    return failure !== undefined && failure !== "missing_data";
  });
}

function coalesce(ms: number, signal: AbortSignal) {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function createStoryController(
  client: StoryClient,
  initial: StoryState,
  coalesceMs = 80,
) {
  let snapshot: StoryControllerSnapshot = {
    saved: encodeStoryState(initial),
    steps: { comparison: emptyStep("idle"), regime: emptyStep("idle") },
  };
  const listeners = new Set<() => void>();
  const pendingReads: Partial<Record<StoryRole, string>> = {};
  let generation = 0;
  let obsolete = new AbortController();
  let queue = Promise.resolve();
  let disposed = false;

  function publish(saved: StoryState, steps = snapshot.steps) {
    snapshot = { saved, steps };
    for (const listener of listeners) listener();
  }

  function reset(saved: StoryState, evaluating: boolean) {
    generation += 1;
    obsolete.abort();
    obsolete = new AbortController();
    delete pendingReads.comparison;
    delete pendingReads.regime;
    publish(saved, {
      comparison: evaluating
        ? emptyStep("pending")
        : reopenedStep(saved.run_refs.comparison),
      regime: evaluating
        ? emptyStep("pending")
        : reopenedStep(saved.run_refs.regime),
    });
  }

  function context(binding: StoryBinding) {
    const currentGeneration = generation;
    return {
      binding,
      signal: obsolete.signal,
      current: () =>
        !disposed &&
        generation === currentGeneration &&
        snapshot.saved.selection === binding.selection,
    };
  }

  type Context = ReturnType<typeof context>;

  function update(role: StoryRole, step: StoryStep, runId?: string) {
    const saved = snapshot.saved;
    const next = runId
      ? { ...saved, run_refs: { ...saved.run_refs, [role]: runId } }
      : saved;
    publish(next, { ...snapshot.steps, [role]: step });
  }

  function report(role: StoryRole, error: unknown) {
    const known = error instanceof StoryRequestError;
    update(role, {
      status: "error",
      run: snapshot.steps[role].run,
      canRetry: known ? error.canRetry : true,
      message: known ? error.message : "The modeling request failed.",
    });
  }

  function bind(role: StoryRole, payload: unknown, work: Context, id?: string) {
    const run = decodeStoryRun(payload, role, work.binding, id);
    if (!run)
      throw new StoryRequestError(
        "The saved run could not be matched to this selection.",
        true,
        undefined,
        true,
      );
    delete pendingReads[role];
    update(
      role,
      { status: "ready", run, canRetry: canRefreshPartial(run), message: null },
      run.run.run_id,
    );
  }

  async function read(role: StoryRole, id: string, work: Context) {
    if (!work.current()) return;
    pendingReads[role] = id;
    try {
      const payload = await client.readStoryRun(id, work.signal);
      if (work.current()) bind(role, payload, work, id);
    } catch (error) {
      if (!work.current()) return;
      if (error instanceof StoryRequestError && error.unavailable)
        delete pendingReads[role];
      report(role, error);
    }
  }

  async function evaluate(role: StoryRole, work: Context) {
    if (!work.current()) return;
    try {
      // Keep an in-flight POST joined to the queue. Aborting its fetch would
      // release the client queue before the service releases the evaluation slot.
      const payload = await client.evaluateStory(
        role,
        work.binding,
        new AbortController().signal,
      );
      if (work.current()) bind(role, payload, work);
    } catch (error) {
      if (!work.current()) return;
      if (error instanceof StoryRequestError && error.recoveryId) {
        await read(role, error.recoveryId, work);
        return;
      }
      report(role, error);
    }
  }

  function enqueue(action: () => Promise<void>) {
    const result = queue.then(action);
    queue = result.catch(() => undefined);
    return result;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async select(selection: StorySelection, inputs: StorySelectionInputs) {
      if (disposed) return;
      const saved = prepareStorySelection(snapshot.saved, selection, inputs);
      reset(saved, true);
      const binding = bindingFrom(saved)!;
      const work = context(binding);
      await coalesce(coalesceMs, work.signal);
      await enqueue(async () => {
        for (const role of roles) await evaluate(role, work);
      });
    },
    async reopen() {
      if (disposed) return;
      const saved = snapshot.saved;
      const binding = bindingFrom(saved);
      if (!binding) return;
      reset(saved, false);
      const work = context(binding);
      await enqueue(async () => {
        for (const role of roles) {
          const id = saved.run_refs[role];
          if (id) await read(role, id, work);
        }
      });
    },
    async retry(role: StoryRole) {
      const step = snapshot.steps[role];
      const binding = bindingFrom(snapshot.saved);
      if (disposed || !binding || !step.canRetry) return;
      const work = context(binding);
      const readId = pendingReads[role];
      update(role, {
        ...step,
        status: "pending",
        canRetry: false,
        message: null,
      });
      await enqueue(() =>
        readId ? read(role, readId, work) : evaluate(role, work),
      );
    },
    setCharts(charts: StoryCharts) {
      if (disposed) return;
      const validated = encodeStoryState({ ...snapshot.saved, charts });
      publish({ ...snapshot.saved, charts: validated.charts });
    },
    dispose() {
      disposed = true;
      obsolete.abort();
      listeners.clear();
    },
  };
}
