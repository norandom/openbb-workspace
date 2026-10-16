import { memo, useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "~/components/ds/atoms/Button";
import { useShallowAppStore } from "~/lib/state/app";
import {
  type BackendTemplate,
  useShallowBackendConnectorStore,
} from "~/lib/state/backendConnector";
import { useCopilotStore } from "~/lib/state/copilot";
import { createCustomTemplateTab } from "~/lib/utils/createTemplates";
import { ConfirmDialog } from "../../ds/dialogs/ConfirmDialog";
import { cn } from "../../ds/utils";
import Icon from "../../Icon";
import Tooltip from "../../Tooltip";
import {
  buildAppArtifactSource,
  buildWidgetMetadataResolver,
  buildWidgetSourceResolver,
} from "../appArtifactUtils";

import type { ArtifactProps } from "./ArtifactShared";

export const AppArtifact = memo<ArtifactProps<"app">>(({ artifact, inAiMessage }) => {
  const navigate = useNavigate();
  const { id: currentDashboard } = useParams();
  const { addTab, items } = useShallowAppStore((state) => ({
    addTab: state.addTab,
    items: state.items,
  }));
  const { apiSources, widgetMetadata } = useShallowBackendConnectorStore((state) => ({
    apiSources: state.apiSources,
    widgetMetadata: state.widgetMetadata,
  }));

  const appArtifactSource = useMemo(() => buildAppArtifactSource(artifact), [artifact]);
  const resolveWidget = useMemo(
    () => buildWidgetMetadataResolver(widgetMetadata),
    [widgetMetadata],
  );
  const [confirmDialog, setConfirmDialog] = useState(false);
  const currentDashboardItem = currentDashboard ? items?.[currentDashboard] : undefined;
  const isInDashboard = !!currentDashboardItem?.data && !currentDashboardItem.isFolder;
  const { app } = artifact;
  const tabs = useMemo(() => Object.values(app.tabs ?? {}), [app.tabs]);
  const widgetCount = useMemo(
    () => tabs.reduce((total, tab) => total + (tab.layout?.length ?? 0), 0),
    [tabs],
  );

  const handleOpen = useCallback(
    async (action: "open" | "update") => {
      if (!isInDashboard && action === "update") {
        // dont allow update if not in a dashboard, since we wouldnt know which dashboard to update
        toast.warning("No active dashboard to update", {
          description: "Please open a dashboard first",
        });
        return;
      }
      try {
        if (action === "open") {
          const {
            isFullscreen,
            setIsFullscreen,
            setIsIntentionallyCollapsed,
            setLastPanelState,
          } = useCopilotStore.getState();

          if (isFullscreen) {
            setIsIntentionallyCollapsed(false);
            setLastPanelState("open");
            setIsFullscreen(false);
          }
        }

        await createCustomTemplateTab({
          addTab,
          navigate,
          items,
          template: app as unknown as BackendTemplate,
          source: appArtifactSource,
          currentDashboard,
          dashboardBehavior: action === "open" ? "new" : "current",
          resolveWidgetSource: buildWidgetSourceResolver(
            artifact.widget_refs ?? [],
            apiSources,
          ),
          resolveWidget,
        });
      } catch (error) {
        toast.error("Failed to open app", {
          description: error instanceof Error ? error.message : "Unexpected error",
        });
      }
    },
    [
      addTab,
      navigate,
      items,
      app,
      appArtifactSource,
      artifact,
      currentDashboard,
      apiSources,
      resolveWidget,
      isInDashboard,
    ],
  );

  return (
    <div
      id={artifact.name}
      data-testid="app-artifact"
      className={cn(
        "@container/app-artifact flex min-w-0 flex-col gap-3 overflow-hidden rounded-md bg-components-chat-copilot-cards-bg p-3 mx-1",
        { "my-1": inAiMessage },
      )}
    >
      <ConfirmDialog
        title="Do you want to update this dashboard?"
        description="This will update the current dashboard with the changes from the app artifact."
        open={confirmDialog}
        confirmButton={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              handleOpen("update");
              setConfirmDialog(false);
            }}
          >
            Yes, update
          </Button>
        }
        onClose={() => {
          setConfirmDialog(false);
        }}
      />
      <div className="flex items-start gap-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="body-sm-medium text-ds-text-heading truncate">
            {app.name}
          </span>
          {app.description && (
            <span className="body-xs-regular text-ds-text-body line-clamp-2">
              {app.description}
            </span>
          )}
          <span className="body-xs-regular text-ds-text-caption pt-0.5">
            {tabs.length} {tabs.length === 1 ? "tab" : "tabs"} · {widgetCount}{" "}
            {widgetCount === 1 ? "widget" : "widgets"}
          </span>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <span
              key={tab.id}
              className="inline-flex items-center gap-1 rounded-sm border border-general-border-secondary bg-general-bg-primary px-2 py-0.5 body-xs-regular text-ds-text-body"
            >
              {tab.name}
              <span className="text-ds-text-caption">{tab.layout?.length ?? 0}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex w-full min-w-0 flex-col items-stretch gap-2 @min-[360px]/app-artifact:flex-row @min-[360px]/app-artifact:flex-wrap @min-[360px]/app-artifact:items-center @min-[360px]/app-artifact:justify-end">
        <Tooltip message="Create a new dashboard with this app.">
          <span className="inline-flex w-full min-w-0 @min-[360px]/app-artifact:w-auto">
            <Button
              size="xs"
              variant="primary"
              className="w-full min-w-0 whitespace-normal @min-[360px]/app-artifact:w-auto"
              onClick={() => handleOpen("open")}
              data-testid="open-app-artifact-button"
            >
              <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
                <Icon id="dashboard-icon" className="size-3.5 shrink-0" />
                <span className="hidden @min-[280px]/app-artifact:inline">
                  Open in new dashboard
                </span>
                <span className="@min-[280px]/app-artifact:hidden">Open</span>
              </span>
            </Button>
          </span>
        </Tooltip>
        <Tooltip
          message={
            "Update current dashboard with changes from the app artifact. This will overwrite any existing widgets in the current dashboard."
          }
        >
          <span className="inline-flex w-full min-w-0 @min-[360px]/app-artifact:w-auto">
            <Button
              size="xs"
              variant="secondary"
              className="w-full min-w-0 whitespace-normal @min-[360px]/app-artifact:w-auto"
              disabled={!isInDashboard}
              onClick={() => setConfirmDialog(true)}
              data-testid="update-current-dashboard-app-artifact-button"
            >
              <span className="inline-flex min-w-0 items-center justify-center gap-1.5">
                <Icon id="edit-03" className="size-3.5 shrink-0" />
                <span className="hidden @min-[280px]/app-artifact:inline">
                  Update current dashboard
                </span>
                <span className="@min-[280px]/app-artifact:hidden">Update</span>
              </span>
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
});

AppArtifact.displayName = "AppArtifact";
