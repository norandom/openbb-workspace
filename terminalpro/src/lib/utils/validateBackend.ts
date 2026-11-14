import cloneDeep from "lodash/cloneDeep";
import type { WidgetT } from "~/components/types";
import type {
  BackendAgent,
  BackendTemplate,
  Source,
  ValidateBackend,
} from "~/lib/state/backendConnector";
import {
  convertHeadersToRecord,
  createURL,
  createURLString,
} from "~/lib/utils/widgetParams";
import WIDGETS from "~/lib/widgets.json";
import {
  detectUnrecognizedKeys,
  KNOWN_WIDGET_KEYS,
  type UnrecognizedKeysReport,
  type WidgetsType,
} from "~/utils/zodForms";
import { validateObject, validateWidgetsAppsJson } from "./backendValidation/catalog";
import { discoverBackendMetadata } from "./backendValidation/discovery";
import { validateBackendEndpoints } from "./backendValidation/endpoints";
import { fetchWidgetCatalog } from "./backendValidation/transport";
import { validateVendorCache } from "./backendValidation/vendorCache";

export { formatZodIssues, validateObject } from "./backendValidation/catalog";
export { validateBackendEndpoints } from "./backendValidation/endpoints";
export {
  processWorkerResults,
  type WorkerResult,
} from "./backendValidation/worker";

const errorResponse = {
  widgets: {},
  errorMessage: null,
  templates: [] as BackendTemplate[],
  agents: [] as BackendAgent[],
  totalFailed: 1,
  templateErrorMessage: null,
  templateWarningMessage: null,
  unrecognizedKeysMessage: null,
  isOpenBBPlatform: null,
} satisfies ValidateBackend;

const DEFAULT_OPTIONS = {
  validateAllWidgets: false,
  vendorAppCache: false,
  agents: true,
  apps: true,
  schemas: true,
  semanticViews: true,
  extraHeaders: {} as Record<string, string>,
};

export type GetApiSourceWidgetsOptions = Partial<typeof DEFAULT_OPTIONS>;

function parseOptions(
  options?: GetApiSourceWidgetsOptions | boolean,
): GetApiSourceWidgetsOptions {
  if (typeof options === "boolean") {
    return {
      ...DEFAULT_OPTIONS,
      validateAllWidgets: options,
    };
  }

  return { ...DEFAULT_OPTIONS, ...(options || {}) };
}

// Modify the validateBackend function to include template validation
export async function validateBackend(
  source: Source,
  options?: GetApiSourceWidgetsOptions | boolean,
) {
  options = parseOptions(options);
  const isVendorApp = !!(source.vendorAppUuid || source.vendorApp);

  if (isVendorApp && !options.validateAllWidgets && options.vendorAppCache) {
    return validateVendorCache(source);
  }

  // 60s timeout when you connect - in the future we can do something else here -
  // let user set it or turn off for on prem?
  const requestTimeout = 60000;
  const { headers, newParams } = convertHeadersToRecord(source.endpointHeaders);

  Object.assign(headers, options.extraHeaders || {}); // Merge extra headers into the main headers object

  const backendUrl = createURL(source.url);
  const widgetsUrl = createURL("widgets.json", backendUrl, newParams);
  const reqInit = { headers, signal: AbortSignal.timeout(requestTimeout) };

  const widgetsRes = await fetchWidgetCatalog(widgetsUrl, reqInit);

  // Detect unrecognized keys — widget check is gated behind successful
  // validation (malformed data would produce noisy warnings), while the
  // template check runs independently since templates have their own pipeline.
  const unrecognizedReports = [] as UnrecognizedKeysReport[];

  const widgets = (await widgetsRes.json()) as WidgetsType;
  const isOpenBBPlatform =
    widgetsRes.headers.get("X-Backend-Type") === "OpenBB Platform";
  const widgetValidationError = validateObject(widgets);

  if (!widgetValidationError) {
    const report = detectUnrecognizedKeys(
      "[widgets.json]",
      Object.values(widgets),
      KNOWN_WIDGET_KEYS,
    );
    if (report) unrecognizedReports.push(report);
  }
  // don't early return here - continue to check templates even if widgets have errors,
  // this is so we can still show the user the apps they have and the errors they have
  let failedEndpoints = [];
  if (options.validateAllWidgets && !widgetValidationError) {
    failedEndpoints = await validateBackendEndpoints(
      widgets,
      backendUrl,
      headers,
      isVendorApp,
      reqInit.signal,
    );
  }

  const { templates, agents, schemas, semanticViews } = await discoverBackendMetadata(
    options,
    backendUrl,
    newParams,
    reqInit,
    widgets,
    widgetValidationError,
    unrecognizedReports,
  );

  const jsonErrors = validateWidgetsAppsJson({
    templates,
    widgetValidationError,
    failedEndpoints,
    unrecognizedReports,
  });

  return {
    widgets: widgetValidationError ? {} : widgets, // return empty widgets if validation failed
    ...jsonErrors,
    templates: jsonErrors.templateErrors.length > 0 ? [] : templates, // return empty templates if validation failed
    agents,
    schemas,
    semanticViews,
    isOpenBBPlatform,
  } as ValidateBackend;
}

export function getJsonWidget(widget: string | Partial<WidgetT>): WidgetT | null {
  if (typeof widget === "string") {
    widget = WIDGETS[widget] as Partial<WidgetT>;
    if (!widget) return null;
  }

  return cloneDeep({ ...(WIDGETS[widget?.widgetId] ?? widget) });
}

export async function validateSource(
  source: Source,
  options?: GetApiSourceWidgetsOptions | boolean,
) {
  const validated = await validateBackend(source, options).catch(
    (e) => ({ ...errorResponse, errorMessage: e.message }) as ValidateBackend,
  );

  if (!validated.templates.length || validated.errorMessage) return validated;

  const tabWidgets = {} as { [appName: string]: { [tabId: string]: string[] } };
  const vendorApp = source.vendorApp;
  const isSingleTemplate = validated.templates.length === 1;

  for (const t of validated.templates) {
    if (vendorApp && isSingleTemplate) t.name = vendorApp.name;

    for (const tab of Object.values(t.tabs || {})) {
      for (const layout of tab.layout || []) {
        const widgetId = layout.i;
        if (getJsonWidget(widgetId)?.name) continue; // skip if it's a built-in widget

        if (!tabWidgets[t.name]) tabWidgets[t.name] = {};
        if (!tabWidgets[t.name][tab.id]) tabWidgets[t.name][tab.id] = [];
        tabWidgets[t.name][tab.id].push(widgetId);
      }
    }
  }

  // check for widgets used in apps that are missing from the backend widgets
  for (const [appName, item] of Object.entries(tabWidgets)) {
    for (const [tabId, widgetIds] of Object.entries(item)) {
      const missingWidgetIds = widgetIds.filter((id) => !validated.widgets[id]);
      if (missingWidgetIds.length === 0) continue;

      const errors = [
        `${appName} (tab: ${tabId}):`,
        `[widgets.json]: Missing widgets used in tab \`${missingWidgetIds.join("`, `")}\``,
      ];

      validated.templateWarningMessage = validated.templateWarningMessage || "";
      validated.templateWarningMessage += `\n\n${errors.join("\n")}`;
    }
  }

  return validated;
}

function slugify(str: string, separator = "-") {
  if (!str) return "";
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s/g, separator)
    .replace(/\n/g, separator)
    .replace(/[^\w-]+/g, "");
}

export async function getApiSourceWidgets(
  source: Source,
  options?: GetApiSourceWidgetsOptions | boolean,
) {
  const validated = await validateSource(source, options);

  if (validated.templates.length > 0) {
    // do some validation here
    validated.templates = validated.templates.map((template) => {
      template.id = `custom-${source.id ?? source.uuid}-${slugify(template.name)}`;
      template.templateId = template.templateId || template.id;
      // handle relative URLs for images
      for (const img_key of ["img", "img_dark", "img_light"]) {
        if (!template[img_key]) continue;
        template[img_key] = createURLString(template[img_key], source.url);
      }
      return template;
    });
  }

  return validated;
}
