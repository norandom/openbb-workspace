import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createEvaluationClient } from "./evaluationClient";
import type { StoryRun } from "./storyContract";
import { createStoryController } from "./storyController";
import { createStoryState } from "./storyState";

const fixturePath = process.env.QOPENBB_STORY_WIRE_FIXTURE;
const { runs } = fixturePath
  ? (JSON.parse(readFileSync(fixturePath, "utf8")) as {
      runs: Record<string, StoryRun>;
    })
  : { runs: {} };
const initial = createStoryState();
const selection = { ...initial.selection, observation_date: "2024-04-03" };
const inputs = {
  schedule: {
    calendar_id: "NYSE_ARCA" as const,
    schedule_revision: "synthetic-nyse-arca.2024r1",
  },
  evaluatedAt: "2024-05-03T16:00:00Z",
};
const json = (body: unknown, status = 200) => Response.json(body, { status });

function setup(respond: typeof fetch) {
  const fetcher = vi.fn(respond);
  const client = createEvaluationClient(() => "test-session", fetcher);
  const controller = createStoryController(client, initial, 0);
  return { fetcher, controller };
}

describe("research story controller", () => {
  it("leaves an unbound catalog configuration idle on reopen", async () => {
    const { controller, fetcher } = setup(async () => json({}, 503));
    await controller.reopen();
    expect(fetcher).not.toHaveBeenCalled();
    expect(controller.getSnapshot().steps.comparison.status).toBe("idle");
    expect(controller.getSnapshot().steps.regime.status).toBe("idle");
  });

  it.each(["transport", "body", "truncated JSON"])(
    "sends each request once after losing the %s and exposes manual retry",
    async (loss) => {
      const { controller, fetcher } = setup(async () => {
        if (loss === "transport") throw new Error("private");
        const response = new Response('{"run_id":');
        if (loss === "body")
          response.text = async () => {
            throw new Error("private");
          };
        return response;
      });
      await controller.select(selection, inputs);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(controller.getSnapshot().steps.comparison).toMatchObject({
        status: "error",
        canRetry: true,
        message: "The evaluation outcome is unknown.",
        run: null,
      });
      expect(controller.getSnapshot().steps.regime.status).toBe("error");
    },
  );

  it("coalesces edits before any request and offers retry when capacity is occupied", async () => {
    const fetcher = vi.fn(async () =>
      json({ code: "capacity", retryable: true }, 503),
    );
    const controller = createStoryController(
      createEvaluationClient(() => "session", fetcher),
      initial,
    );
    const first = controller.select(selection, inputs);
    const last = controller.select(
      { ...selection, technology_symbol: "VGT" },
      inputs,
    );
    await Promise.all([first, last]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/modeling/v1/evaluations",
      expect.objectContaining({ body: expect.stringContaining("VGT") }),
    );
    expect(controller.getSnapshot().steps.comparison).toMatchObject({
      status: "error",
      message: "Modeling capacity is occupied.",
      canRetry: true,
    });
  });

  it("builds the exact acquisition shape and uses local end-of-day across DST", async () => {
    const { controller, fetcher } = setup(async () => json({}, 503));
    await controller.select(
      { ...selection, observation_date: "2024-11-03" },
      inputsWithNovember(),
    );
    const [[url, comparison], [, regime]] = fetcher.mock.calls;
    const pair = JSON.parse(String(comparison?.body));
    const macro = JSON.parse(String(regime?.body));
    expect(url).toBe("/modeling/v1/evaluations");
    expect(comparison?.headers).toMatchObject({
      Authorization: "Bearer test-session",
    });
    expect(pair).toMatchObject({
      model_id: "proxy_comparison",
      method_version: "2",
      acquisition: {
        dataset_id: "story.etf_pair",
        parameters: [
          ["left_proxy", "DBC"],
          ["right_proxy", "XLK"],
          ["calendar_id", "NYSE_ARCA"],
          ["schedule_revision", "synthetic-nyse-arca.2024r1"],
        ],
        cutoff: {
          observation_date: "2024-11-03",
          decision_at: "2024-11-04T04:59:59.999999Z",
        },
      },
    });
    expect(macro.acquisition.cutoff).toEqual(pair.acquisition.cutoff);
    expect(macro.acquisition.parameters).toEqual(
      pair.acquisition.parameters.slice(2),
    );
  });
});

function inputsWithNovember() {
  return { ...inputs, evaluatedAt: "2024-11-06T00:00:00Z" };
}

describe.runIf(Boolean(fixturePath))(
  "research story installed run lifecycle",
  () => {
    it.each(["obsolete response", "obsolete error"])(
      "serializes A → B → A with %s",
      async (variant) => {
        let finish!: (response: Response) => void;
        let started!: () => void;
        const firstStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const responses = [
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
          json(runs.comparison),
          json(runs.regime),
        ];
        const { controller, fetcher } = setup(async () => {
          started();
          return responses.shift()!;
        });
        const first = controller.select(selection, inputs);
        await firstStarted;
        const middle = controller.select(
          { ...selection, commodity_symbol: "GLD" },
          inputs,
        );
        const last = controller.select(selection, inputs);
        expect(controller.getSnapshot().steps.comparison.status).toBe(
          "pending",
        );
        expect(controller.getSnapshot().saved.run_refs.comparison).toBeNull();
        expect(fetcher).toHaveBeenCalledTimes(1);
        const observedIds: (string | null)[] = [];
        const observedStatuses: string[] = [];
        const unsubscribe = controller.subscribe(() => {
          const snapshot = controller.getSnapshot();
          observedIds.push(snapshot.saved.run_refs.comparison);
          observedStatuses.push(snapshot.steps.comparison.status);
        });
        finish(
          variant === "obsolete error" ? json({}, 503) : json(runs.partial_leg),
        );
        await Promise.all([first, middle, last]);
        unsubscribe();
        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(observedIds).not.toContain(runs.partial_leg.run_id);
        expect(observedStatuses).not.toContain("error");
        expect(controller.getSnapshot().saved.run_refs).toEqual({
          comparison: runs.comparison.run_id,
          regime: runs.regime.run_id,
        });
      },
    );

    it("recovers through a single authorized full-run read and reopens with reads only", async () => {
      const recovered = runs.recovery;
      const { controller, fetcher } = setup(async (url, init) => {
        if (url === "/modeling/v1/runs/" + recovered.run_id)
          return json(recovered);
        if (url === "/modeling/v1/runs/" + runs.regime.run_id)
          return json(runs.regime);
        return JSON.parse(String(init?.body)).model_id === "proxy_comparison"
          ? json(
              {
                code: "publication_unconfirmed",
                retryable: false,
                run_id: recovered.run_id,
              },
              503,
            )
          : json(runs.regime);
      });
      await controller.select(selection, inputs);
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
        "POST",
      ]);
      expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({
        Authorization: "Bearer test-session",
      });
      const saved = controller.getSnapshot().saved;
      const reopened = createStoryController(
        createEvaluationClient(() => "test-session", fetcher),
        saved,
        0,
      );
      fetcher.mockClear();
      await reopened.reopen();
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        "GET",
        "GET",
      ]);
      expect(reopened.getSnapshot().steps.comparison.run?.run.run_id).toBe(
        recovered.run_id,
      );
    });

    it("preserves the displayed partial run and macro during a frozen comparison retry", async () => {
      let finish!: (response: Response) => void;
      let started!: () => void;
      const retryStarted = new Promise<void>((resolve) => {
        started = resolve;
      });
      const responses = [
        json(runs.failed_leg),
        json(runs.regime),
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
      ];
      const { controller, fetcher } = setup(async () => {
        if (responses.length === 1) started();
        return responses.shift()!;
      });
      await controller.select(selection, inputs);
      expect(controller.getSnapshot().steps.comparison.canRetry).toBe(true);
      const retry = controller.retry("comparison");
      await retryStarted;
      expect(controller.getSnapshot().steps.comparison).toMatchObject({
        status: "pending",
        run: { run: { run_id: runs.failed_leg.run_id } },
      });
      expect(controller.getSnapshot().saved.run_refs.regime).toBe(
        runs.regime.run_id,
      );
      expect(fetcher.mock.calls[2][1]?.body).toBe(
        fetcher.mock.calls[0][1]?.body,
      );
      finish(json(runs.comparison));
      await retry;
      expect(controller.getSnapshot().saved.run_refs).toEqual({
        comparison: runs.comparison.run_id,
        regime: runs.regime.run_id,
      });
    });

    it("retries the authorized recovery read before considering a new write", async () => {
      const responses = [
        json(
          {
            code: "publication_unconfirmed",
            retryable: false,
            run_id: runs.recovery.run_id,
          },
          503,
        ),
        json({ code: "storage_unavailable", retryable: true }, 503),
        json(runs.regime),
        json(runs.recovery),
      ];
      const { controller, fetcher } = setup(async () => responses.shift()!);
      await controller.select(selection, inputs);
      await controller.retry("comparison");
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        "POST",
        "GET",
        "POST",
        "GET",
      ]);
      expect(controller.getSnapshot().steps.comparison.run?.run.run_id).toBe(
        runs.recovery.run_id,
      );
    });

    it.each([true, false])(
      "permits an explicit retry for a missing comparison with macro saved=%s",
      async (macroSaved) => {
        const { fetcher } = setup(async (_url, request) =>
          json(request?.method === "POST" ? runs.comparison : runs.regime),
        );
        const saved = {
          ...initial,
          selection,
          schedule: inputs.schedule,
          cutoff: runs.comparison.inputs.cutoff,
          run_refs: {
            comparison: null,
            regime: macroSaved ? runs.regime.run_id : null,
          },
        };
        const reopened = createStoryController(
          createEvaluationClient(() => "test-session", fetcher),
          saved,
          0,
        );
        await reopened.reopen();
        const { steps } = reopened.getSnapshot();
        expect(steps.comparison).toEqual({
          status: "error",
          run: null,
          canRetry: true,
          message: "No saved run is available for this step.",
        });
        expect(steps.regime.canRetry).toBe(!macroSaved);
        expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(
          macroSaved ? ["GET"] : [],
        );
        await reopened.retry("comparison");
        expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(
          macroSaved ? ["GET", "POST"] : ["POST"],
        );
        const submitted = JSON.parse(
          String(fetcher.mock.calls.at(-1)?.[1]?.body),
        );
        expect(submitted.acquisition.cutoff).toEqual(saved.cutoff);
        expect(submitted.acquisition.parameters).toContainEqual([
          "schedule_revision",
          saved.schedule.schedule_revision,
        ]);
        expect(reopened.getSnapshot().saved.run_refs).toEqual({
          comparison: runs.comparison.run_id,
          regime: saved.run_refs.regime,
        });
        expect(reopened.getSnapshot().steps.regime).toBe(steps.regime);
      },
    );

    it("retains the valid comparison on reopen when the macro cutoff fails binding", async () => {
      const { controller, fetcher } = setup(async (url) =>
        url === "/modeling/v1/runs/" + runs.comparison.run_id
          ? json(runs.comparison)
          : json(runs.mismatched_cutoff),
      );
      const saved = {
        ...initial,
        selection,
        schedule: inputs.schedule,
        cutoff: runs.comparison.inputs.cutoff,
        run_refs: {
          comparison: runs.comparison.run_id,
          regime: runs.mismatched_cutoff.run_id,
        },
      };
      const reopened = createStoryController(
        createEvaluationClient(() => "test-session", fetcher),
        saved,
        0,
      );
      await reopened.reopen();
      expect(reopened.getSnapshot().steps.regime).toMatchObject({
        status: "error",
        run: null,
      });
      expect(reopened.getSnapshot().steps.comparison.run?.run.run_id).toBe(
        runs.comparison.run_id,
      );
      expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
        "GET",
        "GET",
      ]);
      expect(controller.getSnapshot().steps.comparison.status).toBe("idle");
    });
  },
);
