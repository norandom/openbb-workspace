import { useEffect, useState, useSyncExternalStore } from "react";
import DraggableCard from "~/components/DraggableCard";
import { useWidgetContext } from "~/components/Widget.context";
import { useCallbackRef } from "~/hooks/useRefHooks";
import { createEventsDocumentsController, type EventsDocumentsController } from "~/lib/eventsDocuments/controller";
import type { Choices } from "~/lib/eventsDocuments/selection";
import { useAuthStore } from "~/lib/state/auth";
import { useBackendConnectorStore, type Source } from "~/lib/state/backendConnector";
import { eventsDocumentsDeclaration } from "~/utils/nativeStorySchema";
import { storyAccess, subscribeStoryAccess, validStorySource } from "~/lib/eventsDocuments/access";
import { catalogChoices, storyChoices } from "~/lib/eventsDocuments/state";
import { Conclusion } from "./Conclusion";
import { Controls } from "./Controls";
import Documents from "./Documents";
import { Earnings } from "./Earnings";

export default function EventsDocumentsStory() {
  const { widget, activeDashboardId, isShared, isPreview } = useWidgetContext();
  const owner = useAuthStore((state) => state.user?.uuid);
  const source = useBackendConnectorStore((state) => widget.sourceId ? state.getApiSourceById(widget.sourceId) : undefined);
  const valid = validStorySource(widget, source);
  return (
    <DraggableCard title="Events and Documents">
      <div className="flex h-full min-w-0 flex-col gap-4 overflow-auto p-3 text-ds-text-body">
        <h2 className="body-md-semibold">{eventsDocumentsDeclaration.shape.description.value}</h2>
        {valid
          ? <StoryInstance key={JSON.stringify([widget.id, valid.id, owner, activeDashboardId, isShared, isPreview])}
              source={valid} owner={owner} />
          : <p role="alert">The Events and Documents widget declaration or source is unavailable.</p>}
      </div>
    </DraggableCard>
  );
}

function StoryInstance({ source, owner }: { source: Source; owner?: string }) {
  const context = useWidgetContext();
  const getContext = useCallbackRef(() => context);
  const defaults = catalogChoices(source);
  const [initial, setInitial] = useState(() => {
    const saved = context.widget.storage?.eventsDocuments;
    return saved === undefined ? defaults : storyChoices(saved);
  });
  const persist = useCallbackRef((choices: Choices) => {
    const { isShared, isPreview, updateWidget } = getContext();
    const access = storyAccess(getContext, owner);
    const encoded = storyChoices(choices);
    if (encoded && !isShared && !isPreview && access.hasDashboardAccess() &&
        access.getSource()?.id === source.id && access.hasSourceAccess(source.id)) {
      updateWidget?.((widget) => ({ ...widget, storage: { eventsDocuments: encoded } }), true);
    }
  });

  if (!initial) return (
    <>
      <p role="alert">The saved Events and Documents choices are invalid.</p>
      {defaults && <button type="button" className="self-start underline focus-visible:outline" onClick={() => {
        persist(defaults);
        setInitial(defaults);
      }}>Reset to catalog choices</button>}
    </>
  );
  return <ActiveStory initial={initial} owner={owner} getContext={getContext} persist={persist} />;
}

type ActiveProps = {
  initial: Choices;
  owner?: string;
  getContext: () => ReturnType<typeof useWidgetContext>;
  persist: (choices: Choices) => void;
};

function ActiveStory({ initial, owner, getContext, persist }: ActiveProps) {
  const [controller] = useState(() => createEventsDocumentsController(initial, storyAccess(getContext, owner)));
  useEffect(() => {
    const unsubscribe = subscribeStoryAccess(controller.syncAccess);
    let saved = controller.getSnapshot().controls.choices;
    const stopPersist = controller.subscribe(() => {
      const { choices } = controller.getSnapshot().controls;
      if (saved === choices) return;
      saved = choices;
      persist(choices);
    });
    controller.start();
    return () => {
      stopPersist();
      unsubscribe();
      controller.stop();
    };
  }, [controller, persist]);
  return <StoryViews controller={controller} />;
}

function StoryViews({ controller }: { controller: EventsDocumentsController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { controls, calendar, slots, onRetry } = snapshot;
  return (
    <>
      <Controls {...controls} />
      <Earnings state={slots.calendar} projection={calendar} symbol={controls.choices.symbol}
        display={controls.choices.charts} onDisplayChange={controls.onChartDisplayChange}
        onRetry={() => onRetry("calendar")} />
      <Documents snapshot={snapshot} />
      <Conclusion snapshot={snapshot} />
    </>
  );
}
