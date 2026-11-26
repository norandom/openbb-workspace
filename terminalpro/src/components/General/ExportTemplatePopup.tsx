import { ResearchTemplateError } from "~/lib/utils/researchTemplateState";
import { formatDashboardDataForTemplate as formatTemplate } from "~/lib/utils/exportTemplate";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { AppTemplate } from "~/components/LayoutAuth/AppCard/types";
import { useShallowAppStore } from "~/lib/state/app";
import {
  type BackendTemplate,
  useBackendConnectorStore,
  useShallowBackendConnectorStore,
} from "~/lib/state/backendConnector";
import { useTemplateExportStore } from "~/lib/state/exportTemplate";
import { slugify } from "~/lib/utils";
import { extractCustomTemplateInfo } from "~/lib/utils/createTemplates";
import { useGetWidgetsStore } from "../AI/hooks/useGetAppWidgets";
import { Button } from "../ds/atoms/Button";
import { DialogFooter } from "../ds/dialogs/Dialog";
import Icon from "../Icon";
import Tooltip from "../Tooltip";
import { AppDialogShell } from "./AppDialog/AppDialogShell";
import { type AppMetadataForm, appMetadataObjectSchema } from "./AppDialog/schema";

export default function ExportTemplatePopup() {
  const dashboardId = useTemplateExportStore((state) => state.dashboardId);
  const getSourceById = useShallowBackendConnectorStore(
    (state) => state.getApiSourceById,
  );

  const currentDashboardData = useShallowAppStore((state) =>
    dashboardId === null ? undefined : state.items?.[dashboardId]?.data,
  );
  const hasDashboardData = currentDashboardData !== undefined;

  const form = useForm<AppMetadataForm>({
    resolver: zodResolver(appMetadataObjectSchema),
    defaultValues: {
      name: "",
      description: "",
      imageUrl: "",
      prompts: [],
    },
  });

  const { replace } = useFieldArray({
    control: form.control,
    name: "prompts",
  });

  useEffect(() => {
    if (!currentDashboardData) {
      form.reset({ name: "", description: "", imageUrl: "", prompts: [] });
      replace([]);
      return;
    }

    const sourceInfo = extractCustomTemplateInfo(currentDashboardData?.templateId);
    if (sourceInfo?.sourceId && sourceInfo?.templateName) {
      const { sourceId, templateName } = sourceInfo;
      const template = getSourceById(sourceId)?.templates?.find(
        (t) => slugify(t.name) === templateName,
      );

      form.reset({
        name: template?.name || "",
        description: template?.description || "",
        imageUrl: template?.img || "",
        prompts: [],
      });
      replace((template?.prompts ?? []).map((value) => ({ value })));
    } else {
      form.reset({ name: "", description: "", imageUrl: "", prompts: [] });
      replace([]);
    }
  }, [dashboardId, hasDashboardData]);

  const handleClose = useCallback(() => {
    const exportState = useTemplateExportStore.getState();
    if (exportState.dashboardId === dashboardId) exportState.setDashboardId(null);
  }, [dashboardId]);

  const onSubmit = useCallback(
    (data: AppMetadataForm) => {
      if (!currentDashboardData) {
        toast.error("No dashboard data available to create a template.");
        return;
      }

      const formattedData = formatDashboardDataForTemplate(currentDashboardData, data);
      if (!formattedData) return;
      saveTemplate(formattedData);
      handleClose();
    },
    [currentDashboardData, handleClose],
  );

  const handleCopyToClipboard = useCallback(
    async (event: ReactMouseEvent) => {
      event.preventDefault();

      const isValid = await form.trigger();
      if (!isValid) return;

      const formData = form.getValues();
      if (!currentDashboardData) {
        toast.error("No dashboard data available to create a template.");
        return;
      }

      const formattedData = formatDashboardDataForTemplate(
        currentDashboardData,
        formData,
      );
      if (!formattedData) return;
      const jsonData = JSON.stringify(formattedData, null, 2);

      try {
        await navigator.clipboard.writeText(jsonData);
        toast.success("App copied to clipboard!");
        handleClose();
      } catch (error) {
        console.error("Failed to copy app to clipboard:", error);
        toast.error("Failed to copy app to clipboard");
      }
    },
    [currentDashboardData, form, handleClose],
  );

  const previewWidgets = useMemo<AppTemplate["widgets"]>(
    () => (currentDashboardData?.widgets ?? []) as AppTemplate["widgets"],
    [currentDashboardData],
  );

  const footer = (
    <DialogFooter className="pt-4">
      <Button variant="outlined" type="button" size="sm" onClick={handleClose}>
        Cancel
      </Button>
      <Tooltip message="Copy template to clipboard">
        <Button
          type="button"
          variant="outlined"
          size="sm"
          onClick={handleCopyToClipboard}
          className="flex items-center gap-1"
        >
          <Icon id="clipboard-icon" className="size-3.5" />
          Copy
        </Button>
      </Tooltip>
      <Button type="submit" size="sm">
        Download App
      </Button>
    </DialogFooter>
  );

  return (
    <AppDialogShell
      open={dashboardId !== null}
      onClose={handleClose}
      title="Export App"
      form={form}
      onSubmit={onSubmit}
      previewWidgets={previewWidgets}
      footer={footer}
    />
  );
}

function saveTemplate(templateData: BackendTemplate) {
  const jsonData = JSON.stringify(templateData, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${templateData.name.toLowerCase().replace(/\s+/g, "_")}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast.success("App downloaded successfully!");
}

function formatDashboardDataForTemplate(
  dashboardData: Parameters<typeof formatTemplate>[0],
  formData: AppMetadataForm,
) {
  try {
    return formatTemplate(dashboardData, formData, {
      getAppWidget: useGetWidgetsStore.getState().getAppWidget,
      getSourceById: useBackendConnectorStore.getState().getApiSourceById,
    });
  } catch (error) {
    if (!(error instanceof ResearchTemplateError)) throw error;
    toast.error(
      "Saved company identity does not match this widget's symbol. Reselect the company before exporting.",
    );
    return null;
  }
}
