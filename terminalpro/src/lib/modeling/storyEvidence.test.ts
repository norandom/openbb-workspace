import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeStoryRun,
  type StoryBinding,
  type StoryRole,
  type StoryRun,
} from "./storyContract";
import { projectStoryEvidence, storyVerdict } from "./storyEvidence";

it("needs independently verified evidence to issue a conclusion", () => {
  expect(storyVerdict()).toMatchObject({ verdict: "insufficient_data" });
});

const fixturePath = process.env.QOPENBB_STORY_WIRE_FIXTURE;
const fixtureBinding: StoryBinding = {
  selection: {
    commodity_symbol: "DBC",
    technology_symbol: "XLK",
    observation_date: "2024-04-03",
  },
  schedule: {
    calendar_id: "NYSE_ARCA",
    schedule_revision: "synthetic-nyse-arca.2024r1",
  },
  cutoff: {
    observation_date: "2024-04-03",
    decision_at: "2024-04-04T03:59:59.999999Z",
    evaluated_at: "2024-05-03T16:00:00Z",
    session_timezone: "America/New_York",
  },
};

// The root contract suite produces full owner-authorized runs from the installed service.
describe.runIf(Boolean(fixturePath))("installed service story evidence", () => {
  const { runs } = fixturePath
    ? (JSON.parse(readFileSync(fixturePath, "utf8")) as {
        runs: Record<string, StoryRun>;
      })
    : { runs: {} };
  function project(run: StoryRun, role: StoryRole = "comparison") {
    const bound = decodeStoryRun(run, role, fixtureBinding, run.run_id);
    expect(bound).toBeDefined();
    return projectStoryEvidence(bound!);
  }

  it("joins exact prices, returns, checks, reference evidence and the separate provider receipt", () => {
    const evidence = project(runs.comparison);
    const { left_momentum, left_volatility, momentum_spread } = evidence.outputs;
    expect(evidence.window).toMatchObject({
      observationCount: 64,
      start: "2024-01-02",
      end: "2024-04-03",
    });
    expect(evidence.priceSource?.legs.map(({ label }) => label)).toEqual([
      "DBC history retrieved 2024-05-04",
      "XLK history retrieved 2024-05-05",
    ]);
    expect(left_momentum.value).toBe("20");
    expect(
      left_momentum.rows.filter(({ table_id }) => table_id === "left_closes"),
    ).toHaveLength(64);
    expect(left_volatility.dailyReturns).toHaveLength(63);
    expect(momentum_spread.checks).toMatchObject([
      { rule_id: "eligible_inputs.momentum_spread", status: "pass" },
    ]);
    expect(momentum_spread.reference).toMatchObject({
      output_id: "momentum_spread",
      status: "match",
    });
    expect(storyVerdict(evidence)).toMatchObject({
      verdict: "supported",
      spread: "10",
      higherRiskWinner: true,
    });
  });

  it("rejects wrong identity, version, ordered role assumptions, cutoff and mismatched receipts", () => {
    expect(
      decodeStoryRun(runs.mismatched_pair, "comparison", fixtureBinding),
    ).toBeUndefined();
    expect(
      decodeStoryRun(runs.mismatched_cutoff, "regime", fixtureBinding),
    ).toBeUndefined();
    expect(
      decodeStoryRun(
        runs.comparison,
        "comparison",
        fixtureBinding,
        runs.recovery.run_id,
      ),
    ).toBeUndefined();
    const invalid = structuredClone(runs.comparison);
    invalid.descriptor.method_version = "1";
    expect(decodeStoryRun(invalid, "comparison", fixtureBinding)).toBeUndefined();
    invalid.descriptor.method_version = "2";
    invalid.inputs.provenance.retrieved_at = invalid.inputs.cutoff.evaluated_at;
    expect(decodeStoryRun(invalid, "comparison", fixtureBinding)).toBeUndefined();
  });

  it("preserves the verified leg through gaps and retryable receipt faults", () => {
    for (const name of ["partial_leg", "failed_leg"]) {
      const evidence = project(runs[name]);
      expect(evidence.outputs.left_momentum.value).toBe("20");
      expect(evidence.outputs.right_momentum).toMatchObject({
        value: null,
        status: "withheld",
      });
      expect(storyVerdict(evidence)).toMatchObject({
        verdict: "insufficient_data",
        reason: expect.stringContaining("XLK"),
      });
    }
    expect(project(runs.failed_leg).priceSource?.legs[1]).toMatchObject({
      failure: "entitlement",
      label: null,
    });
  });

  it("keeps independent macro results and preserves the eligible endpoint when the other fails", () => {
    const { outputs, availableMacroRows } = project(runs.regime, "regime");
    expect(outputs.regime.value).toBe("rising");
    expect(outputs.change.value).toBe("0.25");
    expect(
      availableMacroRows.map(({ observation_date, value }) => [
        observation_date,
        value,
      ]),
    ).toEqual([
      ["2024-01-02", "1.5"],
      ["2024-04-03", "1.75"],
    ]);
    const gap = project(runs.unavailable_macro, "regime");
    expect(gap.outputs.regime).toMatchObject({
      value: null,
      reason: expect.stringContaining("2024-04-03"),
    });
    expect(gap.availableMacroRows).toHaveLength(1);
  });

  it("keeps the spread-based verdict when risk is unavailable and distinguishes ties from tiny negatives", () => {
    const brokenRisk = structuredClone(runs.comparison);
    brokenRisk.verification.find(
      ({ output_id }) => output_id === "left_volatility",
    )!.status = "unavailable";
    expect(project(brokenRisk).outputs.left_volatility.status).toBe("unverified");
    expect(storyVerdict(project(brokenRisk))).toMatchObject({
      verdict: "supported",
      higherRiskWinner: false,
    });
    expect(storyVerdict(project(runs.tie))).toMatchObject({ verdict: "tie" });
    expect(storyVerdict(project(runs.tiny_negative))).toMatchObject({
      verdict: "technology_outperformance",
    });
  });

  it("rejects duplicate check records that mask a missing spread check", () => {
    const run = structuredClone(runs.comparison);
    const spread = run.outputs.find(
      ({ output_id }) => output_id === "momentum_spread",
    )!;
    spread.check_ids.push("additional_spread_check");
    const check = run.checks.find(
      ({ rule_id }) => rule_id === "eligible_inputs.momentum_spread",
    )!;
    run.checks.push(structuredClone(check));

    const evidence = project(run);
    expect(evidence.outputs.momentum_spread.status).toBe("unverified");
    expect(storyVerdict(evidence).verdict).toBe("insufficient_data");
    expect(evidence.outputs.left_momentum).toMatchObject({
      status: "verified",
      value: "20",
    });
    expect(evidence.outputs.right_momentum).toMatchObject({
      status: "verified",
      value: "10",
    });
  });

  it("withholds malformed decimal, wrong check, reference or source record on the selected output", () => {
    const numericValue = structuredClone(runs.comparison);
    Object.assign(
      numericValue.outputs.find(({ output_id }) => output_id === "momentum_spread")!,
      { value: 1e-100 },
    );
    const numericEvidence = project(numericValue);
    expect(storyVerdict(numericEvidence).verdict).toBe("insufficient_data");
    expect(numericEvidence.outputs.left_momentum.value).toBe("20");

    const mutate = [
      (run: StoryRun) => {
        run.outputs.find(({ output_id }) => output_id === "momentum_spread")!.value =
          "NaN";
      },
      (run: StoryRun) => {
        run.checks.find(
          ({ rule_id }) => rule_id === "eligible_inputs.momentum_spread",
        )!.output_ids = ["right_momentum"];
      },
      (run: StoryRun) => {
        run.verification.find(
          ({ output_id }) => output_id === "momentum_spread",
        )!.status = "mismatch";
      },
      (run: StoryRun) => {
        run.trace.find(
          ({ output_id }) => output_id === "momentum_spread",
        )!.source_record_ids[0] = run.inputs.tables[0].rows[0].source_record_id!;
      },
    ];
    for (const edit of mutate) {
      const run = structuredClone(runs.comparison);
      edit(run);
      const evidence = project(run);
      expect(storyVerdict(evidence).verdict).toBe("insufficient_data");
      expect(evidence.outputs.left_momentum.value).toBe("20");
    }
  });
});
