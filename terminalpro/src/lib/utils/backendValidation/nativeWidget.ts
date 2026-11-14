import { widgetSchema } from "~/utils/zodForms";

/** Native research owns its HTTP requests through the authenticated research adapter. */
export function isEndpointlessNativeWidget(widget: {
  type?: string;
  endpoint?: unknown;
}) {
  return (
    widget.type === "company_research" &&
    widget.endpoint === undefined &&
    widgetSchema.safeParse(widget).success
  );
}
