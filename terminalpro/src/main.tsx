import { ErrorElement, router } from "./router";
import "@jose-donato/react-grid-layout/css/styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { setupCommunityModules } from "ag-charts-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import queryClient from "./queryClient";
import "react-resizable/css/styles.css";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { PostHogProvider } from "posthog-js/react";
import { ErrorBoundary } from "react-error-boundary";
import { setGlobalGridOptions } from "./components/General/Table/AgGrid";
import {
  inSnowflakeNativeApp,
  TOOLTIP_OPEN_DELAY_MS,
  TOOLTIP_SKIP_DELAY_MS,
} from "./lib/constants";
import { getEnabledIdentityProviders } from "./lib/onPremFeatureFlags";
import { getConfig } from "./lib/runtimeConfig";
import { useShallowThemeStore } from "./lib/state/theme";
import {
  applyBrandColors,
  applyFontFamily,
  applyWhiteLabelMeta,
} from "./utils/colorUtils";

// Auth provider lazy loading — only loads SDK when the provider is enabled
const LazyMsalProvider = lazy(() => import("./providers/MsalProviderWrapper"));
const LazyOktaProvider = lazy(() => import("./providers/OktaProviderWrapper"));
const LazyGoogleProvider = lazy(() => import("./providers/GoogleProviderWrapper"));

const TooltipProvider = lazy(() =>
  import("./components/Tooltip").then((mod) => ({ default: mod.TooltipProvider })),
);

// Conditionally load react-scan for render scanning (stays build-time: dev-only tool)
if (
  typeof window !== "undefined" &&
  import.meta.env.VITE_ENABLE_RENDER_SCANNING === "true"
) {
  const script = document.createElement("script");
  script.src = "//unpkg.com/react-scan/dist/auto.global.js";
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
}

ModuleRegistry.registerModules([AllCommunityModule]);
setupCommunityModules();

setGlobalGridOptions();

const AUTH_WRAPPERS = {
  microsoft: LazyMsalProvider,
  okta: LazyOktaProvider,
  google: LazyGoogleProvider,
} as const;

function Root() {
  const setTheme = useShallowThemeStore((state) => state.setTheme);

  const enabledProviders = useMemo(() => getEnabledIdentityProviders(), []);

  const RootContent = useMemo(() => {
    const content = (
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <TooltipProvider
            delayDuration={TOOLTIP_OPEN_DELAY_MS}
            skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}
          >
            <RouterProvider router={router} />
          </TooltipProvider>
        </Suspense>
      </QueryClientProvider>
    );
    return enabledProviders.reduce((content, provider) => {
      const Comp = AUTH_WRAPPERS[provider];
      return <Comp key={`${provider}-wrapper`}>{content}</Comp>;
    }, content);
  }, [enabledProviders]);

  useEffect(() => {
    const defaultTheme = getConfig().ui.defaultTheme || "dark";
    const localTheme = window.localStorage.getItem("theme") ?? defaultTheme;
    const theme = ["light", "dark"].includes(localTheme) ? localTheme : defaultTheme;
    setTheme(theme as "light" | "dark");
  }, []);

  return <Suspense fallback={null}>{RootContent}</Suspense>;
}

if ("serviceWorker" in navigator) {
  registerSW({ immediate: true });
}

function bootstrap() {
  const config = getConfig();

  // Apply branding from runtime config
  if (config.whiteLabel.mainColor) {
    applyBrandColors(config.whiteLabel.mainColor);
  }
  if (config.whiteLabel.fontFamily) {
    applyFontFamily(config.whiteLabel.fontFamily);
  }

  // Override HTML meta tags from runtime config (no SEO needed for on-prem)
  applyWhiteLabelMeta(config.whiteLabel);

  if (inSnowflakeNativeApp) {
    const snowflakeFavicon = "/favicon/snowflake-favicon.png";
    document.querySelector('link[rel="icon"]')?.setAttribute("href", snowflakeFavicon);
    document
      .querySelector('link[rel="apple-touch-icon"]')
      ?.setAttribute("href", snowflakeFavicon);
    console.log("[bootstrap] Snowflake favicon override applied");
  }

  const root = createRoot(document.getElementById("root") as HTMLElement);
  root.render(
    <ErrorBoundary
      FallbackComponent={ErrorElement}
      onError={(error) => {
        console.error(error);
      }}
    >
      {config.services.posthog ? (
        <PostHogProvider
          apiKey={config.analytics.posthogKey}
          options={{
            api_host: config.analytics.posthogUrl,
            ui_host: "app.posthog.com",
            session_recording: {
              maskAllInputs: true,
              maskInputFn: (text, element: HTMLElement | { attributes: any }) => {
                if (
                  element?.attributes?.name?.value === "password" ||
                  element?.attributes?.name?.value === "Password" ||
                  element?.attributes?.id?.value === "api-key"
                ) {
                  return "*".repeat(text.length);
                }
                return text;
              },
              maskInputOptions: {
                password: true,
              },
            },
          }}
        >
          <Root />
          <div id="dropdown-portal" />
        </PostHogProvider>
      ) : (
        <>
          <Root />
          <div id="dropdown-portal" />
        </>
      )}
    </ErrorBoundary>,
  );
}

bootstrap();
