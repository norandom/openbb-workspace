import type { WidgetT } from "~/components/types";
import {
  cleanSearchParams,
  createURLString,
  createWidgetInitParams,
} from "~/lib/utils/widgetParams";
import type { WidgetsType, WidgetType } from "~/utils/zodForms";
import { isEndpointlessNativeWidget } from "./nativeWidget";

/**
 * Creates the appropriate HTTP method and payload for widget endpoint validation
 */
function createValidationRequest(
  widget: WidgetType,
  initialParams: Record<string, any>,
) {
  // POST widgets that need special handling
  if (widget.type === "omni") {
    return {
      method: "POST",
      body: JSON.stringify({
        prompt: "test validation query",
        ...initialParams,
      }),
      headers: { "Content-Type": "application/json" },
    };
  }

  if (widget.type === "ssrm_table") {
    return {
      method: "POST",
      body: JSON.stringify({
        startRow: 0,
        endRow: 10,
        ...initialParams,
      }),
      headers: { "Content-Type": "application/json" },
    };
  }

  if (widget.type === "multi_file_viewer") {
    return {
      method: "POST",
      body: JSON.stringify({ ...initialParams }),
      headers: { "Content-Type": "application/json" },
    };
  }

  // Default to GET for all other widget types
  return {
    method: "GET",
    headers: {},
  };
}

export async function validateBackendEndpoints(
  widgets: WidgetsType,
  backendUrl: URL,
  headers: Record<string, string>,
  isVendorApp = false,
  signal?: AbortSignal,
) {
  const failedEndpoints: string[] = [];
  for (const widgetId in widgets) {
    const widget = widgets[widgetId];
    if (isEndpointlessNativeWidget(widget)) continue;
    const initialParams = createWidgetInitParams(widget as unknown as WidgetT);

    const url = createURLString(widget.endpoint, backendUrl);
    const validationRequest = createValidationRequest(widget, initialParams);

    let endpoint: string;
    let requestOptions: RequestInit;

    if (validationRequest.method === "POST") {
      // For POST requests, don't add params to URL, they go in the body
      endpoint = url;
      requestOptions = {
        method: "POST",
        headers: {
          ...headers,
          ...validationRequest.headers,
        },
        body: validationRequest.body,
        signal,
      };
    } else {
      // For GET requests, add params to URL as before
      endpoint = cleanSearchParams(url, initialParams);
      requestOptions = {
        method: "GET",
        headers: {
          ...headers,
          ...validationRequest.headers,
        },
        signal,
      };
    }

    const endpointRes = await fetch(endpoint, requestOptions).catch(
      (err: Error) =>
        new Response(JSON.stringify({ message: err.message }), {
          status: 500,
          statusText: err.message,
        }),
    );

    if (!endpointRes.ok) {
      if (endpointRes.status === 422 || endpointRes.status === 405) continue;

      const error = await endpointRes.json();
      const errorDetail = error?.detail || error?.message || error?.error || error;
      const errorString = JSON.stringify(errorDetail);

      if (["field required", "missing"].some((e) => errorString.includes(e))) continue;

      failedEndpoints.push(`Widget: ${widgetId} - ${errorString}`);
    }

    if (isVendorApp) break; // for vendor apps, only validate the first widget to avoid excessive requests
  }

  return failedEndpoints;
}
