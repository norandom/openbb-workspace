import { create } from "zustand";

type TemplateExportState = {
  dashboardId: string | null;
  setDashboardId: (dashboardId: string | null) => void;
};

export const useTemplateExportStore = create<TemplateExportState>((set) => ({
  dashboardId: null,
  setDashboardId: (dashboardId) => set({ dashboardId }),
}));
