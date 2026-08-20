import React, { useEffect, lazy, Suspense } from "react";
import { createBrowserRouter, useNavigate } from "react-router";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/AppContext";

import Layout from "./components/Layout";
import ErrorPage from "./pages/ErrorPage";
import ErrorBoundary from "./components/ErrorBoundary";
import { lazyRetry } from "./utils/lazyRetry";
import { Loader2, Zap } from "lucide-react";

import logo from "../assets/Media.png";
// Lazy load route pages
const DashboardPage = lazy(lazyRetry(() => import("./pages/DashboardPage")));
const LeadsPage = lazy(lazyRetry(() => import("./pages/LeadsPage")));
const SalesPage = lazy(lazyRetry(() => import("./pages/SalesPage")));
const AnalysisPage = lazy(lazyRetry(() => import("./pages/AnalysisPage")));
const SupportPage = lazy(lazyRetry(() => import("./pages/SupportPage")));
const SettingsPage = lazy(lazyRetry(() => import("./pages/SettingsPage")));
const LoginPage = lazy(lazyRetry(() => import("./pages/LoginPage")));
const AdminPage = lazy(lazyRetry(() => import("./pages/AdminPage")));
const PaymentSuccess = lazy(lazyRetry(() => import("./pages/PaymentSuccess")));
const PaymentFailure = lazy(lazyRetry(() => import("./pages/PaymentFailure")));
const BillingPage = lazy(lazyRetry(() => import("./pages/BillingPage")));
const ForgotPasswordPage = lazy(lazyRetry(() => import("./pages/ForgotPasswordPage")));
const ResetPasswordPage = lazy(lazyRetry(() => import("./pages/ResetPasswordPage")));
const AcceptInvitePage = lazy(lazyRetry(() => import("./pages/AcceptInvitePage")));


function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="text-6xl mb-4">🔍</div>
      <h1 className="text-slate-800 mb-2">Page Not Found</h1>
      <p className="text-sm text-slate-500">The page you're looking for doesn't exist.</p>
    </div>
  );
}

// Auth loading screen
function AuthLoadingScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0A0F1E] via-[#0D1530] to-[#0A0F1E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 animate-pulse">
          <img
  src={logo}
  alt="Logo"
  className="h-8 w-8 object-contain"
/>
       </div>
        <div className="text-center">
          <div className="text-white font-semibold text-lg">Vigozen CRM — Transforming Customer Relationships.</div>
          <div className="text-indigo-300 text-sm mt-1">Loading your workspace...</div>
        </div>
        <Loader2 size={20} className="text-indigo-400 animate-spin mt-2" />
      </div>
    </div>
  );
}

// Helper to wrap lazy-loaded components with Suspense
function LazyRoute({ Component }: { Component: React.ComponentType<any> }) {
  return (
    <ErrorBoundary
      resetKeys={[window.location.pathname]}
      fallback={
        <div className="p-8 text-center">
          <p className="text-slate-500">Failed to load this page. Please try again.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      }
      onError={(error, errorInfo) => {
        console.error('Route error:', error, errorInfo);
      }}
    >
      <Suspense fallback={<AuthLoadingScreen />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

import { usePermissions } from "./hooks/usePermissions";

// Guard: admin only
function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { authLoading } = useApp();
  const { canOpenAdminPanel } = usePermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !canOpenAdminPanel) {
      navigate("/", { replace: true });
    }
  }, [authLoading, canOpenAdminPanel]);

  if (authLoading) return null;
  if (!canOpenAdminPanel) return null;
  return <>{children}</>;
}

// Guard: redirect to /login if not authenticated
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}

// Guard: redirect to / if already authenticated (for login page)
function RequireGuest({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [authLoading, isAuthenticated]);

  if (authLoading) return <AuthLoadingScreen />;
  if (isAuthenticated) return null;
  return <>{children}</>;
}

// Guard: redirect to /billing if subscription expired
function RequireSubscription({ children }: { children: React.ReactNode }) {
  const { authLoading, isAuthenticated, subscription, subscriptionLoading } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !subscriptionLoading && isAuthenticated && subscription) {
      const isExpired = !subscription.is_trial_active && !subscription.is_subscription_active;
      if (isExpired) {
        navigate("/billing", { replace: true });
      }
    }
  }, [authLoading, subscriptionLoading, isAuthenticated, subscription]);

  if (authLoading || subscriptionLoading) return <AuthLoadingScreen />;
  if (!isAuthenticated) return null;
  if (subscription && !subscription.is_trial_active && !subscription.is_subscription_active) return null;
  return <>{children}</>;
}

// Root with app provider + auth guard
function Root() {
  return (
    <AppProvider>
      <RequireAuth>
        <Layout />
      </RequireAuth>
    </AppProvider>
  );
}

// Login wrapper (guest only)
function LoginWrapper() {
  return (
    <AppProvider>
      <RequireGuest>
        <LazyRoute Component={LoginPage} />
      </RequireGuest>
    </AppProvider>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: LoginWrapper,
    errorElement: <ErrorPage />,
  },
  {
    path: "/forgot-password",
    Component: () => (
      <AppProvider>
        <RequireGuest>
          <LazyRoute Component={ForgotPasswordPage} />
        </RequireGuest>
      </AppProvider>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: "/reset-password",
    Component: () => (
      <AppProvider>
        <LazyRoute Component={ResetPasswordPage} />
      </AppProvider>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: "/accept-invite",
    Component: () => (
      <AppProvider>
        <LazyRoute Component={AcceptInvitePage} />
      </AppProvider>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: "/payment-success",
    Component: () => <LazyRoute Component={PaymentSuccess} />,
    errorElement: <ErrorPage />,
  },
  {
    path: "/payment-failure",
    Component: () => <LazyRoute Component={PaymentFailure} />,
    errorElement: <ErrorPage />,
  },
  // ── BILLING ROUTE ──
  {
    path: "/billing",
    Component: () => (
      <AppProvider>
        <RequireAuth>
          <LazyRoute Component={BillingPage} />
        </RequireAuth>
      </AppProvider>
    ),
    errorElement: <ErrorPage />,
  },
  {
    path: "/",
    Component: Root,
    errorElement: <ErrorPage />,
    children: [
      {
        index: true,
        Component: () => (
          <RequireSubscription>
            <LazyRoute Component={DashboardPage} />
          </RequireSubscription>
        ),
        errorElement: <ErrorPage />,
      },
      {
        path: "leads",
        errorElement: <ErrorPage />,
        Component: () => (
          <RequireSubscription>
            <LazyRoute Component={LeadsPage} />
          </RequireSubscription>
        )
      },
      {
        path: "sales",
        errorElement: <ErrorPage />,
        Component: () => (
          <RequireSubscription>
            <LazyRoute Component={SalesPage} />
          </RequireSubscription>
        )
      },

      {
        path: "analysis",
        errorElement: <ErrorPage />,
        Component: () => (
          <RequireSubscription>
            <LazyRoute Component={AnalysisPage} />
          </RequireSubscription>
        )
      },
      // Help and Settings - No subscription required
      {
        path: "help",
        Component: () => <LazyRoute Component={SupportPage} />,
        errorElement: <ErrorPage />,
      },
      {
        path: "settings",
        Component: () => <LazyRoute Component={SettingsPage} />,
        errorElement: <ErrorPage />,
      },
      // Admin - Admin only
      {
        path: "admin",
        Component: () => (
          <RequireAdmin>
            <LazyRoute Component={AdminPage} />
          </RequireAdmin>
        ),
      },
      { path: "*", Component: () => <LazyRoute Component={NotFound} />, errorElement: <ErrorPage /> },
    ],
  },
]);
