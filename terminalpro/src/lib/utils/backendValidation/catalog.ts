import cloneDeep from "lodash/cloneDeep";
import type { $ZodIssue } from "zod/v4/core";
import { isResearchStoryWidget, RESEARCH_STORY_ID } from "~/lib/modeling/storyState";
import type { BackendTemplate } from "~/lib/state/backendConnector";
import { backendTemplateSchema } from "~/lib/types/app";
import { createParamDefs } from "~/lib/utils/widgetParams";
import {
  specificationSchema,
  type UnrecognizedKeysReport,
  type WidgetType,
} from "~/utils/zodForms";

// Snake_case aliases accepted on apps.json templates. Backends following the
// public docs may emit snake_case; we rewrite to camelCase before validation
// so the schema and downstream consumers only see one shape.
const TEMPLATE_KEY_ALIASES: Record<string, string> = {
  mcp_servers: "mcpServers",
};

export function normalizeBackendTemplate(template: unknown) {
  if (!template || typeof template !== "object") return template;
  const obj = template as Record<string, unknown>;
  for (const [from, to] of Object.entries(TEMPLATE_KEY_ALIASES)) {
    if (from in obj && !(to in obj)) {
      obj[to] = obj[from];
      delete obj[from];
    }
  }
  return obj;
}

const isValidWidget = (widget: any): widget is WidgetType => {
  return specificationSchema.safeParse({ data_widget: widget }).success;
};

/**
 * Returns an error message for an invalid object format.
 * This is used when the widgets.json file is not in the expected format.
 * @param object The object to validate.
 * @returns A string error message.
 */
const getInvalidError = (object: unknown): string => {
  const received = JSON.stringify(object, null, 0).slice(0, 38);
  const jsonStart = received.slice(0, 2);
  const suffix = jsonStart === `{"` ? "}" : jsonStart === "[{" ? "}]" : "";

  const error = `\n\n[widgets.json]: Invalid format
  Expected: \`{"table_data": {"name": "Table data", ... }}\`
  Received: \`${received.replace(/[\s\W]$/, "")} ... ${suffix}\``;
  console.error(error);
  return error;
};

export function validateObject(object: object): null | string {
  if (Array.isArray(object) || isValidWidget(object)) return getInvalidError(object);

  // Mutate params in place. `cloneDeep` removed: downstream (`processWorkerResults`)
  // recomputes `widget.params` from scratch anyway, so the mutation is harmless and
  // the clone was the dominant cost for backends with hundreds/thousands of widgets.
  const widgets = object as Record<string, WidgetType>;
  const errors: string[] = [];

  for (const widgetId in widgets) {
    const widget = widgets[widgetId];
    if (widgetId !== RESEARCH_STORY_ID && !isResearchStoryWidget(widget))
      widget.params = createParamDefs(widget);

    const parsedWidget = specificationSchema.safeParse({ [widgetId]: widget });
    const issues = parsedWidget.error?.issues;
    formatZodIssues(issues, errors, widget, widgetId);
  }

  if (import.meta.env.DEV) console.log("Valid widgets.json");

  return errors.length > 0 ? errors.join("\n\n") : null;
}

const expectedRegex = /expected one of (.+) - received (.*)/;
function formatZodIssue(issue: $ZodIssue, widgetId?: string): string {
  //@ts-expect-error
  const { message, path, code, expected = "", input } = issue;
  const cleanedPath = path.filter((p) => p !== widgetId).join(", ") || "object";

  if (code === "invalid_type") return `[${cleanedPath}]: ${message}`;
  if (expected && input) {
    const errorMsg = `\nExpected: \`${expected}\` - Received: \`${input}\``;
    return `[${cleanedPath}]: ${code} ${errorMsg}`;
  }

  let errorMsg = message.replace(expectedRegex, (_, exp: string, rec: string) => {
    const expectedFormatted = exp
      .replace(/"/g, "")
      .split("|")
      .map((e) => e.trim())
      .join("` | `");
    return `\nExpected: \`${expectedFormatted}\`\nReceived: \`${rec}\``;
  });
  if (errorMsg.startsWith("\nExpected:")) {
    errorMsg = `${code} ${errorMsg}`;
  }

  return `[${cleanedPath}]: ${errorMsg}`;
}

export function formatZodIssues(
  issues: $ZodIssue[],
  errors: string[] = [],
  widget?: any,
  widgetId?: string,
) {
  widgetId = widgetId || widget?.widgetId;

  if (issues?.length > 0) {
    const issuesString = issues
      .map((issue) => {
        if (issue.code !== "invalid_union" || issue.inclusive === false)
          return formatZodIssue(issue, widgetId);
        const unionErrors = issue.errors.reduce(
          (acc, unionError) => {
            const curr = Object.fromEntries(
              unionError.map((issue) => [issue.path.join("."), issue]),
            );
            Object.assign(acc, curr);
            return acc;
          },
          {} as Record<string, $ZodIssue>,
        );

        return Object.values(unionErrors)
          .flatMap((issue) => formatZodIssue(issue, widgetId))
          .join(",\n");
      })
      .join(",\n");

    const id = widgetId ? ` (${widgetId})` : "";
    const prefix = widget?.name ? `${widget?.name}${id}:` : "";
    errors.push(`${prefix}\n ${issuesString}`);
  }

  return errors;
}

// Update the validateBackendTemplate function to include template name in errors
export function validateBackendTemplates(templates: BackendTemplate[]): string[] {
  const appEntries = cloneDeep(templates) as BackendTemplate[];
  const errors: string[] = [];

  for (const template of appEntries) {
    // Skip null, undefined, or invalid templates
    if (!template || typeof template !== "object") {
      continue;
    }

    const result = backendTemplateSchema.safeParse(template);
    if (!result.success) {
      const issues = result.error.issues;
      template.name = template.name || "Unknown App";
      formatZodIssues(issues, errors, template);
    }
  }

  return errors;
}

export function validateWidgetsAppsJson(params: {
  templates: BackendTemplate[];
  widgetValidationError: string | null;
  failedEndpoints?: string[];
  unrecognizedReports?: UnrecognizedKeysReport[];
}) {
  const {
    templates,
    widgetValidationError,
    failedEndpoints = [],
    unrecognizedReports = [],
  } = params;

  const templateErrors = validateBackendTemplates(templates);
  const templateErrorMessage =
    templateErrors.length > 0 ? templateErrors.join("\n\n") : null;

  // combine widget validation errors and endpoint errors
  const allWidgetErrors = [];
  if (widgetValidationError) allWidgetErrors.push(widgetValidationError);
  if (failedEndpoints.length > 0) allWidgetErrors.push(...failedEndpoints);

  const errorMessage = allWidgetErrors.length > 0 ? allWidgetErrors.join("\n\n") : null;
  const totalFailed = failedEndpoints.length + templateErrors.length;
  const unrecognizedKeysMessage =
    unrecognizedReports.length > 0 ? unrecognizedReports : null;

  return {
    errorMessage,
    templateErrorMessage,
    unrecognizedKeysMessage,
    totalFailed,
    templateErrors,
  };
}
