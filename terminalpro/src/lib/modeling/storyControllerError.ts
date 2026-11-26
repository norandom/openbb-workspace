import { z } from "zod";
import { runId } from "./contract";

const storyServiceError = z.object({
  code: z.enum([
    "acquisition_unavailable",
    "unsupported_acquisition",
    "publication_unconfirmed",
    "capacity",
    "timeout",
    "cancelled",
    "evaluation_unavailable",
    "storage_unavailable",
  ]),
  retryable: z.boolean(),
  run_id: runId.optional().catch(undefined),
  fields: z
    .array(
      z.object({
        path: z.tuple([z.literal("acquisition")]),
        code: z.literal("entitlement"),
      }),
    )
    .optional()
    .catch(undefined),
});

export class StoryRequestError extends Error {
  constructor(
    message: string,
    readonly canRetry: boolean,
    readonly recoveryId?: string,
    readonly unavailable = false,
  ) {
    super(message);
  }
}

export function storyHttpError(status: number, data: unknown, write: boolean) {
  if (status === 401)
    return new StoryRequestError("Your Workspace session has expired.", true);
  if (status === 404 && !write)
    return new StoryRequestError(
      "Saved run unavailable.",
      true,
      undefined,
      true,
    );
  const error = storyServiceError.safeParse(data).data;
  switch (error?.code) {
    case "publication_unconfirmed":
      return new StoryRequestError(
        "The evaluation outcome is unknown.",
        true,
        error.run_id,
      );
    case "capacity":
      return new StoryRequestError("Modeling capacity is occupied.", true);
    case "acquisition_unavailable":
      return new StoryRequestError(
        "The model input provider is unavailable.",
        error.retryable,
      );
    case "unsupported_acquisition":
      return error.fields?.length
        ? new StoryRequestError(
            "The provider entitlement is unavailable.",
            true,
          )
        : new StoryRequestError(
            "The model could not acquire inputs for this selection.",
            error.retryable,
          );
    case "timeout":
      return new StoryRequestError(
        "The modeling request timed out.",
        write || error.retryable,
      );
    case "cancelled":
      return new StoryRequestError(
        "The modeling request was interrupted.",
        write || error.retryable,
      );
    case "evaluation_unavailable":
      return new StoryRequestError(
        "The model evaluation is unavailable.",
        error.retryable,
      );
    case "storage_unavailable":
      return new StoryRequestError(
        "Saved run storage is unavailable.",
        error.retryable,
      );
    default:
      return new StoryRequestError(
        write && status >= 500
          ? "The evaluation outcome is unknown."
          : "The modeling request failed.",
        status === 429 || status >= 500,
      );
  }
}
