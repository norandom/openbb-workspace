import { useEffect, useRef, useState } from "react";
import { createSession } from "./lifecycle";
import { createViewer, type PerspectiveRows, type PerspectiveTheme } from "./runtime";

export interface PerspectiveHostProps {
  data: PerspectiveRows;
  theme: PerspectiveTheme;
  className?: string;
}

function observeSize(
  element: HTMLElement,
  resize: () => Promise<void>,
  fail: () => void,
) {
  let frame = 0;
  const redraw = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      void resize().catch(fail);
    });
  };
  const observer = new ResizeObserver((entries) => {
    if (
      entries.some(({ contentRect }) => contentRect.width > 0 && contentRect.height > 0)
    )
      redraw();
  });
  observer.observe(element);
  redraw();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

export function PerspectiveHost({ data, theme, className }: PerspectiveHostProps) {
  const container = useRef<HTMLDivElement>(null);
  const session = useRef<ReturnType<typeof createSession>>();
  const [attempt, retry] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    let mounted = true;
    setStatus("loading");
    const fail = () => {
      if (mounted) setStatus("failed");
    };
    const owned = createSession(
      () => {
        const viewer = createViewer();
        Object.assign(viewer.style, {
          display: "block",
          width: "100%",
          height: "100%",
          minWidth: "0",
          minHeight: "0",
        });
        parent.append(viewer);
        return viewer;
      },
      data,
      theme,
    );
    session.current = owned;
    const stopObserving = observeSize(parent, owned.resize, fail);
    void owned.ready
      .then(() => {
        if (mounted) setStatus("ready");
      })
      .catch(fail);
    return () => {
      mounted = false;
      stopObserving();
      session.current = undefined;
      parent.replaceChildren();
      void owned.dispose().catch(() => {});
    };
  }, [data, attempt]);

  useEffect(() => {
    const owned = session.current;
    let active = true;
    void owned?.theme(theme).catch(() => {
      if (active && session.current === owned) setStatus("failed");
    });
    return () => {
      active = false;
    };
  }, [theme, attempt, data]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        colorScheme: theme,
      }}
    >
      <div ref={container} style={{ width: "100%", height: "100%" }} />
      {status === "loading" && (
        <div
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            background: "Canvas",
            color: "CanvasText",
          }}
        >
          Loading Perspective…
        </div>
      )}
      {status === "failed" && (
        <div
          role="alert"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "Canvas",
            color: "CanvasText",
          }}
        >
          Perspective unavailable.{" "}
          <button type="button" onClick={() => retry((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default PerspectiveHost;
