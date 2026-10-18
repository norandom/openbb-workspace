import { waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "~/api/api";
import {
  deleteAllDashboards,
  deleteDashboardShare,
  getDashboardShareUsers,
  getDashboards,
  getOwnedDashboards,
  getSharedDashboardsAndUpdate,
  postDashboards,
  saveDashboards,
  shareDashboard,
} from "~/api/dashboard.api";
import { showNotificationWithRememberMe } from "~/lib/utils/toast";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

// Mock apiClient
vi.mock("~/api/api", () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

// Mock state management functions
vi.mock("~/lib/state/app", () => ({
  useAppStore: {
    getState: vi.fn().mockReturnValue({
      items: {},
      itemsStoredInCloud: {},
      updateItemsStoredInCloud: vi.fn(),
    }),
  },
}));

vi.mock("~/lib/state/auth", () => ({
  useAuthStore: {
    getState: vi.fn().mockReturnValue({
      logout: vi.fn(),
    }),
  },
}));

// Mock useFeatureFlagsStore
vi.mock("~/lib/state/featureFlags", () => ({
  useFeatureFlagsStore: {
    getState: vi.fn().mockReturnValue({
      featureFlags: { tier: "pro" },
    }),
  },
}));

// Mock useSharedAppStore
vi.mock("~/lib/state/sharedApp", () => ({
  useSharedAppStore: {
    getState: vi.fn().mockReturnValue({
      sharedItems: {},
      updateOnlySharedItems: vi.fn(),
    }),
  },
}));

vi.mock("~/lib/utils", () => ({
  diffItemsWithRemote: vi.fn().mockReturnValue({}),
  dispatchSaveState: vi.fn(),
  getValidItems: vi.fn().mockReturnValue({}),
}));

vi.mock("~/lib/utils/toast", () => ({
  showNotificationWithRememberMe: vi.fn(),
  NotificationId: { SaveDashboards: "save-dashboards" },
}));

// // Mock setup for useFeatureFlagsStore
// const mockUseFeatureFlagsStore = (tier: string) => {
//   vi.mock("~/lib/state/featureFlags", () => ({
//     useFeatureFlagsStore: vi.fn(() => ({
//       getState: vi.fn().mockReturnValue({
//         featureFlags: { tier },
//       }),
//     })),
//   }));
// };

// Test suite
describe("Dashboard API functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("postDashboards", () => {
    it("should post dashboards correctly", async () => {
      const dashboardData = { key: "value" };

      vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });

      await postDashboards(dashboardData);

      expect(apiClient.post).toHaveBeenCalledWith("/pro/dash/sync", {
        items: dashboardData,
      });
    });
  });

  it("should get dashboards correctly", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} });

    await getDashboards();
    expect(apiClient.get).toHaveBeenCalledWith("/pro/dash/sync");
  });

  it("should handle errors when getting owned dashboards", async () => {
    vi.spyOn(apiClient, "get").mockRejectedValueOnce(new Error("Network error"));

    const data = await getOwnedDashboards();
    expect(data).toEqual({});
  });

  describe("getSharedDashboardsAndUpdate", () => {
    beforeEach(() => {
      // Clear all mocks before each test to ensure a clean state
      vi.clearAllMocks();
    });

    // The expect condition is not working. Either the mock is not working or the function is not being called.
    it("should update shared dashboards for pro tier", async () => {
      const { useSharedAppStore } = await import("~/lib/state/sharedApp");
      const { useFeatureFlagsStore } = await import("~/lib/state/featureFlags");

      const updateOnlySharedItemsMock = vi.fn();
      vi.mocked(useSharedAppStore.getState).mockReturnValue({
        updateOnlySharedItems: updateOnlySharedItemsMock,
      } as any);

      vi.mocked(useFeatureFlagsStore.getState).mockReturnValue({
        featureFlags: { tier: "pro" },
      } as any);

      // Mock the API call
      vi.spyOn(apiClient, "get").mockResolvedValue({
        data: {
          shared: {
            "55d809ef-19d1-4e63-8dce-ce57f66e5536": {
              creator: false,
              content: {},
            },
          },
          entity_shared: {},
        },
      });

      // Call the function
      await getSharedDashboardsAndUpdate();

      // Assert that updateOnlySharedItems was called
      expect(updateOnlySharedItemsMock).toHaveBeenCalled();
    });

    it("should not update shared dashboards for terminal tier", async () => {
      const { useSharedAppStore } = await import("~/lib/state/sharedApp");
      const { useFeatureFlagsStore } = await import("~/lib/state/featureFlags");

      const updateOnlySharedItemsMock = vi.fn();
      vi.mocked(useSharedAppStore.getState).mockReturnValue({
        updateOnlySharedItems: updateOnlySharedItemsMock,
      } as any);

      // Mock the feature flags to be terminal
      vi.mocked(useFeatureFlagsStore.getState).mockReturnValue({
        featureFlags: { tier: "terminal" },
      } as any);

      // Call the function
      await getSharedDashboardsAndUpdate();

      // Assert that updateOnlySharedItems was not called
      expect(updateOnlySharedItemsMock).not.toHaveBeenCalled();
    });
  });

  it("should save dashboards and show notification", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: {} });
    const { diffItemsWithRemote } = await import("~/lib/utils");
    const { useAppStore } = await import("~/lib/state/app");

    vi.mocked(diffItemsWithRemote).mockReturnValue({ "some-uuid": "NEW" } as any);
    vi.mocked(useAppStore.getState).mockReturnValue({
      items: { "some-uuid": {} },
      itemsStoredInCloud: {},
      updateItemsStoredInCloud: vi.fn(),
    } as any);

    await saveDashboards({ withNotification: true });

    await waitFor(() => {
      expect(showNotificationWithRememberMe).toHaveBeenCalled();
      expect(apiClient.post).toHaveBeenCalled();
    });
  });

  it("retains unsaved edits after a rejected save and saves them on retry", async () => {
    const { diffItemsWithRemote } = await import("~/lib/utils");
    const { useAppStore } = await import("~/lib/state/app");
    const { useAuthStore } = await import("~/lib/state/auth");
    const items = { dashboard: { chart: { title: "Edited chart" } } };
    const cloud = { dashboard: { chart: { title: "Saved chart" } } };
    const updateItemsStoredInCloud = vi.fn();
    const state = { items, itemsStoredInCloud: cloud, updateItemsStoredInCloud };
    vi.mocked(useAppStore.getState).mockReturnValue(state as any);
    vi.mocked(diffItemsWithRemote).mockReturnValue(items as any);
    vi.mocked(apiClient.post)
      .mockRejectedValueOnce(new Error("Request failed with status code 500"))
      .mockResolvedValueOnce({ data: {} });

    await expect(saveDashboards({ withNotification: true })).resolves.toBeUndefined();
    expect(state.items).toEqual(items);
    expect(state.itemsStoredInCloud).toEqual(cloud);
    expect(updateItemsStoredInCloud).not.toHaveBeenCalled();
    expect(showNotificationWithRememberMe).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Unable to save dashboards", {
      description: "Your changes are still available. Try saving again.",
      id: "save-dashboards",
    });
    expect(useAuthStore.getState().logout).not.toHaveBeenCalled();

    await saveDashboards({ withNotification: true });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, "/pro/dash/sync", { items });
    expect(updateItemsStoredInCloud).toHaveBeenCalledExactlyOnceWith(items);
    expect(showNotificationWithRememberMe).toHaveBeenCalledOnce();
  });

  it("waits for persistence before updating the cloud snapshot or reporting success", async () => {
    const { diffItemsWithRemote } = await import("~/lib/utils");
    const { useAppStore } = await import("~/lib/state/app");
    const items = { dashboard: { title: "Edited dashboard" } };
    const updateItemsStoredInCloud = vi.fn();
    vi.mocked(useAppStore.getState).mockReturnValue({
      items, itemsStoredInCloud: {}, updateItemsStoredInCloud,
    } as any);
    vi.mocked(diffItemsWithRemote).mockReturnValue(items as any);
    let finish!: (value: any) => void;
    vi.mocked(apiClient.post).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    let settled = false;
    const saving = saveDashboards({ withNotification: true }).then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(updateItemsStoredInCloud).not.toHaveBeenCalled();
    expect(showNotificationWithRememberMe).not.toHaveBeenCalled();
    finish({ data: {} });
    await saving;
    expect(updateItemsStoredInCloud).toHaveBeenCalledExactlyOnceWith(items);
    expect(showNotificationWithRememberMe).toHaveBeenCalledOnce();
  });

  it("should delete all dashboards", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValueOnce({
      data: { owned: { id1: {}, id2: {} } },
    });
    vi.spyOn(apiClient, "post").mockResolvedValue({});

    await deleteAllDashboards();
    expect(apiClient.post).toHaveBeenCalledWith("/pro/dash/sync", {
      items: { id1: "DELETE", id2: "DELETE" },
    });
  });

  it("should share dashboard with emails", async () => {
    vi.spyOn(apiClient, "post").mockResolvedValue({ data: { success: true } });

    const dashboardUuid = "uuid";
    const emails = "test@example.com,another@example.com";
    await shareDashboard(dashboardUuid, emails);
    expect(apiClient.post).toHaveBeenCalledWith(`/pro/dash/${dashboardUuid}/share`, {
      shares: {
        "test@example.com": "view",
        "another@example.com": "view",
      },
    });
  });

  it("should delete dashboard share for given emails", async () => {
    vi.spyOn(apiClient, "delete").mockResolvedValue({ data: {} });

    const dashboardUuid = "uuid";
    const emails = ["test@example.com", "another@example.com"];
    await deleteDashboardShare(dashboardUuid, emails);
    expect(apiClient.delete).toHaveBeenCalledWith(`/pro/dash/${dashboardUuid}/share`, {
      data: { shares: emails },
    });
  });

  it("should get dashboard share users", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue({ data: {} });

    const dashboardUuid = "uuid";
    await getDashboardShareUsers(dashboardUuid);
    expect(apiClient.get).toHaveBeenCalledWith(
      `/pro/dash/${dashboardUuid}/shares/users`,
    );
  });
});
