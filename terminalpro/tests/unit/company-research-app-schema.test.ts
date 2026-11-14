import { describe, expect, it } from "vitest";
import {
  ExternalWidgetSchema,
  InternalWidgetSchema,
  isWidgetVizType,
  WidgetVizTypes,
  widgetTypesSchema,
} from "~/lib/types/app";

import research from "../fixtures/company-research-widget.json";

describe("company research runtime schema admission", () => {
  it("admits the actual endpointless catalog renderer into both runtime schemas", () => {
    expect(research).toMatchObject({ type: "company_research", params: [] });
    expect(research).not.toHaveProperty("endpoint");
    expect(WidgetVizTypes).toContain(research.type);
    expect(widgetTypesSchema.parse(research.type)).toBe("company_research");
    expect(isWidgetVizType(research.type)).toBe(true);
    for (const schema of [InternalWidgetSchema, ExternalWidgetSchema]) {
      const result = schema.parse({ ...research, id: "research-runtime" });
      expect(result.type).toBe("company_research");
      expect(result.widgetId).toBe("company_research");
      expect(result).not.toHaveProperty("endpoint");
    }
  });

  it("keeps unknown renderer rejection and note normalization", () => {
    expect(widgetTypesSchema.safeParse("unknown_research").success).toBe(false);
    expect(isWidgetVizType("unknown_research")).toBe(false);
    expect(widgetTypesSchema.parse("note")).toBe("rich_note");
    for (const schema of [InternalWidgetSchema, ExternalWidgetSchema]) {
      expect(
        schema.safeParse({ ...research, id: "bad", type: "unknown_research" }).success,
      ).toBe(false);
    }
  });

  it("preserves ordinary runtime endpoint optionality and validates supplied endpoints", () => {
    const table = { id: "table", widgetId: "table", type: "table" };
    expect(ExternalWidgetSchema.safeParse(table).success).toBe(true);
    const endpoint = { url: "/data", method: "GET" };
    expect(ExternalWidgetSchema.parse({ ...table, endpoint }).endpoint).toEqual(
      endpoint,
    );
    for (const type of ["table", "company_research"]) {
      expect(
        ExternalWidgetSchema.safeParse({ ...table, type, endpoint: "/data" }).success,
      ).toBe(false);
      expect(
        ExternalWidgetSchema.safeParse({
          ...table,
          type,
          endpoint: { url: "/data", method: "DELETE" },
        }).success,
      ).toBe(false);
    }
  });
});
