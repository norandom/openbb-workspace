import { describe, expect, it, vi } from "vitest";
import fixtures from "../../fixtures/modeling/saved-projections.json";
import snapshot from "../../fixtures/modeling/fcf-input.json";
import { projection, savedRun } from "~/lib/modeling/contract";
import {
  createEvaluationClient,
  decodeModelingJson,
  encodeFcfRequest,
  fcfRequest,
} from "~/lib/modeling/evaluationClient";
import {
  bindEvaluation,
  selectSavedOutput,
  updateModelParameter,
} from "~/lib/modeling/runBindings";

const owner = "12345678-1234-4abc-8def-123456789abc";
const params = {
  snapshot: JSON.stringify(snapshot),
  assumption_version: "analyst-1",
  effective_date: snapshot.cutoff.observation_date,
  capex_sign: "cash_outflow_negative",
};

describe("modeling v1 consumer boundary", () => {
  it.each(Object.entries(fixtures))("decodes captured projection %s", (_name, body) => {
    const result = projection.parse(body);
    expect(result.results[0].display_text).toEqual(body.results[0].display_text);
    expect(result.results[0].status).toEqual(body.results[0].status);
    expect(result.results[0].freshness).toEqual(body.results[0].freshness);
  });

  it("accepts nullable check explanations and the pinned Unicode identifier scope", () => {
    const body = structuredClone(fixtures.zero);
    const unicode = "  收益率 Å";
    body.results[0].output_id = unicode;
    body.checks = [
      {
        rule_id: "a",
        rule_version: "1",
        severity: "advisory",
        status: "passed",
        explanation: null,
      },
    ] as typeof body.checks;
    expect(projection.parse(body).checks[0].explanation).toBeNull();
    expect(
      selectSavedOutput({ run_id: body.run_id, output_id: unicode }, false)?.output_id,
    ).toBe(unicode);
  });

  it.each([
    { unit: null },
    { run_detail_href: undefined },
    { value: true },
    { value: "NaN" },
  ])("rejects incompatible result fields %j", (fields) => {
    const body = structuredClone(fixtures.zero);
    Object.assign(body.results[0], fields);
    expect(projection.safeParse(body).success).toBe(false);
  });

  it("requires a run detail reference at both levels", () => {
    expect(
      projection.safeParse({ ...fixtures.zero, run_detail_href: undefined }).success,
    ).toBe(false);
  });

  it("sends authored FCF assumptions over the same-origin authenticated POST", async () => {
    const run = {
      schema_version: "1",
      run_id: fixtures.zero.run_id,
      created_at: "2024-04-03T12:00:00Z",
      descriptor: { model_id: "issuer_fcf_yield", method_version: "1" },
      assumptions: fcfRequest(params, owner).assumptions,
    };
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(run));
    const client = createEvaluationClient(() => "session-token", transport);
    const signal = new AbortController().signal;
    await expect(client.evaluate(params, owner, signal)).resolves.toMatchObject({
      run_id: run.run_id,
    });
    expect(transport).toHaveBeenCalledOnce();
    const [path, options] = transport.mock.calls[0];
    expect(path).toBe("/modeling/v1/evaluations");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      signal,
      headers: {
        Authorization: "Bearer session-token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(options.body))).toEqual({
      model_id: "issuer_fcf_yield",
      method_version: "1",
      inputs: snapshot,
      assumptions: {
        version: params.assumption_version,
        effective_date: params.effective_date,
        assumptions: [
          {
            assumption_id: "capex_sign",
            value_type: "text",
            value: "cash_outflow_negative",
            author: owner,
            origin: "user_supplied",
            rationale: expect.any(String),
          },
        ],
      },
    });
    await expect(client.evaluate(params, "missing-author", signal)).rejects.toThrow(
      "Sign in",
    );
    expect(transport).toHaveBeenCalledOnce();
  });

  it.each([
    "-9223372036854775808",
    "9223372036854775807",
  ])("preserves signed int64 edge %s across the JSON boundary", (edge) => {
    const body = structuredClone(fixtures.zero);
    Object.assign(body.results[0], {
      value_type: "integer",
      value: "EDGE",
      display_text: edge,
    });
    const wire = JSON.stringify(body).replace('"EDGE"', edge);
    expect(projection.parse(decodeModelingJson(wire)).results[0]).toMatchObject({
      value: BigInt(edge),
      display_text: edge,
    });
    const run = {
      schema_version: "1",
      run_id: body.run_id,
      created_at: "2024-04-03T12:00:00Z",
      descriptor: { model_id: "fixture", method_version: "1" },
      assumptions: {
        version: "1",
        effective_date: params.effective_date,
        assumptions: [
          {
            assumption_id: "exact",
            value_type: "integer",
            value: "EDGE",
            origin: "user_supplied",
            author: owner,
            rationale: "Exact integer fixture",
          },
        ],
      },
    };
    const saved = savedRun.parse(
      decodeModelingJson(JSON.stringify(run).replace('"EDGE"', edge)),
    );
    expect(String(saved.assumptions.assumptions[0].value)).toBe(edge);
    const encoded = encodeFcfRequest(
      { ...params, snapshot: `{"exact":${edge}}` },
      owner,
    );
    expect(encoded).toContain(`"inputs":{"exact":${edge}}`);
    expect(decodeModelingJson(encodeFcfRequest(params, owner))).toMatchObject({
      inputs: snapshot,
    });
  });

  it("keeps a previous run stale if native parameters change during evaluation", () => {
    const id = fixtures.zero.run_id;
    const saved = bindEvaluation(params, params, id);
    expect(saved).toMatchObject({ ...params, run_id: id, evaluated: id });
    const edited = updateModelParameter(saved, "capex_sign", "spending_positive");
    expect(bindEvaluation(edited, params, id)).toMatchObject({
      run_id: id,
      evaluated: "",
      capex_sign: "spending_positive",
    });
    expect(selectSavedOutput(edited, true)).toEqual({
      run_id: id,
      output_id: "fcf_yield",
    });
  });
});
