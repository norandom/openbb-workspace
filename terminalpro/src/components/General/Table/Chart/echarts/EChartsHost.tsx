import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";
import {
  type ChartImageOptions,
  type ChartLifecycle,
  type ChartRenderRequest,
  createChartLifecycle,
} from "./lifecycle";

export interface EChartsHostHandle {
  exportImage(options?: ChartImageOptions): string;
}
export interface EChartsHostProps extends ChartRenderRequest {
  className?: string;
  style?: CSSProperties;
  onError?: (error: unknown) => void;
}

/** Owns a renderer without exposing its instance or defining application menu semantics. */
export const EChartsHost = forwardRef<EChartsHostHandle, EChartsHostProps>(
  function EChartsHost({ options, revision, className, style, onError }, ref) {
    const container = useRef<HTMLDivElement>(null);
    const owner = useRef<ChartLifecycle>();
    const latest = useRef({ options, revision, onError });
    latest.current = { options, revision, onError };

    useImperativeHandle(ref, () => ({
      exportImage(imageOptions) {
        if (!owner.current) throw new Error("Chart image is unavailable");
        return owner.current.exportImage(imageOptions);
      },
    }), []);

    useEffect(() => {
      if (!container.current) return;
      const lifecycle = createChartLifecycle(container.current);
      let active = true;
      const report = (error: unknown) => {
        if (latest.current.onError) latest.current.onError(error);
        else throw error;
      };
      const observer = new ResizeObserver(() => {
        if (!active) return;
        try { lifecycle.resize(); } catch (error) { report(error); }
      });
      const cleanup = () => {
        if (!active) return;
        active = false;
        if (owner.current === lifecycle) owner.current = undefined;
        observer.disconnect();
        lifecycle.dispose();
      };
      owner.current = lifecycle;
      try {
        lifecycle.mount(latest.current);
        observer.observe(container.current);
      } catch (error) {
        cleanup();
        report(error);
      }
      return cleanup;
    }, []);

    useEffect(() => {
      if (!owner.current) return;
      try { owner.current.update({ options, revision }); }
      catch (error) {
        if (latest.current.onError) latest.current.onError(error);
        else throw error;
      }
    }, [options, revision]);

    return <div ref={container} className={className} style={style} />;
  },
);
