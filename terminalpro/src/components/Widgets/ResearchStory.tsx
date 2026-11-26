import { useEffect, useState, useSyncExternalStore } from "react";
import DraggableCard from "~/components/DraggableCard";
import { useWidgetContext } from "~/components/Widget.context";
import { useCallbackRef } from "~/hooks/useRefHooks";
import { createEvaluationClient } from "~/lib/modeling/evaluationClient";
import { createStoryController } from "~/lib/modeling/storyController";
import {
  createStoryState,
  decodeStoryState,
  encodeStoryStorage,
  hasResearchStoryIdentity,
  type StorySelection,
} from "~/lib/modeling/storyState";
import { useAuthStore } from "~/lib/state/auth";
import { useBackendConnectorStore } from "~/lib/state/backendConnector";
import { canUseResearchStorySource } from "~/lib/utils/backendValidation/nativeWidget";
import { ResearchStoryControls } from "./ResearchStoryControls";
import { ResearchStoryViews } from "./ResearchStoryViews";

const schedule = { calendar_id: "NYSE_ARCA", schedule_revision: "nyse-arca.2026r1" } as const;
type Controller = ReturnType<typeof createStoryController>;

function evaluateSelection(controller: Controller, selection: StorySelection) {
  return controller.select(selection, { schedule, evaluatedAt: new Date().toISOString() });
}

export default function ResearchStory() {
  const { widget } = useWidgetContext();
  const source = useBackendConnectorStore((state) =>
    state.apiSources.find((candidate) => candidate.id === widget.sourceId),
  );
  const valid =
    hasResearchStoryIdentity(widget) &&
    widget.endpoint === undefined && widget.wsEndpoint === undefined &&
    widget.fileEndpoint === undefined && widget.params?.length === 0 &&
    canUseResearchStorySource(widget.sourceId, source);

  return (
    <DraggableCard>
      <div className="flex h-full flex-col gap-4 overflow-auto p-3 text-ds-text-body">
        {valid ? <StoryInstance key={widget.id} /> : (
          <p role="alert">The research story widget declaration is invalid.</p>
        )}
      </div>
    </DraggableCard>
  );
}

function StoryInstance() {
  const { widget, updateWidget, isPreview, isShared } = useWidgetContext();
  const session = useAuthStore((state) => state.user?.uuid);
  const readOnly = Boolean(isPreview || isShared);
  const [controller, setController] = useState<Controller>();
  const [error, setError] = useState<string>();
  const initialState = useCallbackRef(() => {
    const raw = widget.storage?.researchStory;
    return raw === undefined ? createStoryState() : decodeStoryState(raw);
  });
  const persist = useCallbackRef((storage: ReturnType<typeof encodeStoryStorage>) => {
    updateWidget((current) => ({ ...current, storage }), true);
  });

  useEffect(() => {
    const initial = initialState();
    if (!initial) {
      setError("The saved research story configuration is invalid.");
      setController(undefined);
      return;
    }
    setError(undefined);
    const client = createEvaluationClient(() => {
      const user = useAuthStore.getState().user;
      return session && user?.uuid === session ? user.token : undefined;
    });
    const next = createStoryController(client, initial);
    let lastSaved = next.getSnapshot().saved;
    const unsubscribe = next.subscribe(() => {
      const saved = next.getSnapshot().saved;
      if (session && !readOnly && saved !== lastSaved) persist(encodeStoryStorage(saved));
      lastSaved = saved;
    });
    setController(next);
    if (session && initial.cutoff) void next.reopen();
    else if (session && !readOnly) {
      void evaluateSelection(next, initial.selection).catch((cause: Error) => {
        setError(cause.message);
      });
    }
    return () => {
      unsubscribe();
      next.dispose();
    };
  }, [session, readOnly, initialState, persist]);

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!session && <p role="status">Sign in to access modeling.</p>}
      {controller && (
        <StoryBody
          controller={controller}
          readOnly={readOnly || !session}
          onError={setError}
        />
      )}
    </>
  );
}

type StoryBodyProps = {
  controller: Controller;
  readOnly: boolean;
  onError: (error?: string) => void;
};

function StoryBody({ controller, readOnly, onError }: StoryBodyProps) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  function select(selection: StorySelection) {
    onError(undefined);
    void evaluateSelection(controller, selection).catch((cause: Error) => {
      onError(cause.message);
    });
  }

  return (
    <>
      <h2 className="body-sm-semibold">
        Did the selected commodity proxy outperform the selected technology proxy
        over the 63 trading sessions ending at the observation date?
      </h2>
      <ResearchStoryControls
        selection={snapshot.saved.selection}
        onChange={select}
        readOnly={readOnly}
      />
      <ResearchStoryViews
        snapshot={snapshot}
        setCharts={controller.setCharts}
        retry={controller.retry}
        readOnly={readOnly}
      />
    </>
  );
}
