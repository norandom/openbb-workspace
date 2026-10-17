import { useLayoutEffect, useRef, type ReactElement, type RefObject } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../ds/molecules/Tabs";
import { ChartTypeGallery, type ChartTypeGalleryProps } from "./ChartTypeGallery";
import "./chartEditorDock.css";

export type ChartEditorTab = "chart" | "setup" | "customize";
export interface ChartEditorDockProps {
  open: boolean;
  activeTab: ChartEditorTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: ChartEditorTab) => void;
  galleryProps: ChartTypeGalleryProps;
  setup: ReactElement;
  customize: ReactElement;
  themeResetKey: string | number;
  openerRef?: RefObject<HTMLElement | null>;
}

const tabs = [["chart", "Chart"], ["setup", "Set Up"], ["customize", "Customize"]] as const;

export function ChartEditorDock(props: ChartEditorDockProps) {
  const { open, activeTab, onOpenChange, onTabChange, galleryProps, setup, customize, themeResetKey, openerRef } = props;
  const dock = useRef<HTMLElement>(null);
  const wasOpen = useRef(open);
  const selectedTab = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (open && !wasOpen.current) selectedTab.current?.focus();
    if (!open && wasOpen.current && dock.current?.contains(document.activeElement)) openerRef?.current?.focus();
    wasOpen.current = open;
  }, [open, openerRef]);
  return (
    <aside ref={dock} hidden={!open} className="chart-editor-dock" aria-label="Chart editor">
      <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as ChartEditorTab)} className="chart-editor-dock-tabs">
        <div className="chart-editor-dock-header">
          <button type="button" className="chart-editor-dock-collapse" aria-label="Collapse chart editor" onClick={() => onOpenChange(false)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="m4.5 2.5 3.5 3.5-3.5 3.5" fill="none" stroke="currentColor" /></svg>
          </button>
          <TabsList aria-label="Chart editor sections">
            {tabs.map(([value, label]) => <TabsTrigger key={value} value={value} ref={activeTab === value ? selectedTab : undefined}>{label}</TabsTrigger>)}
          </TabsList>

        </div>
        <TabsContent value="chart" forceMount hidden={activeTab !== "chart"} className="chart-editor-dock-panel">
          <ChartTypeGallery {...galleryProps} />
        </TabsContent>
        <TabsContent value="setup" forceMount hidden={activeTab !== "setup"} className="chart-editor-dock-panel">{setup}</TabsContent>
        <TabsContent value="customize" forceMount hidden={activeTab !== "customize"} className="chart-editor-dock-panel">
          {activeTab === "customize" && <div key={themeResetKey}>{customize}</div>}
        </TabsContent>
      </Tabs>
    </aside>
  );
}
