import type { Source, ValidateBackend } from "~/lib/state/backendConnector";
import { createParamDefs } from "~/lib/utils/widgetParams";
import { EVENTS_DOCUMENTS_STORY_ID } from "~/utils/nativeStorySchema";
import type { UnrecognizedKeysReport } from "~/utils/zodForms";
import { filterRejectedStoryCatalog } from "./nativeWidget";

function appendWorkerWarnings(
  acc: {
    toastErrors: { source: { name: string; id: string }; message: string }[];
    unrecognizedKeysMessages: {
      source: { name: string; id: string };
      reports: UnrecognizedKeysReport[];
    }[];
  },
  apiSource: Source,
  result: ValidateBackend,
  partial: boolean,
) {
  const { templateWarningMessage, unrecognizedKeysMessage } = result;
  if (!partial && templateWarningMessage) {
    acc.toastErrors.push({
      source: { name: apiSource.name, id: apiSource.id },
      message: templateWarningMessage,
    });
  }

  const isPublishedMarketplaceApp =
    apiSource.vendorApp && !apiSource.vendorApp?.isDevelopment;
  if (!partial && unrecognizedKeysMessage && !isPublishedMarketplaceApp) {
    acc.unrecognizedKeysMessages.push({
      source: { name: apiSource.name, id: apiSource.id },
      reports: unrecognizedKeysMessage,
    });
  }
}

function handleVendorAppSource(source: Source) {
  const vendorApp = source.vendorApp;
  source.vendorAppUuid = vendorApp?.uuid;

  if (vendorApp && source.status === "error") {
    source.widgets = vendorApp?.widgetsJsonCache || {};
    source.templates = vendorApp?.appsJsonCache || [];
  }

  source.hasApiKey = source.endpointHeaders?.some(
    (h) => h.key.toLowerCase() === "authorization" && h.value.startsWith("Bearer "),
  );
  return filterRejectedStoryCatalog(source);
}

export function processWorkerResults(
  results: { source: Source; result: ValidateBackend }[],
  partial = false,
) {
  return results.reduce(
    (acc, cur) => {
      const { source: apiSource, result } = cur;

      try {
        if (result.errorMessage) {
          apiSource.status = "error";
          acc.apiSources.push(handleVendorAppSource({ ...apiSource }));
          return acc;
        }

        const {
          widgets,
          errorMessage,
          templateWarningMessage,
          unrecognizedKeysMessage,
          templates,
          schemas,
          semanticViews,
          agents,
        } = result;
        if (semanticViews) acc.semanticViews = semanticViews;

        appendWorkerWarnings(acc, apiSource, result, partial);

        if (errorMessage) {
          console.error(errorMessage);
          apiSource.status = "error";
          acc.apiSources.push(handleVendorAppSource({ ...apiSource }));
          return acc;
        }

        apiSource.widgets = Object.fromEntries(Object.entries(widgets).map(([key, widget]) => {
          if (key === EVENTS_DOCUMENTS_STORY_ID) return [key, widget];
          widget.params = createParamDefs(widget, apiSource.url);
          const subCategory = widget.sub_category ?? widget.subCategory;

          return [key, {
            ...widget,
            widgetId: key,
            subCategory,
            endpointHeaders: apiSource.endpointHeaders,
          }];
        }));

        acc.apiSources.push({
          ...apiSource,
          templates,
          schemas,
          semanticViews,
          agents,
          status: "success",
        });
        return acc;
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        acc.apiSources.push(handleVendorAppSource({ ...apiSource }));
        return acc;
      }
    },
    {
      apiSources: [] as Source[],
      semanticViews: null as Source["semanticViews"] | null,
      toastErrors: [] as {
        source: { name: string; id: string };
        message: string;
      }[],
      unrecognizedKeysMessages: [] as {
        source: { name: string; id: string };
        reports: UnrecognizedKeysReport[];
      }[],
      __partial: partial,
    },
  );
}

export type WorkerResult = ReturnType<typeof processWorkerResults>;
