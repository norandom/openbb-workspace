import type {
  BackendAgent,
  BackendTemplate,
  Source,
} from "~/lib/state/backendConnector";
import { KNOWN_TEMPLATE_KEYS } from "~/lib/types/app";
import { createURL } from "~/lib/utils/widgetParams";
import {
  detectUnrecognizedKeys,
  type UnrecognizedKeysReport,
  type WidgetsType,
} from "~/utils/zodForms";
import type { GetApiSourceWidgetsOptions } from "../validateBackend";
import { normalizeBackendTemplate } from "./catalog";
export async function discoverBackendMetadata(
  options: GetApiSourceWidgetsOptions,
  backendUrl: URL,
  newParams: Record<string, string>,
  reqInit: RequestInit,
  widgets: WidgetsType,
  widgetValidationError: string | null,
  unrecognizedReports: UnrecognizedKeysReport[],
) {
  let templates: BackendTemplate[] = [];
  let agents: BackendAgent[] = [];
  let schemas: Source["schemas"];
  let semanticViews: Source["semanticViews"];

  const getPromise = async (fn: () => Promise<Response>, enabled: boolean) => {
    if (!enabled) return Promise.resolve({ ok: false } as Response);
    return fn().catch(() => ({ ok: false }) as Response);
  };

  // After widgets validated, fire apps + agents in parallel (independent of each other).
  const appsPromise = getPromise(async () => {
    const appsUrl = createURL("apps.json", backendUrl, newParams);
    const templatesUrl = createURL("templates.json", backendUrl, newParams);
    return fetch(appsUrl, reqInit).then((res) =>
      res.ok ? res : fetch(templatesUrl, reqInit),
    );
  }, options.apps);

  const agentsPromise = getPromise(async () => {
    const agentsUrl = createURL("agents.json", backendUrl);
    return fetch(agentsUrl, reqInit);
  }, options.agents);

  if (options.apps) {
    const tempsRes = await appsPromise;

    if (tempsRes.ok) {
      const fileName = tempsRes.url?.endsWith("apps.json")
        ? "apps.json"
        : "templates.json";
      const data = await tempsRes.json().catch(() => []);
      // Handle different response types properly:
      // - [] (empty array) -> []
      // - {} (empty object) -> [] (treat as no templates)
      // - undefined/null -> []
      // - [template1, template2] -> [template1, template2]
      // - {valid template object} -> [{valid template object}]
      if (Array.isArray(data)) {
        templates = data;
      } else if (data && typeof data === "object" && Object.keys(data).length > 0) {
        templates = [data];
      } else {
        templates = []; // Handle empty object {}, null, undefined, etc.
      }

      for (const t of templates) normalizeBackendTemplate(t);

      const report = detectUnrecognizedKeys(
        `[${fileName}]`,
        templates,
        KNOWN_TEMPLATE_KEYS,
      );
      if (report) unrecognizedReports.push(report);
    }
  }

  if (options.agents) {
    const agentsRes = await agentsPromise;

    if (agentsRes.ok) {
      const data = await agentsRes.json().catch(() => []);
      if (Array.isArray(data)) {
        agents = data.filter(
          (agent: unknown) =>
            agent && typeof agent === "object" && "id" in agent && "name" in agent,
        ) as BackendAgent[];
      }
    }
  }

  const hasSSRM =
    !widgetValidationError &&
    Object.values(widgets || {}).some((w) => w.type === "ssrm_advanced");

  // Database-only endpoints — fired in parallel after widgets parse confirms SSRM.
  if (hasSSRM && (options.schemas || options.semanticViews)) {
    const schemasReq = getPromise(
      () => fetch(createURL("table-schemas", backendUrl, newParams), reqInit),
      options.schemas,
    );

    const semanticViewsReq = getPromise(
      () => fetch(createURL("semantic-views", backendUrl, newParams), reqInit),
      options.semanticViews,
    );

    const [schemasRes, semanticViewsRes] = await Promise.all([
      schemasReq,
      semanticViewsReq,
    ]);

    if (schemasRes.ok) {
      schemas = await schemasRes.json().catch(() => undefined);
    }
    if (semanticViewsRes.ok) {
      semanticViews = await semanticViewsRes.json().catch(() => undefined);
    }
  }

  return { templates, agents, schemas, semanticViews };
}
