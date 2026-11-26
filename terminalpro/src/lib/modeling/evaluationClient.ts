import { z } from "zod";
import {
  FCF_METHOD,
  FCF_MODEL,
  FCF_OUTPUT,
  MODELING_PATH,
  projection,
  runId,
  savedRun,
  type SavedSelection,
} from "./contract";
import type { StoryBinding, StoryRole } from "./storyContract";
import { encodeStoryEvaluation } from "./storyControllerRequest";
import { storyHttpError, StoryRequestError } from "./storyControllerError";

export type FcfParameters = {
  snapshot: string;
  assumption_version: string;
  effective_date: string;
  capex_sign: string;
};

const assumptionVersion = z.string().trim().min(1).max(128);
const effectiveDate = z.iso.date();
const capexSign = z.enum(["cash_outflow_negative", "spending_positive"]);
const safeError = z.object({
  code: z.string().regex(/^[a-z][a-z_]{0,63}$/),
  correlation_id: z.string().regex(/^[0-9a-f]{32}$/),
});

export function fcfRequest(params: FcfParameters, author: string) {
  if (!z.uuid().safeParse(author).success)
    throw new Error("Sign in to evaluate FCF yield.");
  const version = assumptionVersion.safeParse(params.assumption_version);
  const date = effectiveDate.safeParse(params.effective_date);
  if (!version.success || !date.success) {
    throw new Error("Enter an assumption version and an effective date.");
  }
  const sign = capexSign.safeParse(params.capex_sign);
  if (!sign.success)
    throw new Error("Select the CapEx sign convention used by the snapshot.");
  let inputs: unknown;
  try {
    inputs = JSON.parse(params.snapshot);
  } catch {
    throw new Error(
      "Enter a valid input snapshot JSON object with exact decimal strings.",
    );
  }
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    throw new Error("Enter an input snapshot JSON object.");
  }
  return {
    model_id: FCF_MODEL,
    method_version: FCF_METHOD,
    assumptions: {
      version: version.data,
      effective_date: date.data,
      assumptions: [
        {
          assumption_id: "capex_sign",
          value_type: "text",
          value: sign.data,
          origin: "user_supplied",
          author,
          rationale:
            "Sign convention selected for the supplied cash-flow observations.",
        },
      ],
    },
  };
}

export function encodeFcfRequest(params: FcfParameters, author: string) {
  const envelope = JSON.stringify(fcfRequest(params, author));
  // Forward validated snapshot JSON verbatim to preserve numeric tokens in provider observations.
  return `${envelope.slice(0, -1)},"inputs":${params.snapshot}}`;
}

export function decodeModelingJson(text: string): unknown {
  return JSON.parse(
    text,
    (_key: string, value: unknown, context?: { source: string }) => {
      if (typeof value !== "number" || Number.isSafeInteger(value)) return value;
      if (context && /^-?\d{1,19}$/.test(context.source)) return BigInt(context.source);
      return value;
    },
  );
}

export function createEvaluationClient(
  getToken: () => string | undefined,
  transport = fetch,
) {
  async function request<T>(
    path: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    body?: string,
    story = false,
  ): Promise<T> {
    const token = getToken();
    if (!token) {
      if (story) throw new StoryRequestError("Sign in to access modeling.", true);
      throw new Error("Sign in to access modeling.");
    }
    let response: Response;
    try {
      response = await transport(`${MODELING_PATH}/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body && { "Content-Type": "application/json" }),
        },
        body,
        cache: "no-store",
        redirect: "error",
        signal,
      });
    } catch {
      if (story) {
        throw new StoryRequestError(
          body ? "The evaluation outcome is unknown." : "The modeling service is unavailable.",
          true,
        );
      }
      throw new Error("Modeling service unavailable.");
    }
    const data: unknown = await response
      .text()
      .then(decodeModelingJson)
      .catch(() => undefined);
    if (!response.ok) {
      if (story) throw storyHttpError(response.status, data, body !== undefined);
      if (response.status === 401)
        throw new Error("Your Workspace session has expired.");
      if (response.status === 404) throw new Error("Saved run or output unavailable.");
      const error = safeError.safeParse(data);
      const detail = error.success
        ? ` (${error.data.code}, ${error.data.correlation_id})`
        : "";
      throw new Error(`Modeling request failed [${response.status}]${detail}.`);
    }
    if (story && data === undefined) {
      throw new StoryRequestError(
        body ? "The evaluation outcome is unknown." : "The saved run response was interrupted.",
        true,
      );
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new Error("Modeling returned an incompatible v1 response.");
    return parsed.data;
  }

  return {
    evaluateStory(role: StoryRole, binding: StoryBinding, signal: AbortSignal) {
      return request("evaluations", z.unknown(), signal, encodeStoryEvaluation(role, binding), true);
    },
    readStoryRun(id: string, signal: AbortSignal) {
      if (!runId.safeParse(id).success) throw new StoryRequestError("Saved run unavailable.", false);
      return request(`runs/${encodeURIComponent(id)}`, z.unknown(), signal, undefined, true);
    },
    async evaluate(params: FcfParameters, author: string, signal: AbortSignal) {
      const run = await request(
        "evaluations",
        savedRun,
        signal,
        encodeFcfRequest(params, author),
      );
      if (
        run.descriptor.model_id !== FCF_MODEL ||
        run.descriptor.method_version !== FCF_METHOD
      ) {
        throw new Error("Modeling returned an unexpected FCF method.");
      }
      return run;
    },
    async read(selection: SavedSelection, signal: AbortSignal) {
      const query = new URLSearchParams(selection);
      const [run, output] = await Promise.all([
        request(`runs/${encodeURIComponent(selection.run_id)}`, savedRun, signal),
        request(`widget-results?${query}`, projection, signal),
      ]);
      if (
        run.run_id !== selection.run_id ||
        output.run_id !== run.run_id ||
        output.results[0].output_id !== selection.output_id
      ) {
        throw new Error("Modeling returned a different saved run or output.");
      }
      if (
        run.descriptor.model_id === FCF_MODEL &&
        selection.output_id === FCF_OUTPUT &&
        (run.descriptor.method_version !== FCF_METHOD ||
          output.results[0].unit !== "percent" ||
          output.results[0].value_type !== "decimal")
      ) {
        throw new Error("Modeling returned an incompatible FCF output.");
      }
      return { run, output };
    },
  };
}

export type EvaluationClient = ReturnType<typeof createEvaluationClient>;
