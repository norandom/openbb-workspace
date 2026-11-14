import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import generatedSchema from "~/components/DataConnectors/WidgetsBuilder/widget-schema.json";
import {
  processWorkerResults,
  validateBackendEndpoints,
  validateObject,
  validateSource,
} from "~/lib/utils/validateBackend";
import { specificationSchema } from "~/utils/zodForms";
import native from "../fixtures/company-research-widget.json";

const primary = {
  name: "Primary",
  description: "Primary financial data",
  type: "table",
  endpoint: "/primary",
};
const catalog = { company_research: native, primary };

afterEach(() => vi.unstubAllGlobals());
describe("generated company research catalog admission", () => {
  it("admits the exact generated catalog without adding an endpoint", () => {
    expect(native.type).toBe("company_research");
    expect(native).not.toHaveProperty("endpoint");
    expect(specificationSchema.safeParse(catalog).success).toBe(true);
    expect(validateObject(structuredClone(catalog))).toBeNull();
  });
  it("generates the editor schema from the runtime contract", () => {
    expect(generatedSchema).toEqual(
      z.toJSONSchema(specificationSchema, {
        reused: "inline",
        target: "draft-7",
        io: "input",
      }),
    );
    const branches = generatedSchema.definitions.Widget.anyOf;
    expect(branches[0].required).toContain("endpoint");
    expect(branches[1].required).not.toContain("endpoint");
    expect(branches[1].properties.type.const).toBe("company_research");
  });
  it("keeps endpoint and renderer validation closed", () => {
    for (const widget of [
      { ...native, type: "table" },
      { ...native, type: "unregistered_renderer" },
      { ...native, endpoint: 12 },
    ]) {
      expect(specificationSchema.safeParse({ invalid: widget }).success).toBe(false);
    }
  });
  it("skips only endpointless native widgets and probes ordinary endpoints", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await validateBackendEndpoints(
      {
        native,
        ordinary: {
          name: "ordinary",
          description: "test",
          type: "table",
          endpoint: "/ordinary",
        },
        nativeHttp: { ...native, endpoint: "/native-http" },
      } as any,
      new URL("https://backend.test"),
      {},
    );
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://backend.test/ordinary",
      "https://backend.test/native-http",
    ]);
  });
  it("accepts the generated catalog through the real connector", async () => {
    const app = {
      name: "Company research",
      description: "Research",
      tabs: {
        research: {
          id: "research",
          name: "Research",
          layout: [
            { i: "company_research", x: 0, y: 0, w: 20, h: 20 },
            { i: "primary", x: 20, y: 0, w: 20, h: 20 },
          ],
        },
      },
    };
    const fetch = vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(String(url).endsWith("widgets.json") ? catalog : [app]),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await validateSource(
      {
        name: "Research",
        id: "research",
        url: "https://backend.test",
        endpointHeaders: [],
      },
      { agents: false, validateAllWidgets: false },
    );
    expect(result.errorMessage).toBeNull();
    expect(result.widgets.company_research).toEqual(native);
    expect(Object.keys(result.widgets)).toEqual(Object.keys(catalog));
    expect(result.templateErrorMessage).toBeNull();
    expect(result.templateWarningMessage).toBeUndefined();
    expect(result.templates).toEqual([app]);
    const projected = processWorkerResults([
      {
        source: {
          name: "Research",
          id: "research",
          url: "https://backend.test",
          endpointHeaders: [],
        },
        result,
      },
    ]);
    expect(projected.apiSources[0].status).toBe("success");
    expect(projected.apiSources[0].widgets.company_research.type).toBe(
      "company_research",
    );
  });
});
