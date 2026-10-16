import Markdown from "markdown-to-jsx";
import { memo, useMemo } from "react";
import { toast } from "sonner";
import { useShallowCopilotStore } from "~/lib/state/copilot";
import { cn } from "../../ds/utils";
import { CodeComponent, PreCodeComponent, renderRule } from "../MarkdownOverrides";

import { ArtifactActions, type ArtifactProps } from "./ArtifactShared";

export const TextArtifact = memo<ArtifactProps<"text">>(({ artifact, inAiMessage }) => {
  const isHighlighted = useShallowCopilotStore(
    (s) => s.hoveredCitationWidgetId === artifact.name,
  );

  // Markdown needs double spaces to create a line break
  const content = useMemo(
    () => artifact.content.replace(/\n/g, "  \n"),
    [artifact.content],
  );

  const markdownOptions = useMemo(
    () => ({
      disableParsingRawHTML: true,
      renderRule,
      overrides: {
        a: (props: any) => {
          return (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {props.children}
            </a>
          );
        },
        p: (props: any) => {
          if (props?.children?.some((child: any) => typeof child === "object")) {
            return <div {...props} />;
          }
          return <p {...props} />;
        },
        code: { component: CodeComponent },
        pre: { component: PreCodeComponent },
      },
    }),
    [],
  );

  return (
    <div
      id={artifact.name}
      className={cn({
        "max-h-[200px] overflow-auto relative flex flex-col items-start py-1 rounded min-w-10 max-w-full mx-1":
          !inAiMessage,
        "outline-2 outline-brand-main": !inAiMessage && isHighlighted,
        "dark:bg-dark-400 rounded p-[3px] bg-light-100": inAiMessage,
        "dark:bg-dark-800 bg-light-50": !inAiMessage,
      })}
    >
      <div
        className={cn({
          "px-2.5 prose-sm !text-xs text-justify": !inAiMessage,
        })}
      >
        <Markdown options={markdownOptions}>{content}</Markdown>
      </div>
      {!inAiMessage && (
        <ArtifactActions
          copyTooltip="Copy text to clipboard"
          createTooltip="Create widget from text"
          copyTestId="copy-text-button"
          createTestId="create-widget-from-text-button"
          onCopy={() => {
            navigator.clipboard
              .writeText(content)
              .then(() => toast.success("Text copied to clipboard"))
              .catch((err) =>
                toast.error("Failed to copy text to clipboard", {
                  description: err.message,
                }),
              );
          }}
          createWidgetParams={{
            widgetType: "text",
            content: content,
            metadata: {
              uuid: artifact.uuid,
              name: artifact.name,
              description: artifact.description,
            },
          }}
        />
      )}
    </div>
  );
});

TextArtifact.displayName = "TextArtifact";
