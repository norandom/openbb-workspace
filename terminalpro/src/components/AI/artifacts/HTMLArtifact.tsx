import DOMPurify from "dompurify";
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { BaseDialog } from "~/components/ds/dialogs/BaseDialog";
import { DialogTitle } from "~/components/ds/dialogs/Dialog";
import { IFRAME_SRCDOC_SANDBOX_ATTRIBUTES } from "~/lib/constants";
import { getConfig } from "~/lib/runtimeConfig";
import { useShallowCopilotStore } from "~/lib/state/copilot";
import { HTML_SANITIZE_CONFIG } from "~/lib/utils/sanitize";
import { cn } from "../../ds/utils";

import { ArtifactActions, type ArtifactProps } from "./ArtifactShared";

const maxHeight = 600;

export const HTMLArtifact = memo<ArtifactProps<"html">>(({ artifact, inAiMessage }) => {
  const allowJsExecution = getConfig().data.allowHtmlJsExecution;
  const isHighlighted = useShallowCopilotStore(
    (s) => s.hoveredCitationWidgetId === artifact.name,
  );

  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sanitizedContent = useMemo(() => {
    const clean = DOMPurify.sanitize(artifact.content, {
      ...HTML_SANITIZE_CONFIG,
      WHOLE_DOCUMENT: true,
    });

    const injectedStyle =
      "<style>body{margin:0;padding:0}table{display:block;overflow-x:auto;max-width:100%}</style>";

    const injectedScript = allowJsExecution
      ? `<script>
(function(){
  function postHeight(){
    var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
    parent.postMessage({type:"artifactHeight",height:h},"*");
  }
  postHeight();
  if(typeof ResizeObserver!=="undefined"){
    new ResizeObserver(postHeight).observe(document.body);
  }
})();
</script>`
      : "";

    // Inject style (and script if JS enabled) into the HTML
    if (clean.includes("</head>")) {
      return clean.replace("</head>", `${injectedStyle}${injectedScript}</head>`);
    }
    return `${injectedStyle}${injectedScript}${clean}`;
  }, [artifact.content]);

  const handleIframeLoad = useCallback(() => {
    // When JS enabled, postMessage handles height — contentDocument is null (opaque origin)
    if (allowJsExecution && !inAiMessage) return;

    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc?.body) return;

    const measureHeight = () => {
      const body = iframe?.contentDocument?.body;
      if (body) {
        const docHeight = iframe?.contentDocument?.documentElement?.scrollHeight ?? 0;
        const bodyHeight = body.scrollHeight;
        const newHeight = Math.max(docHeight, bodyHeight);
        setIframeHeight((prev) => (prev === newHeight ? prev : newHeight));
      }
    };

    requestAnimationFrame(() => {
      measureHeight();

      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = new ResizeObserver(() => {
        requestAnimationFrame(measureHeight);
      });
      resizeObserverRef.current.observe(doc.body);
    });
  }, [inAiMessage]);

  useEffect(() => {
    if (!allowJsExecution || !inAiMessage) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === "artifactHeight") {
        const h = Number(event.data.height);
        if (Number.isFinite(h) && h > 0) {
          setIframeHeight((prev) => (prev === h ? prev : h));
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [inAiMessage]);

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  const iframeStyle = useMemo<CSSProperties>(
    () =>
      iframeHeight !== null
        ? { height: Math.min(iframeHeight, maxHeight) }
        : { minHeight: 50 },
    [iframeHeight],
  );

  return (
    <div
      id={artifact.name}
      className={cn("relative mx-1", {
        "outline-2 outline-brand-main": isHighlighted,
        "dark:bg-dark-400 rounded p-2 bg-light-100": inAiMessage,
        "dark:bg-dark-800 bg-light-50 rounded p-2": !inAiMessage,
      })}
    >
      <iframe
        ref={iframeRef}
        srcDoc={sanitizedContent}
        className="w-full border-0"
        style={iframeStyle}
        sandbox={
          allowJsExecution ? IFRAME_SRCDOC_SANDBOX_ATTRIBUTES : "allow-same-origin" // fine to have allow-same-origin because we dont have js execution (allow-scripts)
        }
        title={artifact.name}
        onLoad={handleIframeLoad}
      />
      <ArtifactActions
        copyTooltip="Copy HTML to clipboard"
        createTooltip="Create widget from HTML"
        copyTestId="copy-html-button"
        createTestId="create-widget-from-html-button"
        onFullscreen={() => setIsFullscreenOpen(true)}
        onCopy={() => {
          navigator.clipboard
            .writeText(artifact.content)
            .then(() => toast.success("HTML copied to clipboard"))
            .catch((err) =>
              toast.error("Failed to copy HTML to clipboard", {
                description: err.message,
              }),
            );
        }}
        createWidgetParams={{
          widgetType: "html",
          content: artifact.content,
          metadata: {
            uuid: artifact.uuid,
            name: artifact.name,
            description: artifact.description,
          },
        }}
      />
      <BaseDialog
        open={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        className="!w-[92vw] !max-w-[92vw] !h-[90vh] !max-h-[90vh] !p-0 !gap-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-general-border-secondary shrink-0">
          <DialogTitle>{artifact.name}</DialogTitle>
        </div>
        <iframe
          srcDoc={sanitizedContent}
          className="w-full flex-1 border-0 min-h-0"
          sandbox={
            allowJsExecution ? IFRAME_SRCDOC_SANDBOX_ATTRIBUTES : "allow-same-origin"
          }
          title={`${artifact.name} — full screen`}
        />
      </BaseDialog>
    </div>
  );
});

HTMLArtifact.displayName = "HTMLArtifact";
