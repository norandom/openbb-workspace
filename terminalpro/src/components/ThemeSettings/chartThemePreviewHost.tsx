import { useCallback, useId, useMemo, useRef, useState } from "react";
import { EChartsHost } from "../General/Table/Chart/echarts/EChartsHost";
import { buildChartPreview } from "./chartThemePreview";
import type { PreviewViewport } from "./chartThemePreviewLayout";
import type { ChartThemeState, ThemeMode } from "./chartThemeState";

interface Props {
  state: ChartThemeState;
  mode: ThemeMode;
}

export function ChartThemePreviewHost({ state, mode }: Props) {
  const session = useId();
  const revision = useRef(0);
  const [viewport, setViewport] = useState<PreviewViewport>({
    width: 800,
    height: 600,
  });
  const [failure, setFailure] = useState<{ revision: number; message: string }>();
  const preview = useMemo(() => {
    const current = ++revision.current;
    try {
      return { revision: current, request: buildChartPreview(state, mode, viewport) };
    } catch (error) {
      return {
        revision: current,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [state, mode, viewport]);
  const onResize = useCallback((size: PreviewViewport) => {
    setViewport((previous) =>
      previous.width === size.width && previous.height === size.height
        ? previous
        : size,
    );
  }, []);
  const onError = useCallback(
    (error: unknown) => {
      if (revision.current !== preview.revision) return;
      setFailure({
        revision: preview.revision,
        message: error instanceof Error ? error.message : String(error),
      });
    },
    [preview.revision],
  );
  const error =
    preview.error ??
    (failure?.revision === preview.revision ? failure.message : undefined);
  return (
    <div data-testid="chart-theme-preview" className="relative w-full h-full min-h-0">
      {error ? (
        <div role="alert">Chart preview unavailable: {error}</div>
      ) : (
        preview.request && (
          <EChartsHost
            {...preview.request}
            revision={preview.revision}
            legendScope={`${session}:${mode}`}
            className="w-full h-full"
            onResize={onResize}
            onError={onError}
          />
        )
      )}
    </div>
  );
}
