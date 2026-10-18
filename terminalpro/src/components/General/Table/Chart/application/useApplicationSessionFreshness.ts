import { useCallback, useLayoutEffect, useRef } from "react";
import type { SessionStamp } from "./types";
import { validateSessionStamp } from "./sessionState";

/** Export checks read the last committed session, including disposal, rather than a view closure. */
export function useApplicationSessionFreshness(stamp: SessionStamp | undefined) {
  const latest = useRef<SessionStamp>();
  useLayoutEffect(() => {
    latest.current = stamp;
    return () => {
      latest.current = undefined;
    };
  }, [stamp]);
  return useCallback(
    (captured: SessionStamp) =>
      latest.current
        ? validateSessionStamp(captured, latest.current)
        : { status: "stale" as const },
    [],
  );
}
