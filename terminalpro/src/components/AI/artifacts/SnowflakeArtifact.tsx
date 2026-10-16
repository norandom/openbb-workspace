import { memo, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useShallowAppStore } from "~/lib/state/app";
import { useShallowCopilotStore } from "~/lib/state/copilot";
import { useShallowSidebarStore } from "~/lib/state/sidebar";
import { cn } from "../../ds/utils";
import Icon from "../../Icon";
import Tooltip from "../../Tooltip";
import type { WidgetT } from "../../types";
import { useShallowAppWidgetsStore } from "../hooks/useGetAppWidgets";
import { SQLMarkdown } from "../MarkdownOverrides";

import type { ArtifactProps } from "./ArtifactShared";

export const SnowflakeArtifact = memo<
  ArtifactProps<"snowflake_query" | "snowflake_python">
>(({ artifact, inAiMessage }) => {
  const isQuery = artifact.type === "snowflake_query";

  const isHighlighted = useShallowCopilotStore(
    (s) => s.hoveredCitationWidgetId === artifact.name,
  );
  const currentDashboardId = useShallowSidebarStore(
    (s) => s.activeItem as string | null,
  );
  const { addWidget, getDashboardById } = useShallowAppStore((state) => ({
    addWidget: state.addWidget,
    getDashboardById: state.getTabById,
  }));

  const getAppWidget = useShallowAppWidgetsStore((s) => s.getAppWidget);

  const content = useMemo(
    () => artifact.content.replace(/```(sql|python)|```/g, "").trim(),
    [artifact.content],
  );

  const handleCopy = useCallback(() => {
    navigator.clipboard
      .writeText(content)
      .then(() => toast.success("SQL copied to clipboard"))
      .catch((err) => toast.error("Failed to copy SQL", { description: err.message }));
  }, [content]);

  const handleCreateWidget = useCallback(async () => {
    if (!currentDashboardId)
      return toast.error("No active dashboard", {
        description: "Please open a dashboard first",
      });

    const tab = getDashboardById(currentDashboardId);
    if (!tab) return toast.error("Dashboard not found");

    const { widget_uuid, origin, id } = artifact.query_data_source;

    // Find the original widget by UUID
    const originalWidget = tab.data?.widgets?.find((w) => w.id === widget_uuid);
    let widget = originalWidget;

    if (!originalWidget) {
      widget = getAppWidget(id as WidgetT["widgetId"], origin);
      if (!widget) {
        return toast.error("Original widget not found", {
          description: `Widget \`${id}\` not found in dashboard or app widgets`,
        });
      }
    }

    // Clone the widget with updated parameter
    const newWidget = {
      ...structuredClone(widget),
      id: undefined,
      gridData: { w: 40, h: 15, minH: 10, minW: 16 },
      storage: widget?.storage || { params: {} },
    } as WidgetT;

    const paramsKey = isQuery ? "query" : "prompt";

    newWidget.storage = {
      ...newWidget.storage,
      params: {
        ...newWidget.storage?.params,
        [paramsKey]: content,
      },
    };

    if (!isQuery) {
      newWidget.storage.response = undefined;
    }

    try {
      const widgetId = await addWidget(currentDashboardId, newWidget);
      toast.success(`${isQuery ? "SQL" : "Python"} widget added to dashboard`);
      setTimeout(() => {
        const element = document.querySelector(`[data-widget-id="${widgetId}"]`);
        if (element) element.scrollIntoView({ behavior: "smooth" });
      }, 200);
    } catch (err) {
      toast.error("Failed to add widget", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [currentDashboardId, getDashboardById, artifact, content, addWidget]);

  const innerContent = useMemo(() => {
    return (
      <>
        <SQLMarkdown content={artifact.content} />
        {/* Action buttons - inside, bottom right corner */}
        <div
          className={cn("absolute bottom-2 right-2 flex gap-2 items-center", {
            "bottom-4 right-2": inAiMessage,
          })}
        >
          <Tooltip message={`Copy ${isQuery ? "SQL" : "Python"} to clipboard`}>
            <button
              onClick={handleCopy}
              className="hover:text-black dark:hover:text-white h-3 w-3"
            >
              <Icon
                id="clipboard-icon"
                className="hover:text-black dark:hover:text-white h-3 w-3"
              />
            </button>
          </Tooltip>
          <Tooltip message={`Add ${isQuery ? "SQL" : "Python"} widget to dashboard`}>
            <button
              onClick={handleCreateWidget}
              className="hover:text-black dark:hover:text-white h-3 w-3"
            >
              <Icon
                id="solar-widget-add-outline"
                className="hover:text-black dark:hover:text-white h-3 w-3"
              />
            </button>
          </Tooltip>
        </div>
      </>
    );
  }, [artifact.content, handleCopy, handleCreateWidget, inAiMessage]);

  return (
    <div
      id={artifact.name}
      className={cn("w-full relative", {
        "outline-2 outline-brand-main rounded": isHighlighted,
      })}
    >
      {inAiMessage ? (
        innerContent
      ) : (
        <div
          className={cn("dark:bg-dark-800 bg-light-50 mt-0 mx-0 p-0", {
            "outline-2 outline-brand-main rounded": isHighlighted,
          })}
        >
          {innerContent}
        </div>
      )}
    </div>
  );
});

SnowflakeArtifact.displayName = "SnowflakeArtifact";
