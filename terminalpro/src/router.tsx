import posthog from "posthog-js";
import {
  Fragment,
  lazy,
  memo,
  type ReactNode,
  Suspense,
  useEffect,
  useMemo,
} from "react";
import { createBrowserRouter, Link, Navigate, useRouteError } from "react-router-dom";
import Icon from "~/components/Icon";
import { useMcpAuthHandler } from "./components/AI/hooks/mcp/onMcpAuth";
import AuthWelcome from "./components/LayoutAuth/AuthWelcome";
import { getEnabledIdentityProviders } from "./lib/onPremFeatureFlags";
import { useShallowAuthStore } from "./lib/state/auth";

// Route-level lazy loading
const WidgetsBuilder = lazy(
  () => import("./components/DataConnectors/WidgetsBuilder/WidgetsBuilder"),
);
const Setup2FA = lazy(() => import("./routes/2fa"));
const AppsPage = lazy(() => import("./routes/Apps"));
const AuthedAppNotFound = lazy(() => import("./routes/AuthedAppNotFound"));
const AdminHome = lazy(() => import("./routes/admin"));
const AdminAccountSettings = lazy(() => import("./routes/admin/account"));
const AdminApps = lazy(() => import("./routes/admin/apps"));
const AdminGroups = lazy(() => import("./routes/admin/roles"));
const AdminMarketplace = lazy(() => import("./routes/admin/marketplace"));

const AdminThemeSettings = lazy(() => import("./routes/admin/themeSettings"));
const AdminUsers = lazy(() => import("./routes/admin/users"));
const AILibrary = lazy(() => import("./routes/aiLibrary"));
const MenuHomePage = lazy(() => import("./routes/appHome"));
const BookingPage = lazy(() => import("./routes/booking"));
const ConnectionsPage = lazy(() => import("./routes/Connections"));
const DeveloperOnboardingHomepage = lazy(
  () => import("./routes/developer_onboarding/DeveloperOnboardingHomepage"),
);
const Ds = lazy(() => import("./routes/ds"));
const ForgotPasswordPage = lazy(() => import("./routes/forgotPassword"));
const ForgotPasswordConfirmationPage = lazy(
  () => import("./routes/forgotPasswordConfirmation"),
);
const HomePage = lazy(() => import("./routes/home"));
const LoginPage = lazy(() => import("./routes/login"));
const DataConnectors = lazy(() => import("./routes/newDataConnectors"));
const NewsPage = lazy(() => import("./routes/news"));
const RegisterPage = lazy(() => import("./routes/register"));
const Settings = lazy(() => import("./routes/settings"));
const TabPage = lazy(() => import("./routes/tab"));
const TOSPage = lazy(() => import("./routes/tos"));

const LayoutAdmin = lazy(() => import("./components/LayoutAdmin"));
const LayoutUnauth = lazy(() => import("./components/LayoutUnauth"));
const App = lazy(() => import("./components/LayoutAuth"));
const RootLayout = lazy(() => import("./components/RootLayout"));

const MsalTokenRefresh = lazy(() => import("./components/MsalTokenRefresh"));

function OAuthCallback() {
  const handleMcpAuthorization = useMcpAuthHandler();

  useEffect(() => {
    handleMcpAuthorization();
  }, [handleMcpAuthorization]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center text-light-900 dark:text-light-50">
        Authenticating… this window will close.
      </div>
    </div>
  );
}

export function ErrorElement() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center text-light-900 dark:text-light-50">
        <Icon id="warning-icon" className="mx-auto h-10 w-10" />
        <h1 className="mt-4 text-lg font-bold uppercase tracking-wide">
          An error occurred
        </h1>
        <p className="mb-10 mt-2.5 text-xl">Something went wrong.</p>
        <Link to="/" className="obb-btn-tertiary h-10 text-sm">
          Go back home
        </Link>
      </div>
    </div>
  );
}

function RouterErrorElement() {
  const error = useRouteError() as Error;
  if (posthog) {
    posthog.capture("Error_critical", {
      error: {
        error: error?.stack,
      },
    });
  }
  return <ErrorElement />;
}

const AuthGuard = memo(({ children }: { children?: ReactNode }) => {
  const needsOnboarding = useShallowAuthStore(
    (s) => s.user?.token && s.needsOnboarding,
  );

  return useMemo(() => {
    const Wrapper = getEnabledIdentityProviders().includes("microsoft")
      ? MsalTokenRefresh
      : Fragment;

    return needsOnboarding ? null : (
      <Fragment key="auth-guard">
        <AuthWelcome key="auth-welcome" />
        <Suspense fallback={null}>
          <Wrapper key="auth-wrapper">
            <S children={<App key="app">{children}</App>} />
          </Wrapper>
        </Suspense>
      </Fragment>
    );
  }, [needsOnboarding, children]);
});

const S = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

export const router = createBrowserRouter([
  {
    path: "/oauth",
    element: <S children={<LayoutUnauth />} />,
    errorElement: <RouterErrorElement />,
    children: [{ path: "callback", element: <OAuthCallback />, id: "oauth-callback" }],
  },
  {
    path: "/",
    element: <S children={<RootLayout />} />,
    errorElement: <RouterErrorElement />,
    children: [
      {
        path: "/",
        element: <S children={<LayoutUnauth />} />,
        children: [
          {
            index: true,
            element: <S children={<HomePage />} />,
            id: "home",
          },
          {
            path: "login",
            element: <S children={<LoginPage />} />,
            id: "login",
          },
          {
            path: "register",
            element: <S children={<RegisterPage />} />,
            id: "register",
          },
          {
            path: "terms-of-service",
            element: <S children={<TOSPage />} />,
            id: "terms-of-service",
          },
          {
            path: "booking",
            element: <S children={<BookingPage />} />,
            id: "booking",
          },
          {
            path: "forgot-password",
            element: <S children={<ForgotPasswordPage />} />,
            id: "forgot-password",
          },
          {
            path: "forgot-password-confirmation",
            element: <S children={<ForgotPasswordConfirmationPage />} />,
            id: "forgot-password-confirmation",
          },
          {
            path: "onboarding",
            element: <S children={<DeveloperOnboardingHomepage />} />,
            id: "onboarding",
          },
          {
            path: "developer-onboarding",
            element: <Navigate to="/onboarding" />,
            id: "developer-onboarding",
          },
        ],
      },
      {
        path: "/2fa",
        element: <S children={<Setup2FA />} />,
      },
      {
        path: "/app",
        element: <AuthGuard />,
        children: [
          {
            path: "ds",
            element: <S children={<Ds />} />,
          },
          { path: "data-connectors", element: <Navigate to="/app" /> },
          {
            path: "",
            element: <S children={<AppsPage />} />,
          },
          {
            path: "marketplace/:appSlug",
            element: <S children={<AppsPage />} />,
          },
          {
            path: "help-documentation",
            element: <S children={<MenuHomePage />} />,
            id: "app-help-documentation",
          },
          {
            path: ":id",
            element: <S children={<TabPage />} />,
            id: "app-tab",
          },
          {
            path: "news",
            element: <S children={<NewsPage />} />,
            id: "app-news",
          },
          {
            path: "data-connectors",
            element: <Navigate to="/app/widgets" />,
            id: "app-data-connectors",
          },
          {
            path: "widget-studio",
            element: <S children={<WidgetsBuilder />} />,
            id: "app-widget-studio",
          },
          {
            path: "widgets",
            element: <S children={<DataConnectors />} />,
            id: "app-widgets",
          },
          {
            path: "ai",
            element: <S children={<AILibrary />} />,
            id: "app-ai",
          },
          {
            path: "prompt-library",
            element: <Navigate to="/app/ai?tab=prompts" />,
            id: "app-prompt-library",
          },
          {
            path: "prompts",
            element: <Navigate to="/app/ai?tab=prompts" />,
            id: "app-prompts",
          },
          {
            path: "settings",
            element: <S children={<Settings />} />,
            id: "app-settings",
          },
          {
            path: "connections",
            element: <S children={<ConnectionsPage />} />,
            id: "app-connections",
          },

          {
            path: "*",
            element: <S children={<AuthedAppNotFound />} />,
          },
        ],
      },
      {
        path: "/admin",
        element: <S children={<LayoutAdmin />} />,
        children: [
          {
            index: true,
            element: <S children={<AdminHome />} />,
            id: "admin-homepage",
          },
          {
            path: "users",
            element: <S children={<AdminUsers />} />,
            id: "admin-users",
          },
          {
            path: "roles",
            element: <S children={<AdminGroups />} />,
            id: "admin-roles",
          },
          {
            path: "apps",
            element: <S children={<AdminApps />} />,

            id: "admin-apps",
          },
          {
            path: "marketplace",
            element: <S children={<AdminMarketplace />} />,
            id: "admin-marketplace",
          },
          {
            path: "theme-settings",
            element: <S children={<AdminThemeSettings />} />,
            id: "admin-theme-settings",
          },
          {
            path: "account",
            element: <S children={<AdminAccountSettings />} />,
            id: "admin-account",
          },
        ],
      },
    ],
  },
]);
