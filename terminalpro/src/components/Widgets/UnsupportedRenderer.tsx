import { type ComponentType, createElement } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { unsupportedTableReason } from "../General/Table/communityBoundary";

export default function UnsupportedRenderer({
  reason = "this legacy renderer",
}: {
  reason?: string;
}) {
  return (
    <div role="status" className="flex h-full items-center justify-center p-4 text-sm">
      <p>This view is unavailable: {reason}. The saved configuration is preserved.</p>
    </div>
  );
}

export function communityWidget(
  Component: ComponentType<any>,
  unavailable?: string | ((widget: any) => string | undefined),
) {
  return function CommunityWidget(props: any) {
    const { widget } = useWidgetContext();
    const reason =
      (typeof unavailable === "function" ? unavailable(widget) : unavailable) ??
      unsupportedTableReason(widget?.storage) ??
      unsupportedTableReason(widget?.data?.table);
    return reason ? (
      <UnsupportedRenderer reason={reason} />
    ) : (
      createElement(Component, props)
    );
  };
}
