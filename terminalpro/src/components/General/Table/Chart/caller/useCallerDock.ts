import { useRef, useState } from "react";
import { useWidgetContext } from "~/components/Widget.context";
import { getStateKey } from "../../communityState";
import { isHierarchyChartFamily } from "../application/applicationSessionGuards";
import {
  type ApplicationChartFamily,
  isComboChartFamily,
} from "../application/comboSessionTypes";
import { isPieChartFamily } from "../application/pieSessionTypes";
import { isRangeChartFamily } from "../application/rangeSessionTypes";
import { isXyChartFamily } from "../application/xySessionTypes";
import { isFunnelFamily } from "../compatibility/funnelContracts";
import { isCartesianFamily } from "../echarts/cartesianTypes";
import type { ChartEditorTab } from "../editor/ChartEditorDock";
import { chartTypeGalleryGroups } from "../editor/chartTypeGalleryCatalog";
import { changeCallerChartType } from "./chartInputs";
export function useCallerDock(
  chartType: string | undefined,
  onSelect?: (type: ApplicationChartFamily) => void,
  hasCustomCombo = false,
) {
  const { widget, updateWidget } = useWidgetContext();
  // Family reprojection remounts the editor; its navigation position stays local.
  const galleryScroll = useRef(0);
  const [activeTab, onTabChange] = useState<ChartEditorTab>("chart");
  const onOpenChange = (open: boolean) =>
    updateWidget?.((previous) => ({
      ...previous,
      storage: { ...previous.storage, chartSettingsOpen: open },
    }));
  const model =
    widget.storage?.[getStateKey(widget)]?.chartModel ?? widget.storage?.chartModel;
  const groups =
    hasCustomCombo || model?.seriesChartTypes?.length
      ? chartTypeGalleryGroups.map((group) =>
          group.name === "Combination"
            ? {
                ...group,
                items: [
                  ...group.items,
                  { modelType: "customCombo", name: "Custom Combination" },
                ],
              }
            : group,
        )
      : chartTypeGalleryGroups;
  return {
    open: Boolean(widget.storage?.chartSettingsOpen),
    activeTab,
    onTabChange,
    onOpenChange,
    themeResetKey: chartType ?? "pending",
    galleryProps: {
      scrollPositionRef: galleryScroll,
      groups,
      selectedType: chartType,
      onSelect: (type: string) => {
        if (
          onSelect &&
          (isFunnelFamily(type) ||
            isHierarchyChartFamily(type) ||
            isPieChartFamily(type) ||
            isCartesianFamily(type) ||
            isComboChartFamily(type) ||
            isXyChartFamily(type) ||
            type === "heatmap" ||
            type === "histogram" ||
            type === "boxPlot" ||
            type === "waterfall" ||
            isRangeChartFamily(type))
        )
          onSelect(type);
        else updateWidget?.((previous) => changeCallerChartType(previous, type));
      },
    },
  };
}
