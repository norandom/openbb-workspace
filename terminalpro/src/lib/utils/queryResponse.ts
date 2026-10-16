interface QueryErrorEnvelope {
  warnings?: unknown[];
  detail?: unknown;
  message?: unknown;
  error?: unknown;
  error_kind?: unknown;
  status?: unknown;
}

export async function rejectQueryResponse(
  response: Response,
  reject: (reason?: unknown) => void,
  onError?: (error: Error) => void,
): Promise<void> {
  let error: QueryErrorEnvelope;
  try {
    error = await response.json();
  } catch {
    reject(response.statusText);
    return;
  }
  if (Array.isArray(error?.warnings)) {
    for (const warning of error.warnings) console.warn(warning);
  }
  const detail = error?.detail || error?.message || error?.error || error;
  const message = typeof detail === "string" ? detail : JSON.stringify(detail);
  const result = new Error(message, {
    cause: error?.error_kind || error?.status || "unknown",
  });
  onError?.(result);
  reject(result);
}
