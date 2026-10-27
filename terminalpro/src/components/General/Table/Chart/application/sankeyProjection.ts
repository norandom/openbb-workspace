import type { ChartStorageOutput } from "../compatibility/legacyTypes";
import { buildSankeyGraph } from "../compatibility/sankeyGraph";
import { translateSankey } from "../echarts/sankey";
import { isSankeyCapture } from "./applicationSessionGuards";
import { sessionBaseline } from "./applicationSessionSelection";
import type {
  ApplicationSessionInputs,
  ApplicationSessionState,
} from "./applicationSessionTypes";
import type { ApplicationChartFamily } from "./comboSessionTypes";
import { resolveSankeyAppearance, sankeyEditorState } from "./sankeyAppearance";
import {
  readSankeySetup,
  sankeyDiagnostic,
  storedSankeySetup,
} from "./sankeySelection";
import { sankeyCaptureDiagnostics, sankeyColumns } from "./sankeySession";
import type { SankeyEditorProjection, SankeySessionReady } from "./sankeySessionTypes";
import type { SessionResult } from "./types";

/** Setup belongs to the current input frame, including frames without valid geometry. */
export function projectSankeyEditor(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state?: ApplicationSessionState,
): SankeyEditorProjection {
  const selected = readSankeySetup(storedSankeySetup(storage, inputs.address));
  const graph = isSankeyCapture(state?.capture)
    ? buildSankeyGraph(state.capture)
    : undefined;
  const diagnostics = [
    ...selected.diagnostics,
    ...sankeyCaptureDiagnostics(state?.captureDiagnostics ?? []),
    ...(graph?.diagnostics ?? []),
  ];
  if (
    state?.error &&
    !state.captureDiagnostics?.length &&
    !diagnostics.some((d) => d.message === state.error)
  )
    diagnostics.push(sankeyDiagnostic(state.error));
  let editor: SankeyEditorProjection["editor"];
  if (state) {
    try {
      editor = sankeyEditorState(
        resolveSankeyAppearance(
          { ...inputs, ...state.appearance },
          sessionBaseline(storage, { inputs, local: state.local }),
        ),
      );
    } catch (error) {
      diagnostics.push(
        sankeyDiagnostic(
          error instanceof Error ? error.message : "Invalid Sankey appearance",
        ),
      );
    }
  }
  return {
    setupProps: {
      columns: sankeyColumns(inputs),
      selection: selected.selection,
      diagnostics,
    },
    editor,
    diagnostics,
    ...(graph?.status === "empty"
      ? {
          notice:
            graph.reason === "no-rows"
              ? "No rows in selected range"
              : "All selected links are zero",
        }
      : {}),
  };
}
export function projectSankeySession(
  storage: ChartStorageOutput,
  inputs: ApplicationSessionInputs<ApplicationChartFamily>,
  state: ApplicationSessionState,
): SessionResult<SankeySessionReady> {
  const editor = projectSankeyEditor(storage, inputs, state);
  if (editor.diagnostics.some((d) => d.severity === "error"))
    return { status: "invalid", diagnostics: editor.diagnostics };
  if (!isSankeyCapture(state.capture) || !state.viewport) return { status: "waiting" };
  if (
    state.capture.dataRevision !== state.local.stamp.dataRevision ||
    state.capture.stateAddress !== inputs.address.stateAddress
  )
    return { status: "stale" };
  const graph = buildSankeyGraph(state.capture);
  if (graph.status === "invalid")
    return { status: "invalid", diagnostics: graph.diagnostics };
  if (graph.status === "empty") return { status: "waiting" };
  try {
    const baseline = sessionBaseline(storage, { inputs, local: state.local });
    const translated = translateSankey({
      graph: graph.graph,
      style: resolveSankeyAppearance({ ...inputs, ...state.appearance }, baseline),
      context: { display: inputs.display, viewport: state.viewport },
    });
    if (translated.status !== "supported")
      return { status: "invalid", diagnostics: translated.diagnostics };
    return {
      status: "ready",
      stamp: state.local.stamp,
      value: {
        kind: "sankey",
        stamp: state.local.stamp,
        revision: state.local.stamp.renderRevision,
        options: translated.options,
        model: baseline.model,
        snapshot: state.capture,
        diagnostics: graph.diagnostics,
      },
    };
  } catch (error) {
    return {
      status: "invalid",
      diagnostics: [
        sankeyDiagnostic(
          error instanceof Error ? error.message : "Invalid Sankey projection",
        ),
      ],
    };
  }
}
