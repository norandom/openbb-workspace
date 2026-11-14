import type { Source, ValidateBackend } from "~/lib/state/backendConnector";
import {
  detectUnrecognizedKeys,
  KNOWN_WIDGET_KEYS,
  type UnrecognizedKeysReport,
} from "~/utils/zodForms";
import {
  normalizeBackendTemplate,
  validateObject,
  validateWidgetsAppsJson,
} from "./catalog";
export function validateVendorCache(source: Source) {
  const { widgetsJsonCache = {}, appsJsonCache = [] } = source.vendorApp || {};
  const widgetValidationError = validateObject(widgetsJsonCache);
  const unrecognizedReports = [] as UnrecognizedKeysReport[];
  for (const t of appsJsonCache) normalizeBackendTemplate(t);

  if (!widgetValidationError) {
    const report = detectUnrecognizedKeys(
      "[widgets.json]",
      Object.values(widgetsJsonCache),
      KNOWN_WIDGET_KEYS,
    );
    if (report) unrecognizedReports.push(report);
  }

  const jsonErrors = validateWidgetsAppsJson({
    templates: appsJsonCache,
    widgetValidationError,
    unrecognizedReports,
  });

  return {
    widgets: widgetValidationError ? {} : widgetsJsonCache, // return empty widgets if validation failed
    ...jsonErrors,
    templates: jsonErrors.templateErrors.length > 0 ? [] : appsJsonCache, // return empty templates if validation failed
    agents: [], // vendor apps don't have agents
  } as ValidateBackend;
}
