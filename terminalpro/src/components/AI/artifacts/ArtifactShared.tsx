import type { FC } from "react";
import type { ArtifactT, ArtifactType } from "~/lib/state/copilot";
import { cn } from "../../ds/utils";
import Icon from "../../Icon";
import Tooltip from "../../Tooltip";
import type { CreateWidgetParams } from "../hooks/useCreateWidgetFromArtifact";
import { dispatchCreate } from "../hooks/utils";

export type ArtifactProps<
  T extends ArtifactT["type"] = ArtifactT["type"],
  R extends ArtifactType<T> = ArtifactType<T>,
> = {
  artifact: R;
  inAiMessage?: boolean;
};

type ArtifactActionsProps = {
  onCopy: () => void;
  createWidgetParams: CreateWidgetParams;
  copyTooltip: string;
  createTooltip: string;
  copyClassName?: string;
  copyTestId?: string;
  createTestId?: string;
  onFullscreen?: () => void;
};

export const ArtifactActions: FC<ArtifactActionsProps> = ({
  onCopy,
  createWidgetParams,
  copyTooltip,
  createTooltip,
  copyClassName = "",
  copyTestId = "copy-artifact-button",
  createTestId = "create-widget-from-artifact-button",
  onFullscreen,
}) => {
  return (
    <div className="flex items-center justify-end gap-1 pt-1.5 pb-0.5 pr-0.5">
      {onFullscreen && (
        <Tooltip message="View report full screen">
          <button
            data-testid="view-fullscreen-html-button"
            onClick={onFullscreen}
            className="obb-small-navbar-btn"
          >
            <Icon id="maximize-01" className="size-3.5" />
          </button>
        </Tooltip>
      )}
      <Tooltip message={copyTooltip}>
        <button
          data-testid={copyTestId}
          onClick={onCopy}
          className={cn(
            "obb-small-navbar-btn flex items-center justify-center",
            copyClassName,
          )}
        >
          <Icon id="clipboard-icon" className="size-3.5" />
        </button>
      </Tooltip>
      <Tooltip message={createTooltip}>
        <button
          data-testid={createTestId}
          onClick={() => dispatchCreate(createWidgetParams)}
          className="obb-small-navbar-btn flex items-center justify-center"
        >
          <Icon id="solar-widget-add-outline" className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
};
